@echo off
REM ===================================================================
REM  steam-friends launcher for Windows.
REM  Double-click this file. It asks for your Steam API key and SteamID
REM  the first time, remembers them, then checks who unfriended you.
REM ===================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Steam Friends Tracker
echo ============================================
echo.

REM --- Find Python (prefer the "py" launcher, fall back to "python") ---
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY (
    echo [X] Python was not found on this PC.
    echo.
    echo     Install it from https://www.python.org/downloads/
    echo     and be sure to tick "Add Python to PATH" during setup.
    echo.
    pause
    exit /b 1
)

REM --- Load saved credentials if we have them ---
set "CONFIG=%~dp0config.bat"
if exist "%CONFIG%" call "%CONFIG%"

REM --- Ask for anything we don't already have, then save it ---
if not defined STEAM_API_KEY (
    echo Get an API key at: https://steamcommunity.com/dev/apikey
    set /p "STEAM_API_KEY=Paste your Steam API key: "
)
if not defined STEAM_ID (
    echo.
    echo Find your 64-bit SteamID at: https://steamid.io
    set /p "STEAM_ID=Paste your SteamID (starts with 7656119...): "
)

if "!STEAM_API_KEY!"=="" goto :missing
if "!STEAM_ID!"=="" goto :missing

REM --- Persist for next time so you only type them once ---
(
    echo set "STEAM_API_KEY=!STEAM_API_KEY!"
    echo set "STEAM_ID=!STEAM_ID!"
) > "%CONFIG%"

echo.
echo Checking your friends list...
echo.
%PY% "%~dp0steam_friends.py" update
set "RC=!ERRORLEVEL!"

echo.
if not "!RC!"=="0" (
    echo ---------------------------------------------------------------
    echo Something went wrong ^(see the message above^).
    echo Common causes: wrong API key/SteamID, or your friends list is
    echo set to Private. Make it Public in Steam privacy settings.
    echo.
    echo To re-enter your key/SteamID, delete the file "config.bat"
    echo in this folder and run this again.
    echo ---------------------------------------------------------------
)
echo.
pause
exit /b !RC!

:missing
echo.
echo [X] Both an API key and a SteamID are required. Nothing was saved.
echo.
pause
exit /b 1
