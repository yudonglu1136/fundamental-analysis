#!/usr/bin/env python3
import argparse
import json
import re
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone

try:
    import yt_dlp
except ImportError as exc:
    raise SystemExit("yt_dlp is required: python3 -m pip install yt-dlp") from exc


DEFAULT_DB = "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite"
DEFAULT_CHANNELS = [
    "All-In Podcast",
    "Latent Space",
    "No Priors",
    "Invest Like The Best",
    "Dwarkesh Patel",
    "Peter H. Diamandis",
    "Core Memory Podcast",
]


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_date(value):
    text = str(value or "")
    if re.fullmatch(r"\d{8}", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    return ""


def parse_vtt(payload):
    segments = []
    current_lines = []
    current_start = None
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line or line == "WEBVTT" or line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if "-->" in line:
            if current_lines:
                text = clean_text(" ".join(current_lines))
                if text:
                    segments.append((current_start, text))
            current_lines = []
            current_start = line.split("-->", 1)[0].strip()
            continue
        if re.fullmatch(r"\d+", line):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line:
            current_lines.append(line)
    if current_lines:
        text = clean_text(" ".join(current_lines))
        if text:
            segments.append((current_start, text))
    deduped = []
    previous = ""
    for start, text in segments:
        if text == previous:
            continue
        deduped.append((start, text))
        previous = text
    return deduped


def parse_json3(payload):
    data = json.loads(payload)
    rows = []
    for event in data.get("events", []):
        parts = event.get("segs") or []
        text = clean_text("".join(part.get("utf8", "") for part in parts))
        if not text:
            continue
        start_ms = event.get("tStartMs")
        start = None
        if isinstance(start_ms, int):
            start = f"{start_ms / 1000:.3f}"
        rows.append((start, text))
    return rows


def subtitle_candidates(info):
    for bucket_name in ("subtitles", "automatic_captions"):
        bucket = info.get(bucket_name) or {}
        for language in ("en", "en-US", "en-GB"):
            for item in bucket.get(language, []) or []:
                url = item.get("url")
                ext = item.get("ext", "")
                if url and ext in {"vtt", "json3"}:
                    yield url, ext


def fetch_subtitle(url, ext):
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = response.read().decode("utf-8", errors="replace")
    if ext == "json3":
        return parse_json3(payload)
    return parse_vtt(payload)


def seconds_from_start(value):
    if value is None:
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return float(text)
    parts = text.replace(",", ".").split(":")
    try:
        parts = [float(part) for part in parts]
    except ValueError:
        return None
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + part
    return seconds


def ensure_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL DEFAULT 'youtube',
          source_id TEXT NOT NULL,
          url TEXT,
          title TEXT,
          channel TEXT,
          upload_date TEXT,
          duration_seconds INTEGER,
          language TEXT DEFAULT 'en',
          transcript_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source, source_id)
        );

        CREATE TABLE IF NOT EXISTS transcript_segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          segment_index INTEGER NOT NULL,
          start_time TEXT,
          start_seconds REAL,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(video_id, segment_index)
        );
        """
    )


def latest_channel_seed_urls(conn, channels):
    urls = {}
    for channel in channels:
        row = conn.execute(
            """
            SELECT url
            FROM videos
            WHERE source = 'youtube'
              AND lower(channel) LIKE ?
              AND url IS NOT NULL
            ORDER BY upload_date DESC, id DESC
            LIMIT 1
            """,
            (f"%{channel.lower()}%",),
        ).fetchone()
        if row and row[0]:
            urls[channel] = row[0]
    return urls


def stored_video_has_segments(conn, source_id):
    row = conn.execute(
        """
        SELECT v.id, COUNT(s.id)
        FROM videos v
        LEFT JOIN transcript_segments s ON s.video_id = v.id
        WHERE v.source = 'youtube' AND v.source_id = ?
        GROUP BY v.id
        """,
        (source_id,),
    ).fetchone()
    return bool(row and row[1])


def upsert_video(conn, info, channel_name, segments):
    source_id = str(info.get("id") or "").strip()
    if not source_id or not segments:
        return False
    now = utc_now()
    url = info.get("webpage_url") or f"https://www.youtube.com/watch?v={source_id}"
    conn.execute(
        """
        INSERT INTO videos (
          source, source_id, url, title, channel, upload_date,
          duration_seconds, language, transcript_path, created_at, updated_at
        )
        VALUES ('youtube', ?, ?, ?, ?, ?, ?, 'en', '', ?, ?)
        ON CONFLICT(source, source_id) DO UPDATE SET
          url = excluded.url,
          title = excluded.title,
          channel = excluded.channel,
          upload_date = excluded.upload_date,
          duration_seconds = excluded.duration_seconds,
          updated_at = excluded.updated_at
        """,
        (
            source_id,
            url,
            clean_text(info.get("title")),
            clean_text(info.get("channel") or info.get("uploader") or channel_name),
            parse_date(info.get("upload_date")) or str(info.get("release_date") or ""),
            int(info.get("duration") or 0) or None,
            now,
            now,
        ),
    )
    video_id = conn.execute(
        "SELECT id FROM videos WHERE source = 'youtube' AND source_id = ?",
        (source_id,),
    ).fetchone()[0]
    conn.execute("DELETE FROM transcript_segments WHERE video_id = ?", (video_id,))
    conn.executemany(
        """
        INSERT INTO transcript_segments (
          video_id, segment_index, start_time, start_seconds, text, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                video_id,
                index,
                start or "",
                seconds_from_start(start),
                text,
                now,
            )
            for index, (start, text) in enumerate(segments)
        ],
    )
    return True


