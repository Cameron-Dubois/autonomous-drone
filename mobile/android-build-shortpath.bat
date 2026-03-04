@echo off
REM Build Android from D:\ to avoid Windows 260-char path limit.
REM Run with: npm run android:shortpath

set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

REM Map project to D:\ (reuses existing subst if present)
subst D: /d 2>nul
subst D: "%PROJECT_ROOT%"

cd /d D:\

REM Clean build artifacts that may have long paths cached
if exist "D:\android\app\.cxx" rd /s /q "D:\android\app\.cxx"
if exist "D:\android\build" rd /s /q "D:\android\build"

REM Ensure deps exist (from short path)
if not exist "D:\node_modules" npm install

echo Building from D:\ (short path)...
call npx expo run:android
set EXIT_CODE=%errorlevel%

subst D: /d 2>nul
exit /b %EXIT_CODE%
