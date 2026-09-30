@echo off
rem Allow the Bitaxe (and any other LAN miner) to reach the DeroM Stratum port.
rem Windows blocks inbound TCP 3333 by default, so the Bitaxe cannot connect.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall add rule name="DeroM Stratum 3333" dir=in action=allow protocol=TCP localport=3333
echo.
echo Firewall rule added. Miners on the LAN can now reach port 3333.
pause
