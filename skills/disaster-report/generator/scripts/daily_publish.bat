@echo off
REM ============================================================
REM  daily_publish.bat - ADRC disaster report, daily publish
REM
REM  What it does:
REM    1. pulls the latest event data from GitHub
REM    2. builds JA/EN PPTX + PDF from the versioned generator
REM    3. copies all four files into LargeScaleDisasters
REM
REM  Set REPO below once, then register this file in Task Scheduler.
REM  Everything here is ASCII on purpose: cp932 and findstr stay happy.
REM ============================================================
setlocal

REM ---- edit this one line: where you cloned kochobi-max/whatsmap ----
set "REPO=C:\Users\arakida\whatsmap"

set "BRANCH=claude/workflow-automation-review-shyt35"
set "GLIDE=EQ-2026-000146-COL"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "PPTXGENJS_NODE_MODULES=C:\Users\arakida\node_modules"

if not exist "%REPO%\.git" (
  echo STATUS: FAIL no-repo
  echo Not a git clone: %REPO%
  echo Fix: set REPO at the top of this file to your whatsmap clone.
  exit /b 2
)
if not exist "%DEST%" (
  echo STATUS: FAIL no-dest
  echo Destination folder missing: %DEST%
  exit /b 2
)

cd /d "%REPO%" || exit /b 2

echo STEP: pull
git fetch origin %BRANCH% && git checkout %BRANCH% && git pull origin %BRANCH%
if errorlevel 1 (
  echo STATUS: FAIL git
  exit /b 3
)

if not exist "%REPO%\skills\disaster-report\generator\gen_deck.base.js" (
  echo STATUS: FAIL no-generator
  echo The skill is not in this checkout. Wrong branch?
  exit /b 3
)

echo STEP: build
node "%REPO%\skills\disaster-report\generator\scripts\build_event.js" %GLIDE% "%REPO%\_build\%GLIDE%"
if errorlevel 1 (
  echo STATUS: FAIL build
  exit /b 4
)

echo STEP: publish
REM /Y overwrites. If a file is open in PowerPoint or a PDF viewer the copy
REM fails - that is reported, never silently skipped.
copy /Y "%REPO%\_build\%GLIDE%\*.pptx" "%DEST%\" >nul
if errorlevel 1 goto :locked
copy /Y "%REPO%\_build\%GLIDE%\*.pdf" "%DEST%\" >nul
if errorlevel 1 goto :locked

REM Record that publication actually happened, and push it, so the cloud
REM can tell whether the update mail may truthfully say "saved to OneDrive".
REM If the push fails the files are still published - that is a warning, not a failure.
echo STEP: marker
node "%REPO%\skills\disaster-report\generator\scripts\write_published.js" %GLIDE% "%DEST%"
git add "skills/disaster-report/_published/%GLIDE%.json"
git commit -m "chore(disaster-report): %GLIDE% published to LargeScaleDisasters" >nul 2>&1
git push origin %BRANCH% >nul 2>&1
if errorlevel 1 (
  echo WARN: marker-not-pushed
  echo Files are published. Only the marker could not be pushed.
  echo The cloud will hold the update mail until it sees the marker.
)

echo STATUS: PUBLISHED %DEST%
dir /b "%DEST%\ADRC_EQ_COL_Choco_*"
exit /b 0

:locked
echo STATUS: FAIL copy-locked
echo Could not overwrite in %DEST%.
echo A file is probably open in PowerPoint or a PDF viewer. Close it and re-run.
exit /b 5
