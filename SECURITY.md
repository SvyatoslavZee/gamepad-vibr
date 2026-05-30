# Безопасность

Этот репозиторий содержит browser-side bridge для DualSense в Яндекс Игромире / Плюс Гейминге.

## Что делает проект

- Запускает JavaScript bridge в странице Игромира.
- Запрашивает доступ к геймпаду через стандартный WebHID picker браузера.
- Отправляет HID-команды вибрации на выбранный Sony DualSense.
- Патчит `navigator.getGamepads()` внутри страницы, чтобы игровой клиент увидел поддержку `vibrationActuator`.

## Чего проект не делает

- Не содержит скомпилированных бинарников.
- Не содержит npm-зависимостей.
- Не собирает логины, пароли, cookie, токены или платежные данные.
- Не отправляет данные на внешний сервер.
- Не обходит оплату, авторизацию, DRM или доступ к облачному геймингу.
- Не устанавливает системные драйверы и не меняет настройки macOS.

## Почему браузер просит доступ к устройству

Вибрация DualSense отправляется через WebHID. Браузер обязан показать системное окно выбора HID-устройства. Выбирать нужно только реальный геймпад:

- USB: `Wireless Controller`
- Bluetooth: `DualSense Wireless Controller`

`GamePad-1` выбирать не нужно: это виртуальный слой macOS без нужного пути вибрации.

## GitHub-проверки

В репозитории включен workflow `Security checks`:

- синтаксическая проверка `bridge.js`;
- синтаксическая проверка `inject-devtools-bridge.js`;
- проверка валидности `manifest.json`;
- CodeQL-анализ JavaScript-кода.

GitHub также поддерживает secret scanning для публичных репозиториев. Если GitHub найдет похожий на секрет токен, alert появится во вкладке **Security** репозитория.

## Как проверить вручную

```bash
node --check yandex-dualsense-haptics-bridge/bridge.js
node --check yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
node -e "JSON.parse(require('fs').readFileSync('yandex-dualsense-haptics-bridge/manifest.json', 'utf8')); console.log('manifest json ok')"
```

Дополнительно можно посмотреть исходный код перед запуском. Главные файлы:

- `yandex-dualsense-haptics-bridge/bridge.js`
- `yandex-dualsense-haptics-bridge/inject-devtools-bridge.js`
- `yandex-dualsense-haptics-bridge/manifest.json`

## Сообщение о проблеме

Если вы нашли уязвимость или подозрительное поведение, создайте GitHub issue с описанием проблемы и шагами воспроизведения.
