//! Native browser controls must not take over editor input.

#[cfg(windows)]
pub fn disable_browser_controls(
    webview: tauri::webview::PlatformWebview,
) -> windows::core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    // SAFETY: Tauri runs with_webview on the UI thread. The controller and its
    // settings remain valid for this callback; no COM handle leaves the thread.
    unsafe {
        let settings = webview.controller().CoreWebView2()?.Settings()?;
        settings.SetAreDefaultContextMenusEnabled(false)?;
        settings
            .cast::<ICoreWebView2Settings3>()?
            .SetAreBrowserAcceleratorKeysEnabled(false)?;
    }
    Ok(())
}
