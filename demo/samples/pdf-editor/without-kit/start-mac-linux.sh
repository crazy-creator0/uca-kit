#!/bin/sh
# Starts the editor on this computer only (nothing is reachable from the internet).
cd "$(dirname "$0")"
( sleep 1; open http://127.0.0.1:8000/ 2>/dev/null || xdg-open http://127.0.0.1:8000/ ) &
python3 -m http.server 8000 --bind 127.0.0.1
