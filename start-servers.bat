@echo off
setlocal enabledelayedexpansion

echo Starting all servers for AccountManager...

:: Create logs directory if it doesn't exist
if not exist logs mkdir logs

:: Kill any processes running on server ports
echo Checking for existing processes...
for %%p in (3000 3001 3002) do (
  echo Checking port %%p...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do (
    echo Killing process with PID %%a on port %%p
    taskkill /F /PID %%a >nul 2>&1
  )
)

:: Wait for processes to terminate
echo Waiting for processes to terminate...
timeout /t 2 >nul

:: Start servers in separate windows
echo Starting servers in separate windows...

:: Start Main Server (port 3000)
start "Main Server" cmd /k "echo Starting main server on port 3000... && npm run dev"

:: Start RAG Server (port 3001)
start "RAG Server" cmd /k "echo Starting RAG server on port 3001... && node rag-server.js"

:: Start Image Server (port 3002)
start "Image Server" cmd /k "echo Starting image server on port 3002... && node server.js"

echo.
echo All servers should now be starting...
echo Please check the server windows for any error messages.
echo.
echo Open http://localhost:5173 or http://127.0.0.1:5173 in your browser
echo.

echo Press any key to exit this window...
pause >nul 