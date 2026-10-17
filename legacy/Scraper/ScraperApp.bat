@echo off
echo Starting Academic Tools...

:: Navigate to project directory first
cd /d "d:\Scraper"

:: Start Backend
start "Backend API" cmd /k "cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

:: Start Frontend
start "Frontend App" cmd /k "cd frontend && npm run dev"

echo Waiting for servers to start...
timeout /t 5 /nobreak >nul

:: Open Browser
start http://localhost:5173

echo Done! Do not close the server windows.
