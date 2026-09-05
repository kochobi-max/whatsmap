@echo off
REM ============================================================
REM  check_setup.bat - ADRC disaster report, setup checker
REM
REM  Double-click this. It changes NOTHING. It only reports whether
REM  everything the daily publish needs is in place.
REM
REM  Like daily_publish.bat, this file only calls node. The checks
REM  live in publish_local.js so they can be tested before shipping.
REM ============================================================
node "%~dp0publish_local.js" --check --no-pull
exit /b %ERRORLEVEL%
