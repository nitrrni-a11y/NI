import os
import time
import random
import re
from collections import deque
from threading import Lock
from typing import Optional
from dotenv import load_dotenv

from app.pipeline.cancellation import cancellation_manager
from app.pipeline.metrics import metrics_collector

load_dotenv()

_client = None

def get_gemini_client():
    global _client
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not found. Please add it to your .env file.")
    if _client is None or getattr(_client, "_cached_api_key", None) != api_key:
        from google import genai
        _client = genai.Client(api_key=api_key)
        _client._cached_api_key = api_key
    return _client

# Gemini Rate Limiting configuration (configurable via environment variables)
def get_gemini_max_rpm() -> int:
    return int(os.getenv("GEMINI_MAX_RPM", "15"))

def get_gemini_rate_window() -> int:
    return int(os.getenv("GEMINI_RATE_WINDOW", "60"))

# Dedicated rate-limiting state for Gemini (never mixed with Groq or other providers)
_gemini_request_times = deque()
_gemini_rate_lock = Lock()


def wait_for_rate_limit(run_id: Optional[str] = None) -> float:
    """
    Sliding window rate-limiter for Gemini API requests.
    Returns the total seconds spent waiting.
    Supports responsive cancellation checks during wait loops.
    """
    total_waited = 0.0
    max_rpm = get_gemini_max_rpm()
    window = get_gemini_rate_window()

    while True:
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        with _gemini_rate_lock:
            now = time.time()

            while _gemini_request_times and now - _gemini_request_times[0] >= window:
                _gemini_request_times.popleft()

            if len(_gemini_request_times) < max_rpm:
                _gemini_request_times.append(now)
                return total_waited

            wait_time = max(0.5, window - (now - _gemini_request_times[0]) + 0.1)

        print(
            f"[RateLimiter] Gemini RPM limit ({max_rpm}/{window}s) approached ({len(_gemini_request_times)} active). "
            f"Waiting {wait_time:.1f}s for sliding window..."
        )

        end_time = time.time() + wait_time
        while time.time() < end_time:
            if run_id:
                cancellation_manager.check_cancelled(run_id)
            sleep_chunk = min(0.25, max(0.01, end_time - time.time()))
            time.sleep(sleep_chunk)
            total_waited += sleep_chunk


def _sanitize_error(error_text: str) -> str:
    sanitized = re.sub(r'AIza[0-9A-Za-z-_]{35}', '[REDACTED_API_KEY]', error_text)
    sanitized = re.sub(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'Bearer [REDACTED_TOKEN]', sanitized)
    return sanitized


def _extract_retry_after(error: Exception) -> Optional[float]:
    """
    Attempts to extract provider Retry-After duration from HTTP response headers or message.
    """
    # 1. Check response headers if present on error object
    resp = getattr(error, "response", None)
    if resp is not None:
        headers = getattr(resp, "headers", None)
        if headers:
            retry_val = headers.get("retry-after") or headers.get("Retry-After")
            if retry_val:
                try:
                    return float(retry_val)
                except ValueError:
                    pass

    # 2. Check for patterns in error text (e.g., 'Please retry after 12.5s' or 'retry in 10 seconds')
    error_str = str(error)
    patterns = [
        r'(?:retry|wait)[-\s]*(?:after|in)?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds)?',
        r'try\s+again\s+in\s+(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds)?',
        r'resource has been exhausted.*?(\d+(?:\.\d+)?)\s*s'
    ]
    for pat in patterns:
        m = re.search(pat, error_str, re.IGNORECASE)
        if m:
            try:
                val = float(m.group(1))
                if 0.5 <= val <= 120.0:
                    return val
            except ValueError:
                pass
    return None