def extract_channel_entries(ydl, seed_url, max_videos):
    seed_info = ydl.extract_info(seed_url, download=False)
    channel_url = seed_info.get("channel_url") or seed_info.get("uploader_url")
    if not channel_url:
        return []
    playlist_url = channel_url.rstrip("/") + "/videos"
    playlist = ydl.extract_info(playlist_url, download=False)
    entries = playlist.get("entries") or []
    return entries[:max_videos]


def main():
    parser = argparse.ArgumentParser(description="Sync latest YouTube transcripts into the local transcript DB.")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--channels", default=",".join(DEFAULT_CHANNELS))
    parser.add_argument("--max-videos", type=int, default=4)
    args = parser.parse_args()

    channels = [item.strip() for item in args.channels.split(",") if item.strip()]
    conn = sqlite3.connect(args.db)
    ensure_schema(conn)
    seed_urls = latest_channel_seed_urls(conn, channels)
    if not seed_urls:
        raise SystemExit("No seed videos found for tracked channels in local DB.")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": max(1, args.max_videos),
    }
    detail_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
    }

    inserted = 0
    inspected = 0
    with yt_dlp.YoutubeDL(ydl_opts) as playlist_ydl, yt_dlp.YoutubeDL(detail_opts) as detail_ydl:
        for channel, seed_url in seed_urls.items():
            try:
                entries = extract_channel_entries(playlist_ydl, seed_url, args.max_videos)
            except Exception as exc:
                print(f"[youtube-sync] {channel}: playlist skipped: {exc}", file=sys.stderr)
                continue
            for entry in entries:
                source_id = str(entry.get("id") or "").strip()
                if not source_id or stored_video_has_segments(conn, source_id):
                    continue
                inspected += 1
                try:
                    info = detail_ydl.extract_info(f"https://www.youtube.com/watch?v={source_id}", download=False)
                    segments = []
                    for subtitle_url, ext in subtitle_candidates(info):
                        segments = fetch_subtitle(subtitle_url, ext)
                        if segments:
                            break
                    if upsert_video(conn, info, channel, segments):
                        inserted += 1
                        conn.commit()
                        print(f"[youtube-sync] stored {source_id} {clean_text(info.get('title'))[:80]}")
                except Exception as exc:
                    conn.rollback()
                    print(f"[youtube-sync] {source_id}: transcript skipped: {exc}", file=sys.stderr)
    conn.close()
    print(f"[youtube-sync] inspected={inspected} inserted={inserted} db={args.db}")


if __name__ == "__main__":
    main()
