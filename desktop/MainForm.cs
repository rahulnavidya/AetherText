using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AetherText.Desktop;

internal sealed class MainForm : Form
{
    private const string VirtualHost = "appassets.example";
    private const string AppUrl = "https://appassets.example/index.html";
    private const string WebViewRuntimePage = "https://developer.microsoft.com/microsoft-edge/webview2/";

    private readonly WebView2 _webView = new()
    {
        Dock = DockStyle.Fill,
        AllowExternalDrop = true
    };

    private bool _initializing;

    public MainForm()
    {
        Text = "AetherText";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 600);
        Size = new Size(1440, 900);
        BackColor = Color.FromArgb(17, 17, 27);
        System.Drawing.Icon? appIcon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (appIcon is not null) Icon = appIcon;
        Controls.Add(_webView);
        Shown += OnShown;
    }

    private async void OnShown(object? sender, EventArgs e)
    {
        if (_initializing) return;
        _initializing = true;

        string webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!File.Exists(Path.Combine(webRoot, "index.html")))
        {
            MessageBox.Show(
                this,
                "AetherText's web files could not be found. Re-extract the portable ZIP or reinstall AetherText so the wwwroot folder is beside AetherText.exe.",
                "AetherText files missing",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
            return;
        }

        string userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AetherText",
            "WebView2Profile");

        try
        {
            Directory.CreateDirectory(userData);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: userData);
            await _webView.EnsureCoreWebView2Async(environment);

            // A mapped HTTPS-like origin supports ES modules, IndexedDB, and service workers
            // without running a separate local HTTP server or granting file-system access.
            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost,
                webRoot,
                CoreWebView2HostResourceAccessKind.Allow);

            _webView.DefaultBackgroundColor = Color.FromArgb(17, 17, 27);
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            _webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
            _webView.CoreWebView2.DownloadStarting += OnDownloadStarting;
            _webView.CoreWebView2.DocumentTitleChanged += (_, _) =>
            {
                Text = string.IsNullOrWhiteSpace(_webView.CoreWebView2.DocumentTitle)
                    ? "AetherText"
                    : $"{_webView.CoreWebView2.DocumentTitle} — AetherText";
            };

            _webView.CoreWebView2.Navigate(AppUrl);
        }
        catch (Exception ex)
        {
            DialogResult result = MessageBox.Show(
                this,
                "AetherText couldn't start its embedded browser. It requires the Microsoft Edge WebView2 Runtime, which is already present on many Windows 10/11 PCs.\n\n" +
                "Choose Yes to open Microsoft's official runtime download page. After installing it, launch AetherText again.\n\n" +
                "Technical detail: " + ex.Message,
                "A browser runtime is required",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information);

            if (result == DialogResult.Yes)
                OpenExternal(WebViewRuntimePage);

            Close();
        }
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri))
        {
            e.Cancel = true;
            return;
        }

        if (uri.Host.Equals(VirtualHost, StringComparison.OrdinalIgnoreCase) &&
            uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return;

        // Keep top-level navigation inside the app. Ordinary web links open in the user's
        // default browser instead of replacing the editor window.
        e.Cancel = true;
        if (uri.Scheme is "http" or "https" or "mailto")
            OpenExternal(uri.ToString());
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? uri)) return;

        if (uri.Host.Equals(VirtualHost, StringComparison.OrdinalIgnoreCase) &&
            uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            _webView.CoreWebView2.Navigate(uri.ToString());
            return;
        }

        if (uri.Scheme is "http" or "https" or "mailto")
            OpenExternal(uri.ToString());
    }

    private void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        // Defer the download event before displaying a modal WinForms dialog. This avoids
        // re-entrancy in WebView2's download-starting callback.
        CoreWebView2Deferral deferral = e.GetDeferral();
        try
        {
            BeginInvoke((Action)(() =>
            {
                try
                {
                    string suggestedName = Path.GetFileName(e.ResultFilePath);
                    if (string.IsNullOrWhiteSpace(suggestedName))
                        suggestedName = "AetherText-export";

                    using var dialog = new SaveFileDialog
                    {
                        Title = "Save from AetherText",
                        FileName = suggestedName,
                        Filter = "All files (*.*)|*.*",
                        AddExtension = false,
                        OverwritePrompt = true,
                        RestoreDirectory = true
                    };

                    e.Handled = true;
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                        e.ResultFilePath = dialog.FileName;
                    else
                        e.Cancel = true;
                }
                catch
                {
                    // Fall back to WebView2's default download UI if the save dialog fails.
                    e.Handled = false;
                }
                finally
                {
                    deferral.Complete();
                }
            }));
        }
        catch
        {
            e.Handled = false;
            deferral.Complete();
        }
    }

    private static void OpenExternal(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Windows couldn't open this link.\n\n" + ex.Message,
                "Unable to open link",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
