' ==============================================================================
' DropNexus - Silent Windows Desktop Launcher
' Runs DropNexus completely in the background without any black console window!
' ==============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
Q = Chr(34)

' Get project root directory
ScriptPath = WScript.ScriptFullName
RootDir = FSO.GetParentFolderName(ScriptPath)
WshShell.CurrentDirectory = RootDir

' Detect Node.js (Portable .node or System Node)
PortableNode = RootDir & "\.node\node.exe"
NodeExe = "node"
If FSO.FileExists(PortableNode) Then
    NodeExe = PortableNode
End If

' Check if DropNexus server is already running on port 3000
IsRunning = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.Open "GET", "http://localhost:3000/api/info", False
http.setTimeouts 600, 600, 600, 600
http.Send ""
If Err.Number = 0 Then
    If http.Status = 200 Then
        IsRunning = True
    End If
End If
On Error GoTo 0

' If server is not running, start it silently (0 = SW_HIDE, False = async non-blocking)
If Not IsRunning Then
    Command = "cmd.exe /c node " & Q & RootDir & "\server.js" & Q & " > " & Q & RootDir & "\launch_log.txt" & Q & " 2>&1"
    WshShell.Run Command, 0, False
    WScript.Sleep 1500
End If

' Locate Edge or Chrome for dedicated App Mode window (native desktop look)
BrowserExe = ""
Candidates = Array(_
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Google\Chrome\Application\chrome.exe", _
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", _
    WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"), _
    WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe") _
)

For Each candidatePath In Candidates
    If FSO.FileExists(candidatePath) Then
        BrowserExe = candidatePath
        Exit For
    End If
Next

AppUrl = "http://localhost:3000/sender"

' Launch application window
If BrowserExe <> "" Then
    WshShell.Run Q & BrowserExe & Q & " --app=" & AppUrl, 1, False
Else
    WshShell.Run AppUrl, 1, False
End If
