Option Explicit

Dim shell
Dim fso
Dim rootPath
Dim command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

rootPath = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & rootPath & "\scripts\start_sm_techno_app.ps1"""

shell.CurrentDirectory = rootPath
shell.Run command, 0, False
