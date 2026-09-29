import time


def generate_with_retry(client, model, contents, config, max_retries=3):
    """
    Call Gemini with automatic retry for temporary 503 errors.

    Retry delays:
    1st retry -> 2 seconds
    2nd retry -> 4 seconds
    3rd retry -> 8 seconds
    """

    for attempt in range(max_retries + 1):
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )

        except Exception as e:
            error_text = str(e)

            # Retry only for temporary service-unavailable errors
            if "503" not in error_text and "UNAVAILABLE" not in error_text:
                raise

            if attempt == max_retries:
                raise

            wait_time = 2 ** (attempt + 1)

            print(
                f"Gemini temporarily unavailable. "
                f"Retrying in {wait_time} seconds... "
                f"(attempt {attempt + 1}/{max_retries})"
            )

            time.sleep(wait_time)