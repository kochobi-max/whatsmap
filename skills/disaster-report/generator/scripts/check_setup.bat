@echo off
REM ============================================================
REM  check_setup.bat - ADRC disaster report, setup checker
REM
REM  Double-click this. It changes NOTHING. It only checks whether
REM  everything daily_publish.bat needs is in place, and prints one
REM  line per item. The window stays open so you can read it.
REM
REM  Tell Claude only the lines that say NG.
REM
REM  Note: LibreOffice and pptxgenjs are NOT checked any more.
REM  The cloud builds the files; this PC only downloads and copies.
REM ============================================================
setlocal EnableDelayedExpansion

set "REPO=C:\Users\arakida\whatsmap"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "BRANCH=claude/workflow-automation-review-shyt35"
set "DISTURL=https://raw.githubusercontent.com/kochobi-max/whatsmap/dist/EQ-2026-000146-COL/manifest.txt"
set "LOG=%TEMP%\adrc_check_setup.txt"

call :main > "%LOG%" 2>&1
type "%LOG%"
echo.
echo (this text is also saved at %LOG%)
echo.
pause
exit /b 0

:main
echo === ADRC disaster report - setup check ===
echo.

REM ---- 1. git ----
where git >nul 2>&1
if errorlevel 1 (
  echo NG  1 git          not found on PATH
  echo        Fix: install Git for Windows, then reopen the window
) else (
  echo OK  1 git
)

REM ---- 2. node ----
where node >nul 2>&1
if errorlevel 1 (
  echo NG  2 node         not found on PATH
  echo        Fix: install Node.js LTS, then reopen the window
) else (
  for /f "tokens=*" %%v in ('node -v 2^>nul') do echo OK  2 node         %%v
)

REM ---- 3. curl ----
where curl >nul 2>&1
if errorlevel 1 (
  echo NG  3 curl         curl.exe not found on PATH
  echo        It ships with Windows 10 1803 and later. Check PATH.
) else (
  echo OK  3 curl
)

REM ---- 4. the clone ----
if not exist "%REPO%\.git" (
  echo NG  4 repo         no git clone at %REPO%
  echo        Fix: cd C:\Users\arakida  ^&^&  git clone https://github.com/kochobi-max/whatsmap.git
) else (
  echo OK  4 repo         %REPO%
)

REM ---- 5. the skill files, i.e. the right branch ----
if not exist "%REPO%\skills\disaster-report\events\EQ-2026-000146-COL.json" (
  echo NG  5 branch       the skill is not in this checkout
  echo        Fix: cd /d "%REPO%"  ^&^&  git fetch origin %BRANCH%  ^&^&  git checkout %BRANCH%
) else (
  echo OK  5 branch       skill files present
)

REM ---- 6. can this PC reach the built files? ----
REM  This is the whole point of the new arrangement: the cloud builds,
REM  this PC downloads. If the download does not work nothing else matters.
set "MAN=%TEMP%\adrc_check_manifest.txt"
del "%MAN%" >nul 2>&1
curl.exe -fsSL --retry 2 --retry-delay 2 -o "%MAN%" "%DISTURL%" >nul 2>&1
if exist "%MAN%" (
  set "BUILT="
  for /f "usebackq tokens=1,* delims==" %%A in ("%MAN%") do (
    if "%%A"=="BUILT_AT_JST" set "BUILT=%%B"
  )
  if defined BUILT (
    echo OK  6 dist         newest build !BUILT! JST
  ) else (
    echo NG  6 dist         downloaded, but the file has no BUILT_AT_JST line
  )
  del "%MAN%" >nul 2>&1
) else (
  echo NG  6 dist         could not download the built files
  echo        %DISTURL%
  echo        Either the cloud has not published yet, or this PC cannot
  echo        reach raw.githubusercontent.com through the office network.
)

REM ---- 7. destination ----
if not exist "%DEST%" (
  echo NG  7 destination  folder missing:
  echo        %DEST%
  echo        Fix: check the exact folder name, including the space in "OneDrive - adrc.asia"
) else (
  echo OK  7 destination  %DEST%
)

echo.
echo === done ===
echo If every line says OK, run daily_publish.bat next.
exit /b 0
