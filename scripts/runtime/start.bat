@echo off
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "NODE_EXE=%ROOT_DIR%\node\node.exe"
if not exist "%NODE_EXE%" (
  echo Portable Node not found: %NODE_EXE%
  exit /b 1
)

if not exist "%ROOT_DIR%\admin\fe\dist\index.html" (
  echo Missing admin frontend build at admin\fe\dist\index.html
  exit /b 1
)

if not exist "%ROOT_DIR%\web\dist\index.html" (
  echo Missing public site build at web\dist\index.html
  exit /b 1
)

start "EOD Admin Backend" cmd /c ""%NODE_EXE%" "%ROOT_DIR%\admin\be\index.js""
start "EOD Site" cmd /c ""%NODE_EXE%" "%ROOT_DIR%\scripts\runtime\site-server.mjs""

echo.
echo Admin portal: http://localhost:3001
echo Public site:  http://localhost:4321
echo.
echo Keep both opened terminal windows running.

endlocal
