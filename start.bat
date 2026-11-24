@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Freistunden.exe - Server

where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js ist nicht installiert.
  echo   Bitte zuerst von https://nodejs.org die LTS-Version installieren.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo.
  echo   Erster Start: benoetigte Pakete werden installiert ...
  echo.
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo   Installation fehlgeschlagen. Besteht eine Internetverbindung?
    pause
    exit /b 1
  )
)

node --disable-warning=ExperimentalWarning server.js --oeffnen
echo.
echo   Der Server wurde beendet.
pause
