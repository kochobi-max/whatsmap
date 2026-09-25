@echo off
REM ============================================================
REM  ADRC_setup_and_publish.bat
REM
REM  Put this file anywhere (C:\Users\arakida is fine) and
REM  DOUBLE-CLICK it. Nothing else to find, nothing to type.
REM
REM  This file lives OUTSIDE the clone, so git pull never updates it.
REM  For that reason it must stay a bootstrap and nothing more:
REM  make sure the clone exists and is current, then hand over to
REM  publish_local.js inside the clone. Every fix belongs in there,
REM  because that is the only half that reaches this PC on its own.
REM  On 2026-08-28 a fix was pushed to the clone while this file kept
REM  an old copy of the same logic, and the same fault happened twice.
REM ============================================================
setlocal

set "HOMEDIR=C:\Users\arakida"
set "REPO=%HOMEDIR%\whatsmap"
set "BRANCH=claude/workflow-automation-review-shyt35"

where git >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-git
  echo git is not installed, or not on PATH.
  echo Fix: install "Git for Windows", then run this file again.
  pause
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 (
  echo STATUS: FAIL no-node
  echo node is not installed, or not on PATH.
  echo Fix: install "Node.js LTS", then run this file again.
  pause
  exit /b 2
)

if exist "%REPO%\.git" (
  cd /d "%REPO%"
  git fetch origin %BRANCH%
  git checkout %BRANCH%
  git pull origin %BRANCH%
) else (
  echo Cloning into %REPO% - the repository is public, no sign-in needed.
  cd /d "%HOMEDIR%"
  git clone https://github.com/kochobi-max/whatsmap.git
  cd /d "%REPO%"
  git checkout %BRANCH%
)

set "RUNNER=%REPO%\skills\disaster-report\generator\scripts\publish_local.js"
if not exist "%RUNNER%" (
  echo STATUS: FAIL no-skill
  echo Not found: %RUNNER%
  echo The clone is on the wrong branch, or the fetch failed.
  pause
  exit /b 3
)

REM  --setup registers the daily task as well. Everything else,
REM  including whether to keep this window open, is decided in there.
node "%RUNNER%" --no-pull --setup
exit /b %ERRORLEVEL%
