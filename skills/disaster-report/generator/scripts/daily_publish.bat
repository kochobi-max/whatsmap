@echo off
REM ============================================================
REM  daily_publish.bat - ADRC disaster report, daily publish
REM
REM  This PC no longer builds anything. The cloud builds the four
REM  files and puts them on the "dist" branch; this file only
REM
REM    1. downloads them with curl
REM    2. checks they are today's and the sizes match
REM    3. copies them into LargeScaleDisasters
REM    4. records that the copy succeeded, so the update mail may say so
REM
REM  Needs: git, node, curl. LibreOffice is NOT needed any more.
REM  Run check_setup.bat first if anything is unclear.
REM
REM  Everything is written to a log AND shown on screen. When you
REM  double-click this file the window stays open at the end.
REM  The scheduled task passes --quiet so it never waits for a key.
REM ============================================================
setlocal EnableDelayedExpansion

REM ---- edit this one line if you cloned somewhere else ----
set "REPO=C:\Users\arakida\whatsmap"

set "BRANCH=claude/workflow-automation-review-shyt35"
set "DIST=dist"
set "GLIDE=EQ-2026-000146-COL"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "RAW=https://raw.githubusercontent.com/kochobi-max/whatsmap/%DIST%/%GLIDE%"
set "WORK=%TEMP%\adrc_dist"
set "LOG=%TEMP%\adrc_daily_publish.txt"
set "SELFCOPY=%TEMP%\adrc_daily_publish_run.bat"

REM  NEVER wait for input unless the caller explicitly asks with --pause.
REM
REM  Twice on 2026-08-28 this window sat silent for ever. Both times a
REM  caller was capturing our output with > "%%LOG%%" 2>&1, so the "press
REM  any key" prompt went into the log file instead of the screen and
REM  nothing was visible to press a key for. The work had finished; only
REM  the window was stuck.
REM
REM  Guessing whether a human is watching does not work here: Task
REM  Scheduler, a double-click and a call from another batch all look
REM  alike. So do not guess. Silence is the default, and whoever wants a
REM  pause asks for it. --quiet is still accepted and ignored, so a task
REM  registered with it keeps working.
set "INTERACTIVE="
if /i "%~1"=="--pause" set "INTERACTIVE=1"

REM  Run from a copy in %%TEMP%%.
REM  cmd reads a batch file from disk as it goes. The git pull below can
REM  replace THIS FILE while it is running, and cmd then carries on at a
REM  byte offset inside different content. Copying first makes the file
REM  being executed one that git never touches.
if not defined ADRC_FROM_COPY (
  set "ADRC_FROM_COPY=1"
  copy /Y "%~f0" "%SELFCOPY%" >nul
  if not errorlevel 1 (
    cmd /c ""%SELFCOPY%" %*"
    exit /b !ERRORLEVEL!
  )
  echo WARN: could not copy myself to %SELFCOPY% - running in place
)

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
where curl >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-curl
  echo curl.exe is not on PATH. It ships with Windows 10 1803 and later.
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

if not exist "%REPO%\skills\disaster-report\events\%GLIDE%.json" (
  echo STATUS: FAIL no-event
  echo The skill is not in this checkout. Wrong branch?
  exit /b 3
)

echo STEP: manifest
if exist "%WORK%" rd /s /q "%WORK%"
md "%WORK%" 2>nul
if not exist "%WORK%" (
  echo STATUS: FAIL no-workdir
  echo Could not create the download folder %WORK%
  echo Something is holding it open. Reboot, or clear %TEMP%.
  exit /b 2
)
curl.exe -fsSL --retry 3 --retry-delay 3 -o "%WORK%\manifest.txt" "%RAW%/manifest.txt"
if errorlevel 1 (
  echo STATUS: FAIL no-manifest
  echo Could not download %RAW%/manifest.txt
  echo The cloud build has not published anything yet, or the network is down.
  echo Nothing was copied. Try again later.
  exit /b 4
)
for /f "usebackq tokens=1,* delims==" %%A in ("%WORK%\manifest.txt") do set "M_%%A=%%B"

if not "%M_GLIDE%"=="%GLIDE%" (
  echo STATUS: FAIL manifest-mismatch
  echo The dist branch carries %M_GLIDE%, this file expects %GLIDE%.
  exit /b 4
)

set "TODAY="
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set "TODAY=%%d"
if not defined TODAY (
  echo STATUS: FAIL no-date
  echo powershell did not return a date, so the build cannot be
  echo checked for freshness. Nothing was copied.
  exit /b 2
)
echo   built %M_BUILT_AT_JST% JST  /  today is %TODAY%
if not "%M_BUILT_DATE_JST%"=="%TODAY%" (
  echo STATUS: SKIP stale-dist
  echo The newest build on the dist branch is from %M_BUILT_DATE_JST%, not today.
  echo Nothing was copied and no record was written, so the cloud will
  echo hold the update mail. This is on purpose - it stops a mail that
  echo says "updated today" when nothing new was produced.
  exit /b 0
)

