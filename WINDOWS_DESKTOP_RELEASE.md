# Windows desktop release

AetherText remains a vanilla HTML/CSS/JavaScript application. The desktop host is a small C# WinForms shell that uses Microsoft Edge WebView2 to display the existing app from a mapped local folder. It is not Electron or Tauri.

## What the Windows release workflow produces

When a GitHub Release is published, `.github/workflows/release-windows.yml` runs tests on a Windows runner, publishes the WebView2 host as a self-contained x64 application, creates an Inno Setup installer, and attaches three assets to that same GitHub Release:

- `AetherText-Setup-x64.exe` — installer with Start Menu shortcut and optional desktop shortcut.
- `AetherText-Portable-x64.zip` — extract and run `AetherText.exe` without installing it.
- `SHA256SUMS.txt` — checksums for the two downloads.

The native host is self-contained for .NET, but it requires Microsoft's WebView2 Runtime. If that runtime is absent, the app offers to open Microsoft's official download page. The app's local files are in `wwwroot`; the WebView2 profile is under `%LOCALAPPDATA%\AetherText\WebView2Profile`.

## First release from GitHub's website

1. Add the new `desktop/` folder and `.github/workflows/release-windows.yml` to the repository and commit them to the default branch. Also add this document if desired.
2. Ensure GitHub Actions is enabled and the repository permits workflows to write release assets (`Settings → Actions → General → Workflow permissions → Read and write permissions`, if the repository's defaults require this).
3. Open `Releases → Draft a new release`.
4. Create the tag `v2.0.0` targeting the commit containing the workflow, enter a release title such as `AetherText v2.0.0`, and publish it.
5. Open the `Actions` tab. The `Build Windows desktop release` workflow should run. After it succeeds, return to the release page; the installer, portable ZIP, and checksums will appear under Assets.

Do not create the release before the workflow file has been committed, or the first build will not run.

## Developer testing

The Windows build is performed by GitHub Actions because it needs a Windows SDK/runtime and Inno Setup. Local development requires the .NET 10 SDK and the WebView2 Runtime. Run `dotnet publish desktop/AetherText.Desktop.csproj -c Release -r win-x64 --self-contained true -o artifacts/publish` from the repository root to test the native host build.

## Distribution notes

This packages the desktop app for Windows x64; it does not create an Android APK or F-Droid package. WebView2 is a Microsoft runtime dependency. Code signing is not configured, so Windows SmartScreen may show an unknown-publisher warning until the binary is signed with a trusted code-signing certificate and gains reputation.
