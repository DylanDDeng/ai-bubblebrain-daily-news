#!/bin/sh
# Restart the local Astro dev server on :4321 with a clean content cache.
# Needed after editing markdown under site/content/ — the Astro 5 content
# layer caches rendered markdown in .astro/data-store.json and does not
# hot-reload files outside astro/src.
cd "$(dirname "$0")" || exit 1

PID=$(lsof -nP -t -i :4321 -sTCP:LISTEN | head -1)
[ -n "$PID" ] && kill "$PID" && sleep 1

rm -f .astro/data-store.json

nohup npx astro dev --port 4321 --host 127.0.0.1 > /tmp/dev4321.log 2>&1 &
echo "restarting… 约 10 秒后刷新 http://localhost:4321/（日志: /tmp/dev4321.log）"
