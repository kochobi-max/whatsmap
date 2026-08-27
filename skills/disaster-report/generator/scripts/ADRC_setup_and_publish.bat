@echo off
REM ============================================================
REM  ADRC_setup_and_publish.bat
REM
REM  Put this file anywhere (C:\Users\arakida is fine) and
REM  DOUBLE-CLICK it. Nothing else to find, nothing to type.
REM
REM  It does, in order:
REM    1. clone the repository if it is not there yet (or update it)
REM    2. install pptxgenjs if it is not there yet
REM    3. build the Colombia report
REM    4. copy the four files into LargeScaleDisasters
REM
REM  Safe to run again any time. It is the same thing the daily
REM  scheduled task will do.
REM
REM  The window stays open at the end. Read the last STATUS line.
REM ============================================================
setlocal

set "HOMEDIR=C:\Users\arakida"
set "REPO=%HOMEDIR%\whatsmap"
set "BRANCH=claude/workflow-automation-review-shyt35"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "LOG=%TEMP%\adrc_setup.txt"

call :main > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOG%"
echo.
echo (this text is also saved at %LOG%)
echo.
pause
exit /b %RC%

REM ------------------------------------------------------------
:main
echo === ADRC disaster report - setup and publish ===
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-git
  echo git is not installed, or not on PATH.
  echo Fix: install "Git for Windows", then run this file again.
  exit /b 2
)
echo OK  git
where node >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-node
  echo node is not installed, or not on PATH.
  echo Fix: install "Node.js LTS", then run this file again.
  exit /b 2
)
echo OK  node
where npm >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-npm
  echo npm is not on PATH. Reinstall Node.js LTS.
  exit /b 2
)
echo OK  npm

echo.
echo STEP: repository
if exist "%REPO%\.git" (
  echo   found %REPO% - updating
  cd /d "%REPO%"
  git fetch origin %BRANCH%
  if errorlevel 1 goto :gitfail
  git checkout %BRANCH%
  if errorlevel 1 goto :gitfail
  git pull origin %BRANCH%
  if errorlevel 1 goto :gitfail
) else (
  echo   not found - cloning into %REPO%
  echo   The repository is public, so no sign-in is needed to clone.
  cd /d "%HOMEDIR%"
  if errorlevel 1 (
    echo STATUS: FAIL no-home
    echo Could not enter %HOMEDIR%
    exit /b 2
  )
  git clone https://github.com/kochobi-max/whatsmap.git
  if errorlevel 1 (
    echo STATUS: FAIL clone
    echo Could not clone the repository.
    echo Check the network connection, then run this file again.
    exit /b 3
  )
  cd /d "%REPO%"
  git checkout %BRANCH%
  if errorlevel 1 goto :gitfail
)
echo OK  repository ready

if not exist "%REPO%\skills\disaster-report\generator\gen_deck.base.js" (
  echo STATUS: FAIL no-generator
  echo The skill files are missing from the checkout. Wrong branch?
  exit /b 3
)

echo.
echo STEP: pptxgenjs
if exist "%HOMEDIR%\node_modules\pptxgenjs" (
  echo OK  already installed
) else (
  echo   installing into %HOMEDIR% - this takes a minute
  cd /d "%HOMEDIR%"
  call npm install pptxgenjs
  if not exist "%HOMEDIR%\node_modules\pptxgenjs" (
    echo STATUS: FAIL npm
    echo npm install pptxgenjs did not produce %HOMEDIR%\node_modules\pptxgenjs
    exit /b 4
  )
  echo OK  installed
)

if not exist "%DEST%" (
  echo STATUS: FAIL no-dest
  echo Destination folder missing:
  echo   %DEST%
  echo Check the exact name, including the space in "OneDrive - adrc.asia".
  exit /b 2
)

echo.
echo STEP: build and publish
call "%REPO%\skills\disaster-report\generator\scripts\daily_publish.bat"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo The publish step reported a problem. Its own STATUS line is above.
  exit /b %RC%
)
echo.
echo STATUS: ALL DONE
echo The four files are in %DEST%
echo.
echo Note: the first time the record is pushed to GitHub, a sign-in
echo window may appear. Sign in once; it will not ask again.
echo If you missed it, run this file once more.
echo.
echo Next: register the daily task, in an ADMIN command prompt, one line:
echo   schtasks /create /tn "ADRC disaster report daily" /tr "\"%REPO%\skills\disaster-report\generator\scripts\daily_publish.bat\"" /sc daily /st 08:10
exit /b 0

:gitfail
echo STATUS: FAIL git
echo git could not fetch/checkout/pull %BRANCH% in %REPO%.
echo If a sign-in window appeared and was cancelled, run this file again.
exit /b 3
