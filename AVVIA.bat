@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installo le dipendenze...
  call npm install
)
echo.
echo REALITYPAPER in avvio su http://localhost:5500
echo Per i QR leggibili dal telefono imposta PUBLIC_URL (es. set PUBLIC_URL=https://xxx.trycloudflare.com)
echo.
start "" http://localhost:5500
node server/index.js
pause