def generate_with_retry(
    client,
    model,
    contents,
    config=None,
    max_retries: Optional[int] = None,
    run_id: Optional[str] = None,
    stage_name: str = "Gemini-Call",
    items_count: int = 1
):
    """
    Invokes Gemini LLM with per-request sliding window rate limiting, responsive cancellation checks,
    exponential backoff with jitter, Retry-After header awareness, and performance metrics tracking.
    """
    if max_retries is None:
        max_retries = int(os.getenv("GEMINI_MAX_RETRIES", "3"))

    if config is None:
        from google.genai import types
        config = types.GenerateContentConfig(temperature=0.1)

    total_wait_duration = 0.0
    retries_occurred = 0

    for attempt in range(max_retries + 1):
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        # Rate limiting applied per actual API request (batches count as ONE API call)
        wait_s = wait_for_rate_limit(run_id)
        total_wait_duration += wait_s

        if run_id:
            cancellation_manager.check_cancelled(run_id)

        t_start = time.time()
        try:
            print(f"[AI-Call] Model: {model} | Stage: {stage_name} | Items: {items_count} | Attempt: {attempt + 1}/{max_retries + 1} | Invoking...")
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
            elapsed = time.time() - t_start
            print(f"[AI-Call] Model: {model} | Stage: {stage_name} | Attempt: {attempt + 1} | SUCCESS in {elapsed:.2f}s")

            # Extract token counts if provided by Google GenAI SDK
            usage = getattr(response, "usage_metadata", None)
            p_tokens = getattr(usage, "prompt_token_count", 0) or 0
            c_tokens = getattr(usage, "candidates_token_count", 0) or 0

            metrics_collector.record_stage_call(
                stage_name=stage_name,
                provider="Gemini",
                model=model,
                items_count=items_count,
                requests_count=1,
                duration=elapsed,
                rate_limit_wait=total_wait_duration,
                retries=retries_occurred,
                prompt_tokens=p_tokens,
                completion_tokens=c_tokens,
                successful_items=items_count,
                failed_items=0,
                run_id=run_id
            )

            return response

        except Exception as e:
            elapsed = time.time() - t_start
            error_text = str(e)
            sanitized_error = _sanitize_error(error_text)

            status_code = (
                getattr(e, "code", None)
                or getattr(e, "status_code", None)
            )

            print("\n========== GEMINI API ERROR ==========")
            print(f"Model: {model} | Stage: {stage_name}")
            print(f"Attempt: {attempt + 1}/{max_retries + 1} (after {elapsed:.2f}s)")
            print(f"Exception type: {type(e).__name__}")
            print(f"HTTP status: {status_code or 'Not available'}")
            print(f"Sanitized error: {sanitized_error}")
            print("========================================")

            # Classify Non-retryable errors
            is_non_retryable = (
                status_code in [400, 401, 403, 404]
                or "INVALID_ARGUMENT" in error_text
                or "PERMISSION_DENIED" in error_text
                or "UNAUTHENTICATED" in error_text
                or "API_KEY_INVALID" in error_text
            )
            if is_non_retryable:
                print(f"[AI-Call] Non-retryable client/auth error encountered. Failing fast.")
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Gemini",
                    model=model,
                    items_count=items_count,
                    requests_count=1,
                    duration=elapsed,
                    rate_limit_wait=total_wait_duration,
                    retries=retries_occurred,
                    prompt_tokens=0,
                    completion_tokens=0,
                    successful_items=0,
                    failed_items=items_count,
                    run_id=run_id
                )
                raise

            # Classify Rate limit / Quota errors
            is_rate_limit = (
                status_code == 429
                or "429" in error_text
                or "RESOURCE_EXHAUSTED" in error_text
            )

            # Classify Temporary server errors
            is_server_error = (
                status_code in [500, 502, 503, 504]
                or "500" in error_text
                or "502" in error_text
                or "503" in error_text
                or "504" in error_text
                or "UNAVAILABLE" in error_text
                or "INTERNAL" in error_text
                or "BAD_GATEWAY" in error_text
            )

            # Classify Network connection / timeout errors
            is_network_timeout = (
                "timeout" in error_text.lower()
                or "timed out" in error_text.lower()
                or "connection error" in error_text.lower()
                or "connection reset" in error_text.lower()
                or "remotedisconnected" in error_text.lower()
            )

            if not is_rate_limit and not is_server_error and not is_network_timeout:
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Gemini",
                    model=model,
                    items_count=items_count,
                    requests_count=1,
                    duration=elapsed,
                    rate_limit_wait=total_wait_duration,
                    retries=retries_occurred,
                    prompt_tokens=0,
                    completion_tokens=0,
                    successful_items=0,
                    failed_items=items_count,
                    run_id=run_id
                )
                raise

            if attempt == max_retries:
                print(f"[AI-Call] Model: {model} | All {max_retries} retries exhausted.")
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Gemini",
                    model=model,
                    items_count=items_count,
                    requests_count=1,
                    duration=elapsed,
                    rate_limit_wait=total_wait_duration,
                    retries=retries_occurred,
                    prompt_tokens=0,
                    completion_tokens=0,
                    successful_items=0,
                    failed_items=items_count,
                    run_id=run_id
                )
                raise

            retries_occurred += 1

            # Respect Retry-After if available from provider
            retry_after = _extract_retry_after(e)
            if retry_after is not None and retry_after > 0:
                wait_time = min(60.0, retry_after + random.uniform(0.1, 0.5))
                err_type = f"Rate limit (429) [Provider Retry-After: {retry_after:.1f}s]"
            elif is_rate_limit:
                base = 4.0 * (2 ** attempt)
                jitter = random.uniform(0.5, 1.5)
                wait_time = min(30.0, base + jitter)
                err_type = "Rate limit (429)"
            else:
                base = 1.5 * (2 ** attempt)
                jitter = random.uniform(0.2, 0.8)
                wait_time = min(15.0, base + jitter)
                err_type = "Server / Network error"

            print(
                f"[AI-Call] Model: {model} | Stage: {stage_name} | {err_type}. "
                f"Retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})"
            )

            retry_end = time.time() + wait_time
            while time.time() < retry_end:
                if run_id:
                    cancellation_manager.check_cancelled(run_id)
                time.sleep(min(0.25, max(0.01, retry_end - time.time())))
