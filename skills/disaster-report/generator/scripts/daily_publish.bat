@echo off
REM ============================================================
REM  daily_publish.bat - ADRC disaster report, daily publish
REM
REM  This file deliberately does nothing but call node. All of the
REM  logic lives in publish_local.js, next to this file.
REM
REM  Why: on 2026-08-28 three separate faults in this batch each cost
REM  a round trip with the user, and all three were cmd-specific -
REM  a pause inside a caller's redirect, block expansion, and reading
REM  success from an exit code. None of them can be reproduced from a
REM  Linux session, so they shipped untested. publish_local.js can be
REM  run and tested before it is handed over. Keep this file tiny.
REM ============================================================
node "%~dp0publish_local.js" %*
exit /b %ERRORLEVEL%
