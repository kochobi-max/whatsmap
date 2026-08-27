@echo off
REM ============================================================
REM  check_setup.bat - ADRC disaster report, setup checker
REM
REM  Double-click this. It changes NOTHING. It only checks whether
REM  everything daily_publish.bat needs is in place, and prints one
REM  line per item. The window stays open so you can read it.
REM
REM  Tell Claude only the lines that say NG.
REM ============================================================
setlocal EnableDelayedExpansion

set "REPO=C:\Users\arakida\whatsmap"
set "DEST=C:\Users\arakida\OneDrive - adrc.asia\LargeScaleDisasters"
set "NODEMOD=C:\Users\arakida\node_modules"
set "BRANCH=claude/workflow-automation-review-shyt35"
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

REM ---- 3. the clone ----
if not exist "%REPO%\.git" (
  echo NG  3 repo         no git clone at %REPO%
  echo        Fix: cd C:\Users\arakida  ^&^&  git clone https://github.com/kochobi-max/whatsmap.git
) else (
  echo OK  3 repo         %REPO%
)

REM ---- 4. the skill files, i.e. the right branch ----
if not exist "%REPO%\skills\disaster-report\generator\gen_deck.base.js" (
  echo NG  4 branch       the skill is not in this checkout
  echo        Fix: cd /d "%REPO%"  ^&^&  git fetch origin %BRANCH%  ^&^&  git checkout %BRANCH%
) else (
  echo OK  4 branch       skill files present
)

REM ---- 5. pptxgenjs ----
if not exist "%NODEMOD%\pptxgenjs" (
  echo NG  5 pptxgenjs    not at %NODEMOD%
  echo        Fix: cd C:\Users\arakida  ^&^&  npm install pptxgenjs
) else (
  echo OK  5 pptxgenjs    %NODEMOD%
)

REM ---- 6. LibreOffice ----
set "SOFF=C:\Program Files\LibreOffice\program\soffice.exe"
if exist "%SOFF%" (
  echo OK  6 soffice      %SOFF%
) else (
  if exist "C:\Program Files (x86)\LibreOffice\program\soffice.exe" (
    echo OK  6 soffice     C:\Program Files ^(x86^)\LibreOffice\program\soffice.exe
    echo        Note: not the default path. daily_publish.bat sets SOFFICE for you.
  ) else (
    echo NG  6 soffice      LibreOffice not found in the usual places
    echo        Fix: tell Claude where soffice.exe is, or install LibreOffice
  )
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
