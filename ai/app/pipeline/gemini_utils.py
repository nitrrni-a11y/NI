import os
import time
import random
import re
from collections import deque
from threading import Lock
from dotenv import load_dotenv

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

MAX_RPM = 15
WINDOW = 60

_request_times = deque()
_rate_lock = Lock()


def wait_for_rate_limit():
    while True:
        with _rate_lock:
            now = time.time()

            while _request_times and now - _request_times[0] >= WINDOW:
                _request_times.popleft()

            if len(_request_times) < MAX_RPM:
                _request_times.append(now)
                return

            wait_time = max(0.5, WINDOW - (now - _request_times[0]) + 0.2)

        print(
            f"[RateLimiter] Gemini RPM limit ({MAX_RPM}/min) approached. "
            f"Waiting {wait_time:.1f}s for sliding window..."
        )

        time.sleep(wait_time)


def _sanitize_error(error_text: str) -> str:
    # Strip any potential API key patterns or authorization headers
    sanitized = re.sub(r'AIza[0-9A-Za-z-_]{35}', '[REDACTED_API_KEY]', error_text)
    sanitized = re.sub(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'Bearer [REDACTED_TOKEN]', sanitized)
    return sanitized


def generate_with_retry(
    client,
    model,
    contents,
    config=None,
    max_retries=3
):
    if config is None:
        from google.genai import types
        config = types.GenerateContentConfig(temperature=0.1)

    for attempt in range(max_retries + 1):

        wait_for_rate_limit()

        t_start = time.time()
        try:
            print(f"[AI-Call] Model: {model} | Attempt: {attempt + 1}/{max_retries + 1} | Invoking...")
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
            elapsed = time.time() - t_start
            print(f"[AI-Call] Model: {model} | Attempt: {attempt + 1} | SUCCESS in {elapsed:.2f}s")
            return response

        except Exception as e:
            elapsed = time.time() - t_start
            error_text = str(e)
            sanitized_error = _sanitize_error(error_text)

            status_code = (
                getattr(e, "code", None)
                or getattr(e, "status_code", None)
            )

            print("\n========== GEMINI / GEMMA API ERROR ==========")
            print(f"Model: {model}")
            print(f"Attempt: {attempt + 1}/{max_retries + 1} (after {elapsed:.2f}s)")
            print(f"Exception type: {type(e).__name__}")
            print(f"HTTP status: {status_code or 'Not available'}")
            print(f"Sanitized error: {sanitized_error}")
            print("==============================================")

            # Classify Non-retryable errors: client errors, authentication, invalid payload
            is_non_retryable = (
                status_code in [400, 401, 403, 404]
                or "INVALID_ARGUMENT" in error_text
                or "PERMISSION_DENIED" in error_text
                or "UNAUTHENTICATED" in error_text
                or "API_KEY_INVALID" in error_text
            )
            if is_non_retryable:
                print(f"[AI-Call] Non-retryable client/auth error encountered. Failing fast.")
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
                # Unknown unexpected exception, re-raise
                raise

            if attempt == max_retries:
                print(f"[AI-Call] Model: {model} | All {max_retries} retries exhausted.")
                raise

            # Calculate bounded exponential backoff with random jitter
            if is_rate_limit:
                # Rate limit backoff: 5s, 10s, 20s + jitter (capped at 30s)
                base = 5.0 * (2 ** attempt)
                jitter = random.uniform(0.5, 2.0)
                wait_time = min(30.0, base + jitter)
                err_type = "Rate limit (429)"
            else:
                # Transient error backoff: 2s, 4s, 8s + jitter (capped at 15s)
                base = 2.0 * (2 ** attempt)
                jitter = random.uniform(0.2, 1.0)
                wait_time = min(15.0, base + jitter)
                err_type = "Server / Network error"

            print(
                f"[AI-Call] Model: {model} | {err_type}. "
                f"Retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})"
            )

            time.sleep(wait_time)