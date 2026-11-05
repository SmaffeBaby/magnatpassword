fn main() {
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&["open_external", "save_download", "notification_permission", "set_unread_count", "show_unread_notification"])
  )).expect("failed to build native action permissions")
}
