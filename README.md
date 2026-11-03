# Magnat

## Сайт

Node.js 24.15+ (ветка 24), зависимости: `npm ci`. Сайт и общий backend:

```sh
npm run docker:up
```

Сайт доступен на `http://localhost:3003`. Секреты сервера хранятся в `.env`, пример — `.env.example`.

## Приложения macOS и iOS (Tauri 2)

Интерфейс Nuxt/Vue общий с сайтом. Серверные API, Supabase, аккаунты и данные
остаются на существующем сервере. Приложение не запускает собственную базу или Node.js.
Для этой первой локальной версии сервер сайта должен работать на том же Mac.

Нужны Rust stable, Node.js 24.15+ и Xcode. Для iOS также XcodeGen и CocoaPods.
Если Node 24 установлен через Homebrew, перед командами:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$HOME/.cargo/bin:$PATH"
```

### macOS

```sh
npm run macos:dev
npm run macos:build
```

`macos:dev` запускает интерфейс на порту 3004 и нативное окно. Backend остаётся на
3003. `macos:build` создаёт `src-tauri/target/release/bundle/macos/Magnat.app`.
Это локальная неподписанная сборка; распространение требует отдельной настройки подписи.

### iOS

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm run ios:init
npm run ios:dev -- "iPhone 18 Pro"
```

Для сборки под симулятор без сертификата:

```sh
npm run ios:build -- --debug --target aarch64-sim --no-sign
```

Xcode-проект: `src-tauri/gen/apple/app.xcodeproj`. Для запуска на физическом iPhone
потребуются Apple ID / Development Team и доступный с телефона сервер.
`localhost` на iPhone обозначает сам телефон, а не Mac.

### Адрес сервера

По умолчанию `MAGNAT_SERVER_URL=http://localhost:3003`. Его можно задать в `.env`
или окружении перед сборкой. Это должен быть origin без пути и секретов.
При смене сервера также обновите `connect-src` / `img-src` CSP в
`src-tauri/tauri.conf.json`. Для удалённого сервера используйте HTTPS.
Исключение iOS ATS сейчас разрешает HTTP только для localhost.

Сборка приложений (`npm run native:generate`) находится в `.output-native/public`,
кэш — в `.nuxt-native`; веб-сборка использует обычные `.output` и `.nuxt`.
Нативные API-запросы и ссылки Supabase отправляются на сервер сайта.
Backend разрешает CORS с `tauri://localhost` и локального интерфейса разработки
`http://localhost:3004`; проверка JWT и прав остаётся прежней.
После обновления серверных настроек пересоберите контейнер сайта.

На текущем Mac каталог `src-tauri/target` перенесён на внешний диск в
`/Volumes/KINGSTON/Developer/MagnatPassword/target` и подключён символической ссылкой.
Для нативных сборок и открытия приложения по пути внутри `target` подключайте KINGSTON.
Исходники и данные Supabase остаются в прежних каталогах.
Также на SSD перенесены `src-tauri/gen/apple/build`, `Externals` и каталоги
Nuxt для нативной сборки. Локальная переменная `MAGNAT_NATIVE_BUILD_ROOT` в `.env`
направляет Nuxt прямо на SSD. При отключённом диске команда завершится ошибкой,
а не начнёт новую нативную сборку на внутреннем диске.

На этом Mac кэши `~/.npm`, `~/Library/Developer/Xcode/DerivedData` и
`~/Library/Developer/Xcode/iOS DeviceSupport` также направлены символическими
ссылками в `/Volumes/KINGSTON/Developer/BuildCaches`. Подключайте диск перед
работой с npm или Xcode. `iOS DeviceSupport` содержит файлы отладки физических
iPhone и может занимать много места даже без запуска сборки.
Системные среды симуляторов в `/Library/Developer/CoreSimulator` и swap macOS
по-прежнему находятся на внутреннем диске.

### Установка на личный iPhone

Обычный Apple ID позволяет устанавливать приложение через Xcode с Personal Team.
Подпись действует 7 дней; после истечения приложение нужно повторно подписать и
переустановить. Неподписанный IPA и сборка для симулятора не устанавливаются
обычным открытием файла на iPhone. Для Ad Hoc / TestFlight нужна подписка
Apple Developer Program и соответствующая настройка распространения.
До сборки для телефона добавьте Apple ID в Xcode, подключите устройство,
настройте Team и замените localhost адресом сервера, доступным с iPhone,
с соответствующей настройкой CSP, CORS и iOS ATS.

Первая версия использует существующую авторизацию Supabase в WebView. Офлайн-режим,
системное автозаполнение паролей, биометрия и защищённое системное хранение сессии
не подключены. Экспорт/скачивание файлов на iOS требует отдельной проверки и адаптации.

Проверки:

```sh
npm run typecheck
npm test
npm run native:generate
```
