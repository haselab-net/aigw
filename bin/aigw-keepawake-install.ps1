# aigw-keepawake-install.ps1 -- installs aigw-keepawake.ps1 (the deployment notes) on a
# Windows ssh machine: C:\ProgramData\aigw\keepawake.ps1 and the Scheduled Task
# "aigw-keepawake" (SYSTEM; at startup, and every $Every minutes as a watchdog:
# a run while the script is still going is skipped). Run as an administrator
# (the aiops account) with aigw-keepawake.ps1 copied to that account's home:
#   scp aigw-keepawake.ps1 aigw-keepawake-install.ps1 <machine>:
#   ssh <machine> powershell -NoProfile -ExecutionPolicy Bypass -File aigw-keepawake-install.ps1
# Re-running it replaces a running copy. The directory is made writable by
# Administrators/SYSTEM only: SYSTEM runs the script, and the aigw user there
# may be a standard user.
param([int]$Every = 5)
$d = 'C:\ProgramData\aigw'
New-Item -ItemType Directory -Force $d | Out-Null
# Only Administrators/SYSTEM may change what SYSTEM runs; Users read.
icacls $d /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
# Hold the machine awake ourselves while the running copy is replaced: when
# it stops, its hold goes, and a machine whose keyboard was last touched more
# than the sleep timeout ago sleeps at once (seen on one machine, 2026-11-11 16:19, in the
# middle of this script). Released when this script ends.
Add-Type -Name P -Namespace AigwKeepAwakeInstall -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][AigwKeepAwakeInstall.P]::SetThreadExecutionState([uint32]2147483649)
Stop-ScheduledTask -TaskName 'aigw-keepawake' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | ? { $_.CommandLine -like '*keepawake.ps1*' } | % { Stop-Process -Id $_.ProcessId -Force }
Copy-Item -Force "$HOME\aigw-keepawake.ps1" "$d\keepawake.ps1"
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $d\keepawake.ps1"
$t = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Every)))
$p = New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
Register-ScheduledTask -TaskName 'aigw-keepawake' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
$i = Get-ScheduledTask -TaskName 'aigw-keepawake'
"$env:COMPUTERNAME aigw-keepawake: user=$($i.Principal.UserId) triggers=$($i.Triggers.Count) every=$($i.Triggers[1].Repetition.Interval) limit=$($i.Settings.ExecutionTimeLimit)"
(icacls $d) -join ' ' -replace '\s+',' '
Start-ScheduledTask -TaskName 'aigw-keepawake'
# Let the new copy take its hold (it checks at once, then every minute) before ours goes.
Start-Sleep -Seconds 20
