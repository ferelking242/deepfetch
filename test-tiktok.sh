#!/usr/bin/env bash
# DeepFetch — TikTok quick test
# Usage: ./test-tiktok.sh [tiktok-url]
# Default URL: @khaby.lame (latest video)

set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

URL="${1:-https://www.tiktok.com/@khaby.lame}"
echo "🔍 DeepFetch TikTok Test"
echo "   URL: $URL"
echo "────────────────────────────────────────"

RAW=$(yt-dlp "$URL" \
  --dump-json \
  --no-download \
  --flat-playlist \
  -I 1 \
  --quiet 2>/dev/null)

python3 - <<'PYEOF'
import json, sys, textwrap

raw = json.loads(sys.stdin.read())

fields = [
  ("id",             raw.get("id")),
  ("title",          raw.get("title")),
  ("author",         raw.get("uploader")),
  ("author_url",     raw.get("uploader_url")),
  ("duration",       f"{raw.get('duration')}s  ({raw.get('duration_string')})"),
  ("views",          f"{raw.get('view_count'):,}" if raw.get("view_count") else "N/A"),
  ("likes",          f"{raw.get('like_count'):,}" if raw.get("like_count") else "N/A"),
  ("comments",       f"{raw.get('comment_count'):,}" if raw.get("comment_count") else "N/A"),
  ("reposts",        f"{raw.get('repost_count'):,}" if raw.get("repost_count") else "N/A"),
  ("saves",          f"{raw.get('save_count'):,}" if raw.get("save_count") else "N/A"),
  ("upload_date",    raw.get("upload_date")),
  ("music",          raw.get("track")),
  ("thumbnail",      (raw.get("thumbnails") or [{}])[0].get("url", "N/A")[:80] + "…"),
  ("video_url",      raw.get("webpage_url")),
]

for k, v in fields:
  print(f"  {k:<14} {v}")

print("\n✅ DeepFetch TikTok extraction OK")
PYEOF
<<< "$RAW"
