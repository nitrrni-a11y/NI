import time
from collections import deque
from threading import Lock

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

            wait_time = WINDOW - (now - _request_times[0]) + 0.5

        print(
            f"Gemini RPM limit reached ({MAX_RPM} requests/minute). "
            f"Waiting {wait_time:.1f} seconds..."
        )

        time.sleep(wait_time)


def generate_with_retry(
    client,
    model,
    contents,
    config,
    max_retries=3
):
    for attempt in range(max_retries + 1):

        wait_for_rate_limit()

        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )

        except Exception as e:
            error_text = str(e)

            is_503 = (
                "503" in error_text or
                "UNAVAILABLE" in error_text
            )

            is_429 = (
                "429" in error_text or
                "RESOURCE_EXHAUSTED" in error_text
            )

            if not is_503 and not is_429:
                raise

            if attempt == max_retries:
                raise

            if is_429:
                wait_time = 65
                message = "rate limit"
            else:
                wait_time = 2 ** (attempt + 1)
                message = "service unavailable"

            print(
                f"Gemini {message}. "
                f"Retrying in {wait_time} seconds... "
                f"(attempt {attempt + 1}/{max_retries})"
            )

            time.sleep(wait_time)