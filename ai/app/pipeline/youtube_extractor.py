import re
import logging
import os
import json
import urllib.request
import urllib.parse
import urllib.error
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
    Retrieves the TranscriptList using the current instance API, with support
    for the older class-level API. Do not swallow request errors here: retrying
    the same request through a fallback masks the original YouTube/API failure.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ModuleNotFoundError as error:
        if error.name == 'youtube_transcript_api':
            raise RuntimeError(
                'YouTube transcript support is not installed. From the ai folder, '
                'run: python -m pip install -r requirements.txt'
            ) from error
        raise

    api = YouTubeTranscriptApi()
    list_method = getattr(api, 'list', None)
    if callable(list_method):
        return list_method(video_id)
    if hasattr(YouTubeTranscriptApi, 'list_transcripts'):
        return YouTubeTranscriptApi.list_transcripts(video_id)
    raise RuntimeError('Installed youtube-transcript-api has no supported transcript listing method.')


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
    estimated_reading_minutes = max(1, round(word_count / 200))

    lang_code = (getattr(target_transcript, "language_code", None) or "").strip()
    lang_name = (getattr(target_transcript, "language", None) or "").strip()

    # Fallback/verification via script detection when caption metadata is missing or labeled 'en'
    if not lang_code or lang_code.lower().startswith("en"):
        try:
            from app.pipeline.translation import detect_language, LANGUAGE_NAME_MAP
            script_lang, conf = detect_language(raw_text)
            if script_lang not in ("en", "unknown") and conf >= 0.85:
                lang_code = script_lang
                lang_name = LANGUAGE_NAME_MAP.get(script_lang, lang_name or script_lang)
        except Exception:
            pass

    if not lang_code:
        lang_code = "en"
    if not lang_name:
        lang_name = "English" if lang_code.lower().startswith("en") else lang_code

    return {
        "raw_text": raw_text,
        "detected_language": lang_code,
        "language_name": lang_name,
        "is_generated": target_transcript.is_generated,
        "char_count": char_count,
        "word_count": word_count,
        "estimated_reading_minutes": estimated_reading_minutes,
    }


def parse_like_count(votes: Any) -> int:
    """Safely converts YouTube like count representations (e.g., '1.2K', '3M', '45', '0') to integer."""
    if not votes:
        return 0
    if isinstance(votes, (int, float)):
        return int(votes)
    s = str(votes).strip().upper()
    if not s or s == "0":
        return 0
    multiplier = 1
    if s.endswith("K"):
        multiplier = 1000
        s = s[:-1]
    elif s.endswith("M"):
        multiplier = 1000000
        s = s[:-1]
    elif s.endswith("B"):
        multiplier = 1000000000
        s = s[:-1]
    try:
        return int(float(s) * multiplier)
    except Exception:
        return 0


