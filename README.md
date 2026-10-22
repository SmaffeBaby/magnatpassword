# Magnat Password

Личное хранилище паролей на точном стеке проекта `/Users/developer/Documents/vetro`: Nuxt 4.6.1, Vue 3.5.44, Nuxt UI 4.11.3, Tailwind 4.3.3, Pinia 4.1.0, Supabase JS 2.117.3, Nuxt Content, i18n, nuxt-security, Zod, SheetJS, nodemailer и fast-xml-parser. Все dependencies, devDependencies и версии из исходного package-lock сохранены. Шаблон `/admin` использует те же UDashboardGroup, UDashboardSidebar, UDashboardPanel, UDashboardNavbar и UNavigationMenu, тему sky/slate и исходную серверную проверку прав.

## Запуск

Нужны Node 24 и Docker Compose 2.24+ (include, !override).

```sh
# Для нового checkout; текущие .env уже созданы с новыми случайными ключами.
node scripts/init-env.mjs

docker compose up -d --build
# После первого запуска создайте администратора (нужен Node 24):
node --env-file=.env scripts/create-admin.mjs
```

Сайт: http://localhost:3003 · Админка: http://localhost:3003/admin · Supabase Studio: http://localhost:8003

Данные первого администратора записываются в `.local/admin-credentials.txt` с правами 0600. Вход в Studio — DASHBOARD_USERNAME / DASHBOARD_PASSWORD из `supabase/.env`. Эти файлы исключены из Git и Docker build context. Мастер-пароль вы создаёте самостоятельно при первом открытии хранилища. Он отличается от пароля аккаунта.

Регистрация доступна на главной. Для локальной разработки подтверждение email отключено. Перед размещением в интернете настройте SMTP и ENABLE_EMAIL_AUTOCONFIRM=false в `supabase/.env`, внешние URL, HTTPS и ограничения регистрации. Порты привязаны к loopback; для доступа с других устройств используйте HTTPS reverse proxy. Web Crypto работает на localhost или HTTPS.

## Возможности

- Личные категории с цветом и иконкой; создание, редактирование, удаление. При удалении категории записи сохраняются.
- Карточки: название, HTTP(S) адрес, логин, пароль, заметка, категория и избранное.
- Поиск, сортировка, копирование логина и пароля, криптографический генератор на 24 символа.
- Мастер-пароль, ручная блокировка и автоблокировка через 5 минут бездействия.
- Зашифрованная резервная копия JSON. Интерфейс восстановления пока не реализован; копия содержит соль, шифротекст, ID владельца и параметры KDF, необходимые для будущего восстановления.
- `/admin`: обзор, управление своими категориями и карточками, список аккаунтов (до 1000), параметры безопасности. Администратор не получает содержимое чужих хранилищ.

## Данные и шифрование

Вся полезная нагрузка (включая категории, логины, пароли, адреса и заметки) шифруется в браузере AES-256-GCM. Ключ получается из мастер-пароля через PBKDF2-SHA256 с 600 000 итерациями и случайной солью 32 байта. Каждое сохранение получает новый 12-байтовый IV; ID владельца используется как authenticated additional data. CryptoKey неизвлекаемый, хранится в памяти и удаляется при блокировке/выходе. Мастер-пароль не отправляется на сервер и не сохраняется в localStorage. Supabase Auth сохраняет собственную сессию аккаунта обычным способом. Сброс пароля аккаунта не восстанавливает мастер-пароль.

Таблица `vaults` содержит user_id, salt, encrypted_data, revision и updated_at. Оптимистическая проверка revision предотвращает потерю обновлений из другой вкладки. RLS разрешает операции только владельцу. `site_admins` хранит права панели. Приватный bucket `vault-files` зарезервирован для будущих зашифрованных вложений: только application/octet-stream, до 10 MB, доступ только к папке с собственным user_id; загрузки файлов в этой версии нет. Данные, bucket, пользователи, ключи и Docker volumes vetro не копировались.

Переназначить роль существующему аккаунту можно в SQL Editor Studio:

```sql
insert into public.site_admins(user_id)
select id from auth.users where email = 'your-admin@example.com'
on conflict do nothing;
```

## Разработка и проверки

```sh
npm ci
npm run dev          # :3003; остановите Docker app, если он занимает порт
npm run typecheck
npm test
npm run build
# Интеграционные проверки RLS/Auth/admin, только на локальном тестовом Supabase:
node --env-file=.env --test tests/integration.test.mjs
```

Интеграционный тест создаёт временные аккаунты и удаляет только их после проверки. Для локальной разработки сервисы можно оставить запущенными и остановить лишь приложение: `docker compose stop app`. Dev использует Supabase на :8003. Режим Node 24 обеспечивает поддержку TypeScript в тестах и native SQLite для Nuxt Content.

## Docker

Сохранён полный состав сервисов и версии образов vetro: PostgreSQL, Auth, PostgREST, Storage, imgproxy, Studio, postgres-meta, Realtime, Edge Runtime, Supavisor и Kong. Новый отдельный Compose project: `magnat-password`. Порты: сайт 3003, API/Studio 8003, Kong HTTPS 8446, pooler 5434/6545. Отдельные named volumes: `magnat-password_db-data`, `magnat-password_db-config`, `magnat-password_storage-data`, `magnat-password_deno-cache`. Сервис `migrate` идемпотентно применяет `supabase/migrations/001_vault.sql` после готовности Storage; Nuxt запускается после миграций. Nuxt image многостадийный, production runtime работает от пользователя node и проверяет `/api/health`.

```sh
docker compose ps
docker compose logs -f app
docker compose down        # данные остаются в volumes
```

Для резервирования сервера нужны также PostgreSQL backup и сохранённые `supabase/.env` и `.env`. Browser export — отдельная копия одного хранилища. Не удаляйте volumes без резервной копии.

## Зафиксированные зависимости

`npm audit` при проверке скопированного lockfile отметил 14 затронутых пакетов: 13 high и 1 low. Прямые advisories относятся к транзитивным `braces`, `node-forge` и `esbuild`; остальные отметки распространяются по дереву зависимостей. Версии оставлены точными по требованию переноса стека. Перед публичным использованием парольного сервиса нужен отдельный проход по обновлениям и аудиту безопасности. Локальный отчёт: `.local/npm-audit.json`.
