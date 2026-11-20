//! Fixed application directories only. The renderer cannot supply a path.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum FolderKind {
    Data,
    Local,
    Config,
    Cache,
}

#[derive(serde::Serialize)]
pub(crate) struct AppDataFolder {
    kind: FolderKind,
    path: PathBuf,
}

fn folder_path(app: &AppHandle, kind: FolderKind) -> Result<PathBuf, String> {
    let resolver = app.path();
    match kind {
        FolderKind::Data => resolver.app_data_dir(),
        FolderKind::Local => resolver.app_local_data_dir(),
        FolderKind::Config => resolver.app_config_dir(),
        FolderKind::Cache => resolver.app_cache_dir(),
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn app_data_folders(app: AppHandle) -> Result<Vec<AppDataFolder>, String> {
    let mut folders: Vec<AppDataFolder> = Vec::new();
    for kind in [
        FolderKind::Data,
        FolderKind::Local,
        FolderKind::Config,
        FolderKind::Cache,
    ] {
        let path = folder_path(&app, kind)?;
        if path.is_dir() && !folders.iter().any(|folder| folder.path == path) {
            folders.push(AppDataFolder { kind, path });
        }
    }
    Ok(folders)
}

#[tauri::command]
pub(crate) fn open_data_folder(app: AppHandle, kind: FolderKind) -> Result<(), String> {
    let path = folder_path(&app, kind)?;
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::FolderKind;
    #[test]
    fn accepts_only_fixed_directory_identifiers() {
        for input in [
            r#""C:/private""#,
            r#""../""#,
            r#""https://example.org""#,
            r#"{"path":"C:/"}"#,
        ] {
            assert!(serde_json::from_str::<FolderKind>(input).is_err());
        }
        for input in [r#""data""#, r#""local""#, r#""config""#, r#""cache""#] {
            assert!(serde_json::from_str::<FolderKind>(input).is_ok());
        }
    }
}