def extract_youtube_comments(canonical_url: str, video_id: str, max_comments: int = 50) -> Dict[str, Any]:
    """
    Extracts comments using youtube-comment-downloader without requiring YouTube Data API keys.
    Retrieves comment text, author, timestamp/date, and like count.
    Supports configurable maximum comment limits and pagination.
    Distinguishes clearly between disabled comments, unavailable video, zero comments, and extraction failure.
    """
    from youtube_comment_downloader import YoutubeCommentDownloader
    import requests

    target_limit = max(1, min(int(max_comments or 50), 500))
    downloader = YoutubeCommentDownloader()

    # 1. Pre-flight check via downloader's session to distinguish playability and disabled comments
    playability_reason = None
    comments_disabled = False

    try:
        resp = downloader.session.get(canonical_url, timeout=20)

        # Check cookie consent redirection if present
        if "consent" in str(resp.url):
            from youtube_comment_downloader.downloader import YT_HIDDEN_INPUT_RE, YOUTUBE_CONSENT_URL
            params = dict(re.findall(YT_HIDDEN_INPUT_RE, resp.text))
            params.update({"continue": canonical_url, "set_eom": False, "set_ytc": True, "set_apyt": True})
            resp = downloader.session.post(YOUTUBE_CONSENT_URL, params=params, timeout=20)

        html = resp.text

        # Check video playability status
        player_match = re.search(r'ytInitialPlayerResponse\s*=\s*({.+?});', html)
        if player_match:
            try:
                player_data = json.loads(player_match.group(1))
                playability = player_data.get("playabilityStatus", {})
                status = playability.get("status")
                if status and status not in ("OK", "LIVE_STREAM_OFFLINE"):
                    playability_reason = playability.get("reason") or "The requested YouTube video was not found, is private, or has been removed."
            except Exception:
                pass

        # Check if comments are disabled via itemSectionRenderer
        import youtube_comment_downloader.downloader as d_mod
        data_str = downloader.regex_search(html, d_mod.YT_INITIAL_DATA_RE, default="")
        if data_str:
            try:
                data = json.loads(data_str)
                item_section = next((s for s in downloader.search_dict(data, "itemSectionRenderer") 
                                     if s.get("sectionIdentifier") == "comment-item-section"), None)
                if item_section:
                    renderer = next(downloader.search_dict(item_section, "continuationItemRenderer"), None)
                    message_renderer = next(downloader.search_dict(item_section, "messageRenderer"), None)
                    if not renderer and message_renderer:
                        comments_disabled = True
            except Exception:
                pass

    except requests.exceptions.RequestException as e:
        logger.warning(f"[YouTube-Comments] Network error connecting to {canonical_url}: {e}")
        return {
            "success": False,
            "status": "network_error",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": f"Network error connecting to YouTube: {e}"
        }
    except Exception as e:
        logger.warning(f"[YouTube-Comments] Pre-flight check error for {video_id}: {e}")

    # If video is not playable (private, deleted, not found)
    if playability_reason:
        return {
            "success": False,
            "status": "failed",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": playability_reason
        }

    # If comments are definitively disabled
    if comments_disabled:
        return {
            "success": False,
            "status": "disabled",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": "Comments are disabled for this YouTube video."
        }

    # 2. Extract comments using generator
    comments: List[Dict[str, Any]] = []
    limit_reached = False
    has_more = False

    try:
        comment_generator = downloader.get_comments_from_url(canonical_url)
        for c in comment_generator:
            cid = c.get("cid") or ""
            raw_text = (c.get("text") or "").strip()
            if not raw_text:
                continue

            author = (c.get("author") or "Viewer").strip()
            author_channel_url = f"https://www.youtube.com/channel/{c.get('channel')}" if c.get("channel") else ""

            # Preserve real publication timestamp if parsed by dateparser, do NOT invent missing dates
            published_at = None
            time_parsed = c.get("time_parsed")
            if time_parsed:
                try:
                    from datetime import datetime, timezone
                    published_at = datetime.fromtimestamp(time_parsed, tz=timezone.utc).isoformat()
                except Exception:
                    published_at = None

            like_count = parse_like_count(c.get("votes"))

            comments.append({
                "id": cid,
                "text": raw_text,
                "author": author,
                "author_channel_url": author_channel_url,
                "published_at": published_at,
                "time_relative": c.get("time") or "",
                "like_count": like_count,
                "is_reply": bool(c.get("reply", False)),
                "video_id": video_id
            })

            if len(comments) >= target_limit:
                limit_reached = True
                has_more = True
                break

    except RuntimeError as rte:
        err_msg = str(rte)
        if "Comments disabled" in err_msg or "continuationItemRenderer" in err_msg:
            return {
                "success": False,
                "status": "disabled",
                "count": 0,
                "total_retrieved": 0,
                "has_more": False,
                "limit_reached": False,
                "comments": [],
                "error": "Comments are disabled for this YouTube video."
            }
        logger.warning(f"[YouTube-Comments] RuntimeError extracting comments for {video_id}: {err_msg}")
        return {
            "success": False,
            "status": "failed",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": f"Failed to retrieve comments: {err_msg}"
        }
    except Exception as e:
        logger.warning(f"[YouTube-Comments] Failed to extract comments for {video_id}: {e}")
        return {
            "success": False,
            "status": "failed",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": f"Failed to retrieve comments: {e}"
        }

    # 3. Status resolution
    if len(comments) == 0:
        if comments_disabled:
            return {
                "success": False,
                "status": "disabled",
                "count": 0,
                "total_retrieved": 0,
                "has_more": False,
                "limit_reached": False,
                "comments": [],
                "error": "Comments are disabled for this YouTube video."
            }
        return {
            "success": True,
            "status": "empty",
            "count": 0,
            "total_retrieved": 0,
            "has_more": False,
            "limit_reached": False,
            "comments": [],
            "error": None
        }

    return {
        "success": True,
        "status": "success",
        "count": len(comments),
        "total_retrieved": len(comments),
        "has_more": has_more,
        "limit_reached": limit_reached,
        "comments": comments,
        "error": None
    }


