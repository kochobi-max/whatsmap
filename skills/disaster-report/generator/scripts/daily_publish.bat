@echo off
REM ============================================================
REM  daily_publish.bat - ADRC disaster report, daily publish
REM
REM    1. pulls the latest event data from GitHub
REM    2. builds JA/EN PPTX + PDF from the versioned generator
REM    3. copies all four files into LargeScaleDisasters
REM    4. records that the copy succeeded, so the update mail may say so
REM
REM  Run check_setup.bat first if anything is unclear.
REM
REM  Everything is written to a log AND shown on screen. When you
REM  double-click this file the window stays open at the end.
REM  Under Task Scheduler it just exits with a code.
REM ============================================================
setlocal

REM ---- edit this one line if you cloned somewhere else ----
set "REPO=C:\Users\arakida\whatsmap"

set "BRANCH=claude/workflow-automation-review-shyt35"
set "GLIDE=EQ-2026-000146-COL"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "PPTXGENJS_NODE_MODULES=C:\Users\arakida\node_modules"
set "LOG=%TEMP%\adrc_daily_publish.txt"

if not defined SOFFICE (
  if exist "C:\Program Files\LibreOffice\program\soffice.exe" (
    set "SOFFICE=C:\Program Files\LibreOffice\program\soffice.exe"
  ) else (
    if exist "C:\Program Files (x86)\LibreOffice\program\soffice.exe" (
      set "SOFFICE=C:\Program Files (x86)\LibreOffice\program\soffice.exe"
    )
  )
)

REM was this double-clicked? then keep the window open at the end
set "INTERACTIVE="
echo %cmdcmdline% | find /i "%~nx0" >nul
if not errorlevel 1 set "INTERACTIVE=1"

call :main > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"
type "%LOG%"
echo.
echo (this text is also saved at %LOG%)
if defined INTERACTIVE (
  echo.
  pause
)
exit /b %RC%

REM ------------------------------------------------------------
:main

where git >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-git
  echo git is not on PATH. Run check_setup.bat.
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-node
  echo node is not on PATH. Run check_setup.bat.
  exit /b 2
)
if not exist "%REPO%\.git" (
  echo STATUS: FAIL no-repo
  echo Not a git clone: %REPO%
  echo Fix: set REPO at the top of this file, or clone the repository.
  exit /b 2
)
if not exist "%DEST%" (
  echo STATUS: FAIL no-dest
  echo Destination folder missing:
  echo   %DEST%
  exit /b 2
)

cd /d "%REPO%"
if errorlevel 1 (
  echo STATUS: FAIL no-cd
  echo Could not enter %REPO%
  exit /b 2
)

echo STEP: pull
git fetch origin %BRANCH%
if errorlevel 1 goto :gitfail
git checkout %BRANCH%
if errorlevel 1 goto :gitfail
git pull origin %BRANCH%
if errorlevel 1 goto :gitfail

if not exist "%REPO%\skills\disaster-report\generator\gen_deck.base.js" (
  echo STATUS: FAIL no-generator
  echo The skill is not in this checkout. Wrong branch?
  echo Expected: %REPO%\skills\disaster-report\generator\gen_deck.base.js
  exit /b 3
)

echo STEP: build
node "%REPO%\skills\disaster-report\generator\scripts\build_event.js" %GLIDE% "%REPO%\_build\%GLIDE%"
if errorlevel 1 (
  echo STATUS: FAIL build
  echo See the build output above for the reason.
  exit /b 4
)

echo STEP: publish
copy /Y "%REPO%\_build\%GLIDE%\*.pptx" "%DEST%\" >nul
if errorlevel 1 goto :locked
copy /Y "%REPO%\_build\%GLIDE%\*.pdf" "%DEST%\" >nul
if errorlevel 1 goto :locked

echo STEP: marker
node "%REPO%\skills\disaster-report\generator\scripts\write_published.js" %GLIDE% "%DEST%"
if errorlevel 1 (
  echo WARN: marker-not-written
  echo Files are published. The cloud will hold the update mail.
) else (
  git add "skills/disaster-report/_published/%GLIDE%.json"
  git commit -m "chore(disaster-report): %GLIDE% published to LargeScaleDisasters" >nul 2>&1
  REM the cloud pushes to this branch about 35 minutes earlier, so rebase first
  git pull --rebase origin %BRANCH% >nul 2>&1
  git push origin %BRANCH% >nul 2>&1
  if errorlevel 1 (
    git pull --rebase origin %BRANCH% >nul 2>&1
    git push origin %BRANCH% >nul 2>&1
  )
  if errorlevel 1 (
    echo WARN: marker-not-pushed
    echo Files are published. Only the marker could not be pushed,
    echo so the cloud will hold the update mail until it sees one.
    echo If this is the first push, a GitHub sign-in window may be waiting.
  )
)

echo STATUS: PUBLISHED %DEST%
dir /b "%DEST%\ADRC_EQ_COL_Choco_*"
exit /b 0

:gitfail
echo STATUS: FAIL git
echo git could not fetch/checkout/pull %BRANCH%.
echo If it asks for credentials, set them up once, then re-run.
exit /b 3

:locked
echo STATUS: FAIL copy-locked
echo Could not overwrite in %DEST%.
echo A file is probably open in PowerPoint or a PDF viewer. Close it and re-run.
exit /b 5
