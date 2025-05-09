@echo off
echo Stopping all AccountManager servers...

:: Kill processes running on server ports
for %%p in (3000 3001 3002) do (
  echo Checking port %%p...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do (
    echo Stopping process with PID %%a on port %%p
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! equ 0 (
      echo Process on port %%p stopped successfully.
    ) else (
      echo Failed to stop process on port %%p.
    )
  )
)

echo.
echo All servers should now be stopped.
echo.

pause 