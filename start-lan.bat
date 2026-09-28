@echo off
cd /d "%~dp0"
set DEROM_STRATUM_HOST=0.0.0.0
node server.js
pause
