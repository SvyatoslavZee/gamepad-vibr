# Security Check

Дата проверки: 2026-05-30.

## Что проверили

Локально выполнены проверки:

```bash
node --check yandex-dualsense-haptics-bridge/bridge.js
node --check yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
node -e "JSON.parse(require('fs').readFileSync('yandex-dualsense-haptics-bridge/manifest.json', 'utf8')); console.log('manifest json ok')"
```

Результат:

- `bridge.js` валиден;
- `inject-devtools-bridge.js` валиден;
- `manifest.json` валиден.

## Поиск рискованных мест

Проверены вхождения по паттернам:

- `eval(`
- `new Function`
- `child_process`
- `exec(` / `spawn(`
- `document.cookie`
- `chrome.cookies`
- `password`
- `token`
- `secret`
- `api_key`
- сетевые API вроде `fetch`, `XMLHttpRequest`, `WebSocket`

Найденные ожидаемые места:

- `navigator.hid.requestDevice()` и `navigator.hid.getDevices()` — нужны для выбора DualSense через WebHID.
- `device.sendReport(...)` — нужен для отправки команд вибрации на геймпад.
- `WebSocket` в `inject-devtools-bridge.js` — используется только для локального подключения к DevTools Protocol на `127.0.0.1:9222`.
- `remote-debugging-port=9222` в документации — нужен для локального запуска injector.

Не найдено:

- кражи cookie;
- чтения паролей;
- токенов/API keys;
- запуска системных команд из bridge;
- отправки данных на внешний сервер;
- скомпилированных бинарников в публичном `main`.

## Что добавлено в GitHub

Добавлен workflow `.github/workflows/security.yml`:

- проверяет синтаксис JavaScript;
- проверяет `manifest.json`;
- запускает CodeQL JavaScript analysis;
- запускается на push, pull request, вручную и раз в неделю.

Добавлен `SECURITY.md`, где простым языком описано:

- что делает bridge;
- какие permissions нужны;
- чего проект не делает;
- как проверить проект вручную.

## Ограничения

Эта проверка не является антивирусной сертификацией. Она показывает, что проект:

- прозрачно опубликован в исходниках;
- не содержит бинарников;
- не содержит зависимостей, которые нужно устанавливать;
- проходит базовую автоматическую проверку GitHub Actions / CodeQL.
