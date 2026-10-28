import re
import logging
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)

# Comprehensive regex to match YouTube video IDs from all standard URL forms
YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})',
    re.IGNORECASE
)


def extract_video_id(url: str) -> Optional[str]:
    """
    Safely extracts the 11-character YouTube video ID from various URL formats:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/shorts/VIDEO_ID
    - https://www.youtube.com/live/VIDEO_ID
    - https://m.youtube.com/watch?v=VIDEO_ID
    - Extra query parameters: ?t=..., &feature=..., etc.
    """
    if not url or not isinstance(url, str):
        return None

    cleaned_url = url.strip()

    # 1. Regex match
    match = YOUTUBE_REGEX.search(cleaned_url)
    if match:
        return match.group(1)

    # 2. Fallback query string parsing for watch?v=...
    try:
        parsed = urlparse(cleaned_url)
        if "youtube.com" in parsed.netloc:
            qs = parse_qs(parsed.query)
            if "v" in qs and qs["v"]:
                candidate = qs["v"][0]
                if re.match(r'^[a-zA-Z0-9_-]{11}$', candidate):
                    return candidate
        elif "youtu.be" in parsed.netloc:
            path_parts = parsed.path.strip("/").split("/")
            if path_parts and re.match(r'^[a-zA-Z0-9_-]{11}$', path_parts[0]):
                return path_parts[0]
    except Exception:
        pass

    return None


def extract_youtube_metadata(url: str, video_id: str) -> Dict[str, Any]:
    """
    Extracts video metadata using yt-dlp without downloading the media.
    Retrieves title, channel/author name, publication date, and duration.
    If metadata extraction fails, returns empty values so the user can enter them manually.
    """
    metadata: Dict[str, Any] = {
        "title": "",
        "author": "",
        "publication_date": None,
        "duration_seconds": None,
    }

    try:
        import yt_dlp

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'noplaylist': True,
        }

        target_url = f"https://www.youtube.com/watch?v={video_id}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            if info:
                metadata["title"] = info.get("title") or ""
                metadata["author"] = info.get("channel") or info.get("uploader") or ""

                # Format upload_date (YYYYMMDD) into YYYY-MM-DD
                upload_date = info.get("upload_date")
                if upload_date and len(str(upload_date)) == 8 and str(upload_date).isdigit():
                    s = str(upload_date)
                    metadata["publication_date"] = f"{s[:4]}-{s[4:6]}-{s[6:8]}"
                elif info.get("release_date"):
                    metadata["publication_date"] = str(info.get("release_date"))

                duration = info.get("duration")
                if duration and isinstance(duration, (int, float)):
                    metadata["duration_seconds"] = int(duration)

    except Exception as e:
        logger.warning(f"[YouTube-Metadata] Could not extract metadata for {video_id}: {e}")

    return metadata


def _get_transcript_list(video_id: str):
    """
    Safely retrieves the TranscriptList across different versions of youtube-transcript-api.
    """
    from youtube_transcript_api import YouTubeTranscriptApi
    try:
        api = YouTubeTranscriptApi()
        if hasattr(api, 'list'):
            return api.list(video_id)
    except Exception:
        pass

    if hasattr(YouTubeTranscriptApi, 'list_transcripts'):
        return YouTubeTranscriptApi.list_transcripts(video_id)
    return YouTubeTranscriptApi().list(video_id)


def extract_youtube_transcript(video_id: str) -> Dict[str, Any]:
    """
    Extracts transcript snippets using youtube-transcript-api.
    Prefers manual captions, falls back to auto-generated captions.
    Preserves exact script and Unicode characters (Telugu, Hindi, English, etc.).
    Does NOT use Gemini to invent or hallucinate missing transcripts.
    """
    from youtube_transcript_api import (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable
    )

    try:
        transcript_list = _get_transcript_list(video_id)
    except TranscriptsDisabled:
        raise ValueError("Captions/transcripts are disabled for this YouTube video.")
    except VideoUnavailable:
        raise ValueError("The requested YouTube video is unavailable or private.")
    except NoTranscriptFound:
        raise ValueError("No transcript or captions found for this YouTube video.")
    except Exception as e:
        err_msg = str(e)
        if "Subtitles are disabled" in err_msg or "TranscriptsDisabled" in err_msg:
            raise ValueError("Captions/transcripts are disabled for this YouTube video.")
        if "VideoUnavailable" in err_msg:
            raise ValueError("The requested YouTube video is unavailable or private.")
        raise ValueError(f"Failed to retrieve transcript: {err_msg}")

    # Prioritize manual transcript over auto-generated
    available = list(transcript_list)
    if not available:
        raise ValueError("No transcripts are available for this YouTube video.")

    manual = [t for t in available if not t.is_generated]
    target_transcript = manual[0] if manual else available[0]

    try:
        fetched = target_transcript.fetch()
        if hasattr(fetched, "to_raw_data"):
            snippets = fetched.to_raw_data()
        elif isinstance(fetched, list):
            snippets = fetched
        else:
            snippets = list(fetched)
    except Exception as e:
        raise ValueError(f"Failed to fetch caption snippets: {e}")

    if not snippets:
        raise ValueError("The extracted transcript for this video is empty.")

    # Combine snippets into clean text preserving sentences and flow
    clean_parts: List[str] = []
    for s in snippets:
        snippet_text = (s.get("text") if isinstance(s, dict) else getattr(s, "text", "")) or ""
        snippet_text = snippet_text.replace("\n", " ").strip()
        if snippet_text:
            clean_parts.append(snippet_text)


    raw_text = " ".join(clean_parts).strip()
    if not raw_text:
        raise ValueError("The extracted transcript for this video is empty.")

    char_count = len(raw_text)
    word_count = len(raw_text.split())
    # Standard reading speed estimate: ~200 words per minute
    estimated_reading_minutes = max(1, round(word_count / 200))

    return {
        "raw_text": raw_text,
        "detected_language": target_transcript.language_code,
        "language_name": target_transcript.language,
        "is_generated": target_transcript.is_generated,
        "char_count": char_count,
        "word_count": word_count,
        "estimated_reading_minutes": estimated_reading_minutes,
    }


def extract_youtube_content(url: str) -> Dict[str, Any]:
    """
    High-level orchestrator:
    1. Validates URL and extracts video ID.
    2. Retrieves transcript (fails explicitly if transcript unavailable).
    3. Retrieves video metadata (title, author, publication date).
    4. Packages into structured dictionary for review/persistence.
    """
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(
            "Invalid YouTube URL. Please provide a valid YouTube link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)."
        )

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    # 1. Transcript extraction (Mandatory: fails fast if captions unavailable)
    transcript_info = extract_youtube_transcript(video_id)

    # 2. Metadata extraction (Graceful: empty fields on failure)
    metadata = extract_youtube_metadata(canonical_url, video_id)

    return {
        "success": True,
        "video_id": video_id,
        "url": canonical_url,
        "title": metadata.get("title") or "",
        "author": metadata.get("author") or "",
        "publication_date": metadata.get("publication_date"),
        "duration_seconds": metadata.get("duration_seconds"),
        "raw_text": transcript_info["raw_text"],
        "detected_language": transcript_info["detected_language"],
        "language_name": transcript_info["language_name"],
        "is_generated": transcript_info["is_generated"],
        "char_count": transcript_info["char_count"],
        "word_count": transcript_info["word_count"],
        "estimated_reading_minutes": transcript_info["estimated_reading_minutes"],
        "source": "YouTube",
        "source_type": "YouTube Video",
    }
