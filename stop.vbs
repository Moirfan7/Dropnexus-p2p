' DropNexus Silent Stop
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptPath = WScript.ScriptFullName
RootDir = FSO.GetParentFolderName(ScriptPath)
StopBat = RootDir & "\Stop-DropNexus.bat"
WshShell.Run """" & StopBat & """", 0, True
