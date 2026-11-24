@echo off
rem Starts the editor on this computer only (nothing is reachable from the internet).
cd /d "%~dp0"
start "" http://127.0.0.1:8000/
python -m http.server 8000 --bind 127.0.0.1 || py -m http.server 8000 --bind 127.0.0.1
