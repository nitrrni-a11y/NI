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

def get_groq_client():
    global _client
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not found. Please add it to your .env file.")
    if _client is None or getattr(_client, "_cached_api_key", None) != api_key:
        from groq import Groq
        _client = Groq(api_key=api_key)
        _client._cached_api_key = api_key
    return _client

def get_groq_max_rpm() -> int:
    return int(os.getenv("GROQ_MAX_RPM", "30"))

def get_groq_rate_window() -> int:
    return int(os.getenv("GROQ_RATE_WINDOW", "60"))

# Dedicated rate-limiting state for Groq (isolated from Gemini)
_groq_request_times = deque()
_groq_rate_lock = Lock()


def wait_for_groq_rate_limit(run_id: Optional[str] = None) -> float:
    """
    Sliding window rate-limiter for Groq API requests.
    Returns the total seconds spent waiting.
    Supports responsive cancellation checks.
    """
    total_waited = 0.0
    max_rpm = get_groq_max_rpm()
    window = get_groq_rate_window()

    while True:
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        with _groq_rate_lock:
            now = time.time()
            while _groq_request_times and now - _groq_request_times[0] >= window:
                _groq_request_times.popleft()

            if len(_groq_request_times) < max_rpm:
                _groq_request_times.append(now)
                return total_waited

            wait_time = max(0.5, window - (now - _groq_request_times[0]) + 0.1)

        print(
            f"[RateLimiter] Groq RPM limit ({max_rpm}/{window}s) approached ({len(_groq_request_times)} active). "
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
    sanitized = re.sub(r'gsk_[0-9A-Za-z]{30,}', '[REDACTED_GROQ_KEY]', error_text)
    sanitized = re.sub(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'Bearer [REDACTED_TOKEN]', sanitized)
    return sanitized


def _extract_retry_after(error: Exception) -> Optional[float]:
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

    error_str = str(error)
    patterns = [
        r'(?:retry|wait)[-\s]*(?:after|in)?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds)?',
        r'try again in (\d+(?:\.\d+)?)s'
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


def groq_chat_completion_with_retry(
    client,
    messages,
    model=None,
    response_format=None,
    temperature=0.1,
    max_retries: Optional[int] = None,
    timeout=20.0,
    run_id: Optional[str] = None,
    stage_name: str = "Groq-Topic-Assignment",
    items_count: int = 1
):
    if not model:
        model = os.getenv("GROQ_TOPIC_MODEL", "llama-3.1-8b-instant")

    if max_retries is None:
        max_retries = int(os.getenv("GROQ_MAX_RETRIES", "3"))

    total_wait_duration = 0.0
    retries_occurred = 0

    for attempt in range(max_retries + 1):
        if run_id:
            cancellation_manager.check_cancelled(run_id)

        # Rate limiting applied per actual Groq API request
        wait_s = wait_for_groq_rate_limit(run_id)
        total_wait_duration += wait_s

        if run_id:
            cancellation_manager.check_cancelled(run_id)

        t_start = time.time()
        try:
            print(f"[Groq-Call] Model: {model} | Stage: {stage_name} | Attempt: {attempt + 1}/{max_retries + 1} | Invoking...")
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "timeout": timeout
            }
            if response_format:
                kwargs["response_format"] = response_format

            response = client.chat.completions.create(**kwargs)
            elapsed = time.time() - t_start
            print(f"[Groq-Call] Model: {model} | Stage: {stage_name} | Attempt: {attempt + 1} | SUCCESS in {elapsed:.2f}s")

            # Extract usage tokens if available
            usage = getattr(response, "usage", None)
            p_tokens = getattr(usage, "prompt_tokens", 0) or 0
            c_tokens = getattr(usage, "completion_tokens", 0) or 0

            metrics_collector.record_stage_call(
                stage_name=stage_name,
                provider="Groq",
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

            status_code = getattr(e, "status_code", None) or getattr(e, "code", None)

            print("\n========== GROQ API ERROR ==========")
            print(f"Model: {model} | Stage: {stage_name}")
            print(f"Attempt: {attempt + 1}/{max_retries + 1} (after {elapsed:.2f}s)")
            print(f"Exception type: {type(e).__name__}")
            print(f"HTTP status: {status_code or 'Not available'}")
            print(f"Sanitized error: {sanitized_error}")
            print("====================================")

            # Non-retryable
            is_non_retryable = (
                status_code in [400, 401, 403, 404]
                or "invalid_request_error" in error_text
                or "model_not_found" in error_text
                or "model_decommissioned" in error_text
                or "authentication_error" in error_text
                or "permission_denied" in error_text
            )
            if is_non_retryable:
                print(f"[Groq-Call] Non-retryable error encountered for model '{model}'. Failing fast.")
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Groq",
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

            # Rate limits (429)
            is_rate_limit = status_code == 429 or "rate_limit_exceeded" in error_text or "429" in error_text

            # Server errors (500, 502, 503, 504)
            is_server_error = status_code in [500, 502, 503, 504] or "server_error" in error_text

            # Network timeouts
            is_timeout = (
                "timeout" in error_text.lower()
                or "timed out" in error_text.lower()
                or "connection error" in error_text.lower()
            )

            if not is_rate_limit and not is_server_error and not is_timeout:
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Groq",
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
                print(f"[Groq-Call] Model: {model} | All {max_retries} retries exhausted.")
                metrics_collector.record_stage_call(
                    stage_name=stage_name,
                    provider="Groq",
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

            retry_after = _extract_retry_after(e)
            if retry_after is not None and retry_after > 0:
                wait_time = min(60.0, retry_after + random.uniform(0.1, 0.5))
                err_type = f"Rate limit (429) [Provider Retry-After: {retry_after:.1f}s]"
            elif is_rate_limit:
                base = 2.0 * (2 ** attempt)
                jitter = random.uniform(0.2, 0.8)
                wait_time = min(15.0, base + jitter)
                err_type = "Rate limit (429)"
            else:
                base = 1.0 * (2 ** attempt)
                jitter = random.uniform(0.1, 0.5)
                wait_time = min(10.0, base + jitter)
                err_type = "Server / Network error"

            print(f"[Groq-Call] Model: {model} | Stage: {stage_name} | {err_type}. Retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})")

            retry_end = time.time() + wait_time
            while time.time() < retry_end:
                if run_id:
                    cancellation_manager.check_cancelled(run_id)
                time.sleep(min(0.25, max(0.01, retry_end - time.time())))