def extract_youtube_content(
    url: str,
    extract_transcript: bool = True,
    extract_comments: bool = False,
    max_comments: int = 50
) -> Dict[str, Any]:
    """
    High-level orchestrator:
    1. Validates URL and extracts video ID.
    2. Retrieves video metadata once (shared between transcript & comments).
    3. Retrieves transcript (if requested).
    4. Retrieves comments using youtube-comment-downloader (if requested).
    5. Packages into structured dictionary for review/persistence.
    """
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(
            "Invalid YouTube URL. Please provide a valid YouTube link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)."
        )

    if not extract_transcript and not extract_comments:
        raise ValueError("At least one extraction option (Transcript or Comments) must be selected.")

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"

    # 1. Metadata extraction (Graceful: empty fields on failure, shared between transcript & comments)
    metadata = extract_youtube_metadata(canonical_url, video_id)

    # 2. Transcript extraction
    transcript_info: Optional[Dict[str, Any]] = None
    transcript_error: Optional[str] = None
    if extract_transcript:
        try:
            transcript_info = extract_youtube_transcript(video_id)
        except Exception as e:
            transcript_error = str(e)
            if not extract_comments:
                raise ValueError(transcript_error)

    # 3. Comment extraction
    comments_info: Optional[Dict[str, Any]] = None
    if extract_comments:
        comments_info = extract_youtube_comments(canonical_url, video_id, max_comments=max_comments)
        if not extract_transcript and not (comments_info and comments_info.get("success")):
            raise ValueError(comments_info.get("error") if comments_info else "Failed to retrieve comments.")

    # 4. Partial failure check
    if extract_transcript and not transcript_info and extract_comments and not (comments_info and comments_info.get("success")):
        err_msg = f"Both extractions failed. Transcript: {transcript_error}"
        if comments_info and comments_info.get("error"):
            err_msg += f" | Comments: {comments_info.get('error')}"
        raise ValueError(err_msg)

    transcript_data = {
        "success": bool(transcript_info),
        "status": "success" if transcript_info else "failed",
        "raw_text": transcript_info["raw_text"] if transcript_info else "",
        "detected_language": transcript_info.get("detected_language", "en") if transcript_info else "en",
        "language_name": transcript_info.get("language_name", "English") if transcript_info else "English",
        "is_generated": transcript_info.get("is_generated", False) if transcript_info else False,
        "char_count": transcript_info.get("char_count", 0) if transcript_info else 0,
        "word_count": transcript_info.get("word_count", 0) if transcript_info else 0,
        "estimated_reading_minutes": transcript_info.get("estimated_reading_minutes", 0) if transcript_info else 0,
        "error": transcript_error
    } if extract_transcript else None

    return {
        "success": True,
        "video_id": video_id,
        "url": canonical_url,
        "title": metadata.get("title") or "",
        "author": metadata.get("author") or "",
        "publication_date": metadata.get("publication_date"),
        "duration_seconds": metadata.get("duration_seconds"),
        "raw_text": transcript_info["raw_text"] if transcript_info else "",
        "detected_language": transcript_info.get("detected_language", "en") if transcript_info else "en",
        "language_name": transcript_info.get("language_name", "English") if transcript_info else "English",
        "is_generated": transcript_info.get("is_generated", False) if transcript_info else False,
        "char_count": transcript_info.get("char_count", 0) if transcript_info else 0,
        "word_count": transcript_info.get("word_count", 0) if transcript_info else 0,
        "estimated_reading_minutes": transcript_info.get("estimated_reading_minutes", 0) if transcript_info else 0,
        "source": "YouTube",
        "source_type": "YouTube Video",
        "transcript": transcript_data,
        "comments": comments_info
    }
