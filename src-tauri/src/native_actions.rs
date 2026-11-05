use std::io::Write;
use tauri::{AppHandle, Url};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FsExt, OpenOptions};
use tauri_plugin_opener::OpenerExt;

fn external_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Некорректная ссылка.".to_string())?;
    if !matches!(url.scheme(), "http" | "https" | "mailto" | "tel")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Этот тип ссылки не поддерживается.".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let url = external_url(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Не удалось открыть ссылку в браузере устройства.".into())
}

#[tauri::command]
pub async fn save_download(app: AppHandle, filename: String, bytes: Vec<u8>) -> Result<bool, String> {
    // The website supplies only a suggested name, never a filesystem path.
    if filename.is_empty() || filename.len() > 1024 || filename.contains(['/', '\\', '\0'])
        || filename == "." || filename == ".."
    {
        return Err("Некорректное имя файла.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = app.dialog().file().set_file_name(&filename).blocking_save_file() else {
            return Ok(false);
        };
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        let result = (|| {
            let mut file = app.fs().open(path.clone(), options)?;
            file.write_all(&bytes)?;
            file.flush()
        })();
        #[cfg(target_os = "ios")]
        let _ = app.fs().stop_accessing_security_scoped_resource(path);
        result.map(|_| true).map_err(|_: std::io::Error| "Не удалось сохранить файл в выбранное место.".to_string())
    })
    .await
    .map_err(|_| "Не удалось открыть окно сохранения файла.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::external_url;
    #[test]
    fn only_device_link_schemes_are_allowed() {
        for url in ["https://example.com/", "http://192.168.10.162:3003", "mailto:user@example.com", "tel:+79990000000"] {
            assert!(external_url(url).is_ok());
        }
        for url in ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com", "broken"] {
            assert!(external_url(url).is_err());
        }
    }
}
