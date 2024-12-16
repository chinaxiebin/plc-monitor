@echo off
cd /d %~dp0
set PORT=3000
set NODE_ENV=production
node dist/server/index.js