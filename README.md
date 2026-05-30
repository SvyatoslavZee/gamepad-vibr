# Вибрация DualSense в Игромире / Плюс Гейминге

Рабочий bridge для Sony DualSense на macOS: помогает Яндекс Игромиру / Плюс Геймингу увидеть геймпад корректно и включить вибрацию в игре.

Проверено в Marvel's Spider-Man 2 через Игромир:

- управление работает;
- вибрация в игре работает;
- USB работает;
- Bluetooth работает;
- VPN не нужен.

## Самый короткий путь

Нужно сделать один раз перед запуском игры.

1. Нажмите зеленую кнопку **Code** на этой странице.
2. Нажмите **Download ZIP**.
3. Распакуйте архив.
4. Откройте Terminal в распакованной папке.
5. Запустите Яндекс.Браузер специальной командой:

```bash
"/Applications/Yandex.app/Contents/MacOS/Yandex" \
  --remote-debugging-port=9222 \
  "--remote-allow-origins=*" \
  "https://igromir.yandex.ru/"
```

6. Во втором окне Terminal запустите bridge:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

7. В открывшемся Игромире нажмите кнопку **Connect Controller haptics**.
8. В окне выбора устройства выберите настоящий DualSense:
   - по USB: **Wireless Controller**;
   - по Bluetooth: **DualSense Wireless Controller**.
9. Не выбирайте **GamePad-1**. Это виртуальный слой macOS, через него вибрация не работает.
10. Нажмите **Test**. Геймпад должен завибрировать.
11. Запускайте игру.

Если все правильно, в углу страницы будет маленькая панель со статусом вроде:

```text
bridge yes
1 gamepad(s)
rumble 0
```

Во время игры число `rumble` должно расти, когда игра отправляет вибрацию.

## Что скачивать

Для обычного пользователя ничего собирать не нужно. Скачивайте весь репозиторий через **Code -> Download ZIP** и запускайте только:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

Главная рабочая папка:

```text
yandex-dualsense-haptics-bridge/
```

## Что внутри

```text
yandex-dualsense-haptics-bridge/
  bridge.js                  основной код bridge
  inject-devtools-bridge.js   запуск bridge в открытой вкладке Игромира
  manifest.json               пример расширения для браузера
  content.js                  fallback-инжектор для extension mode

docs/
  troubleshooting.md          диагностика проблем
  yandex-integration-notes.md технические заметки для разработчиков Яндекса
```

## Если что-то не работает

### Кнопка Test вибрирует, но в игре вибрации нет

Смотрите на `rumble N` в панели.

Если `rumble N` растет, значит игра вызывает вибрацию, bridge ее видит, но проблема в выбранном HID-устройстве или отправке команды на геймпад. Переподключите геймпад и снова выберите **Wireless Controller** / **DualSense Wireless Controller**, не **GamePad-1**.

Если `rumble N` не растет, значит игра не видит bridge. Перезапустите Яндекс.Браузер командой из инструкции, запустите `inject-devtools-bridge.js`, обновите страницу Игромира и подключите геймпад до запуска игры.

### В списке устройств два варианта

Выбирайте настоящий Sony-геймпад:

- **Wireless Controller** для USB;
- **DualSense Wireless Controller** для Bluetooth.

**GamePad-1** не выбирайте.

### Звук через динамик DualSense не работает

macOS может показывать DualSense как аудиоустройство по USB, но звук уходит в наушники, подключенные в 3.5 мм разъем геймпада. Встроенный динамик DualSense, как на PlayStation, требует отдельной поддержки со стороны игры или облачного клиента. Этот bridge сейчас решает управление и вибрацию, но не нативный звук из динамика геймпада.

## Для разработчиков

Bridge запускается в контексте страницы Игромира и делает три вещи:

1. Открывает реальный Sony-контроллер через WebHID.
2. Патчит `navigator.getGamepads()` так, чтобы игровой клиент видел `vibrationActuator.playEffect("dual-rumble")`.
3. Отправляет rumble-команды обратно в DualSense через HID output reports.

Важные детали реализации:

- Sony vendor ID: `0x054c`.
- DualSense product ID: `0x0ce6`.
- USB DualSense на macOS использует report ID `0x02` и payload `47` bytes.
- Bluetooth DualSense использует report ID `0x31` и CRC32.
- Код должен запускаться рано, до того как игровой клиент закеширует `navigator.getGamepads()`.
- Для extension-интеграции важны `document_start`, `all_frames` и `world: "MAIN"`.

Подробности для интеграции внутри клиента Яндекса лежат в [docs/yandex-integration-notes.md](docs/yandex-integration-notes.md).

## Статус

Это рабочий proof of concept. Лучший финальный вариант для пользователей — встроить этот bridge прямо в клиент Игромира / Плюс Гейминга, чтобы не требовались Terminal, remote debugging и ручной injector.
