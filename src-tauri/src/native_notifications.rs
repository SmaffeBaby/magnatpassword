use tauri::AppHandle;
#[cfg(not(target_os = "ios"))]
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub async fn notification_permission(app: AppHandle, request: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = if request { app.notification().request_permission() } else { app.notification().permission_state() };
        state.map(|state| state == tauri::plugin::PermissionState::Granted)
            .map_err(|_| "Не удалось проверить разрешение уведомлений.".to_string())
    }).await.map_err(|_| "Не удалось открыть настройки уведомлений.".to_string())?
}

#[tauri::command]
pub async fn set_unread_count(app: AppHandle, count: u32) -> Result<(), String> {
    if count == 0 { let _ = app.notification().remove_active(vec![1]); }
    #[cfg(not(target_os = "ios"))]
    let window = app.get_webview_window("main").ok_or("Окно приложения недоступно.")?;
    #[cfg(target_os = "windows")]
    { let icon = if count == 0 { None } else { Some(windows_badge(count)) }; return window.set_overlay_icon(icon).map_err(|_| "Не удалось обновить значок уведомлений.".into()); }
    #[cfg(target_os = "ios")]
    return app.run_on_main_thread(move || {
        if let Some(main_thread) = objc2::MainThreadMarker::new() {
            let application = objc2_ui_kit::UIApplication::sharedApplication(main_thread);
            #[allow(deprecated)]
            application.setApplicationIconBadgeNumber(count.min(i32::MAX as u32) as isize);
        }
    }).map_err(|_| "Не удалось обновить значок уведомлений.".to_string());
    #[cfg(not(any(target_os = "windows", target_os = "android", target_os = "ios")))]
    return window.set_badge_count(Some(i64::from(count))).map_err(|_| "Не удалось обновить значок уведомлений.".into());
    #[cfg(target_os = "android")]
    { let _ = window; Ok(()) }
}

#[tauri::command]
pub async fn show_unread_notification(app: AppHandle, count: u32) -> Result<bool, String> {
    if count == 0 || app.notification().permission_state().ok() != Some(tauri::plugin::PermissionState::Granted) { return Ok(false); }
    app.notification().builder().id(1).title("Magnat")
        .body(format!("Непрочитанных уведомлений: {count}. Откройте Magnat, чтобы посмотреть."))
        .auto_cancel().show().map_err(|_| "Не удалось показать системное уведомление.".to_string())?;
    Ok(true)
}

#[cfg(target_os = "windows")]
fn windows_badge(count: u32) -> tauri::image::Image<'static> {
    const DIGITS: [[u8; 5]; 10] = [[7,5,5,5,7],[2,6,2,2,7],[7,1,7,4,7],[7,1,7,1,7],[5,5,7,1,1],[7,4,7,1,7],[7,4,7,5,7],[7,1,1,1,1],[7,5,7,5,7],[7,5,7,1,7]];
    let mut pixels = vec![0u8; 32 * 32 * 4];
    for y in 0i32..32 { for x in 0i32..32 { if (x-16).pow(2)+(y-16).pow(2) < 240 { let i=((y*32+x)*4) as usize; pixels[i..i+4].copy_from_slice(&[200,30,45,255]); } } }
    let text = count.min(99).to_string();
    let left = (32 - (text.len() * 12 - 3)) / 2;
    for (index, digit) in text.bytes().enumerate() { for (row, bits) in DIGITS[(digit-b'0') as usize].iter().enumerate() { for col in 0..3 { if bits & (4 >> col) != 0 { for dy in 0..3 { for dx in 0..3 { let x=left+index*12+col*3+dx; let y=8+row*3+dy; let i=(y*32+x)*4; pixels[i..i+4].copy_from_slice(&[255,255,255,255]); } } } } } }
    tauri::image::Image::new_owned(pixels,32,32)
}