echo STEP: download
for /L %%i in (1,1,%M_FILE_COUNT%) do (
  call :getfile %%i
  if errorlevel 1 exit /b 4
)

echo STEP: publish
copy /Y "%WORK%\*.pptx" "%DEST%\" >nul
if errorlevel 1 goto :locked
copy /Y "%WORK%\*.pdf" "%DEST%\" >nul
if errorlevel 1 goto :locked

echo STEP: sweep
REM  Spanish editions are no longer produced (decision of 2026-08-28).
REM  Leaving them in the folder means a stale deck sits next to a fresh
REM  one under almost the same name, and nothing ever updates it.
REM  Only these two exact names are touched. They go to the OneDrive
REM  recycle bin, so they can be restored if this turns out to be wrong.
call :drop "%DEST%\%M_FILEBASE%_ES.pptx"
call :drop "%DEST%\%M_FILEBASE%_ES.pdf"

echo STEP: marker
node "%REPO%\skills\disaster-report\generator\scripts\write_published.js" %GLIDE% "%DEST%"
if errorlevel 1 (
  echo WARN: marker-not-written
  echo Files are published. The cloud will hold the update mail.
) else (
  call :pushmarker
)

echo STATUS: PUBLISHED %DEST%
dir /b "%DEST%\%M_FILEBASE%*"
exit /b 0

REM ------------------------------------------------------------
REM  :getfile <index>  - download one file and check its size
REM  A short read is worse than no read: it copies a broken deck over
REM  a good one. So the size from the manifest has to match exactly.
:getfile
call set "NAME=%%M_FILE%1%%"
call set "WANT=%%M_BYTES%1%%"
curl.exe -fsSL --retry 3 --retry-delay 3 -o "%WORK%\%NAME%" "%RAW%/%NAME%"
if errorlevel 1 (
  echo STATUS: FAIL download %NAME%
  echo Nothing was copied into %DEST%.
  exit /b 1
)
set "GOT="
for %%F in ("%WORK%\%NAME%") do set "GOT=%%~zF"
if not "%GOT%"=="%WANT%" (
  echo STATUS: FAIL size %NAME% got %GOT% want %WANT%
  echo The download is incomplete. Nothing was copied into %DEST%.
  exit /b 1
)
echo   ok %NAME% %GOT% bytes
exit /b 0

REM ------------------------------------------------------------
REM  :drop <full path>  - remove one file that is no longer produced
:drop
if not exist "%~1" exit /b 0
del /q "%~1"
if exist "%~1" (
  echo   WARN could not remove %~nx1 - it may be open
  exit /b 0
)
echo   removed %~nx1 - no longer produced, recoverable from the OneDrive recycle bin
exit /b 0

REM ------------------------------------------------------------
REM  :pushmarker  - commit the record and prove it reached GitHub
REM
REM  2026-08-28: this step printed nothing and the record never arrived.
REM  The commit failed (no user.name / user.email on this machine), the
REM  push that followed then said "Everything up-to-date" and returned 0,
REM  so the batch reported success with nothing pushed. Two changes:
REM  the identity is passed on the command line so the commit cannot fail
REM  that way, and the result is checked against GitHub instead of being
REM  inferred from an exit code. Nothing goes to nul any more.
:pushmarker
set "MARKERPATH=skills/disaster-report/_published/%GLIDE%.json"
git add "%MARKERPATH%"
git -c user.name="ADRC publish" -c user.email="noreply@adrc.asia" commit -m "chore(disaster-report): %GLIDE% published to LargeScaleDisasters"
REM the cloud pushes to this branch about 35 minutes earlier, so rebase first
git pull --rebase origin %BRANCH%
git push origin %BRANCH%
if errorlevel 1 (
  git pull --rebase origin %BRANCH%
  git push origin %BRANCH%
)
REM  Ask GitHub what it actually holds. Do not trust the exit codes.
REM  "The file exists over there" is not enough either: yesterday's record
REM  would pass that test while today's commit quietly failed. Compare the
REM  content hash of the local file with the one in the pushed commit.
git fetch origin %BRANCH%
set "LOCALSHA=x"
set "REMOTESHA=y"
for /f %%h in ('git hash-object "%MARKERPATH%" 2^>nul') do set "LOCALSHA=%%h"
for /f %%h in ('git rev-parse FETCH_HEAD:%MARKERPATH% 2^>nul') do set "REMOTESHA=%%h"
if not "!LOCALSHA!"=="!REMOTESHA!" (
  echo WARN: marker-not-pushed
  echo Files are published. Only the record could not be pushed,
  echo so the cloud will hold the update mail until it sees one.
  echo The git output above says why. If this is the first push,
  echo a GitHub sign-in window may be waiting.
  exit /b 0
)
echo   marker confirmed on GitHub !LOCALSHA:~0,8!
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
