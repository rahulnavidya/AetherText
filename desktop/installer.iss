#define MyAppName "AetherText"
#define MyAppPublisher "AetherText Contributors"
#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#define PublishDir AddBackslash(SourcePath) + "..\artifacts\publish"

[Setup]
AppId={{A9D5B1B7-3C65-4F13-9A49-A7E7E7700001}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/rahulnavidya/AetherText
AppSupportURL=https://github.com/rahulnavidya/AetherText/issues
DefaultDirName={localappdata}\Programs\AetherText
DefaultGroupName=AetherText
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\artifacts
OutputBaseFilename=AetherText-Setup-x64
SetupIconFile=AetherText.ico
UninstallDisplayIcon={app}\AetherText.exe
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}
VersionInfoProductName=AetherText
VersionInfoDescription=A lightweight local-first text and Markdown editor

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\AetherText"; Filename: "{app}\AetherText.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\AetherText"; Filename: "{app}\AetherText.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\AetherText.exe"; Description: "Launch AetherText"; Flags: postinstall nowait skipifsilent
