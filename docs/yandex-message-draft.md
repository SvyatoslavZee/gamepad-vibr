# Message Draft for Yandex

Здравствуйте.

Мы подготовили рабочий proof of concept для поддержки Sony DualSense haptics в
Igromir / Yandex cloud gaming на macOS через WebHID и browser Gamepad API.

Repository: https://github.com/SvyatoslavZee/gamepad-vibr

## Кратко

Проблема: DualSense виден браузеру и macOS, но облачный игровой клиент не всегда
получает корректную связку `gamepad input + vibrationActuator`, из-за чего
вибрация в игре не работает или работает нестабильно.

Решение: bridge, который запускается в page context игрового клиента,
подключается к реальному Sony HID-устройству через WebHID, патчит
`navigator.getGamepads()` и добавляет совместимый
`vibrationActuator.playEffect("dual-rumble")`.

Результат: в Marvel's Spider-Man 2 через Igromir подтверждены:

- управление с DualSense;
- вибрация в игре;
- работа по USB;
- работа по Bluetooth;
- предварительный `Test` до запуска игры;
- отсутствие зависимости от VPN в финальном рабочем сценарии.

## Что важно технически

1. Нужно выбирать реальное Sony HID-устройство:
   - USB: `Wireless Controller`
   - Bluetooth: `DualSense Wireless Controller`

   Не нужно выбирать `GamePad-1`: это macOS synthetic compatibility device.

2. Код должен выполняться в `MAIN` world страницы, до того как игровой клиент
   закеширует `navigator.getGamepads()`.

3. Для extension-like внедрения нужны:
   - `document_start`
   - `all_frames`
   - `world: "MAIN"`
   - покрытие доменов `igromir.yandex.ru`, `plusgaming.yandex.ru` и связанных
     Yandex/Yastatic фреймов.

4. DualSense USB на macOS:
   - report ID: `0x02`
   - payload length: `47` bytes

5. DualSense Bluetooth:
   - report ID: `0x31`
   - нужен CRC32 для output report.

6. Для Bluetooth input может потребоваться synthetic Gamepad fallback, потому
   что нативный Gamepad API в браузере не всегда дает пригодный объект.

## Что есть в репозитории

- `yandex-dualsense-haptics-bridge/bridge.js`
  Основная логика: WebHID, Gamepad API patch, haptics, synthetic input,
  touchpad parsing.

- `yandex-dualsense-haptics-bridge/manifest.json`
  Пример MV3-интеграции с `MAIN` world и `document_start`.

- `yandex-dualsense-haptics-bridge/inject-devtools-bridge.js`
  DevTools-инжектор, использованный для подтверждения работы в живой вкладке
  Igromir.

- `docs/yandex-integration-notes.md`
  Более подробные технические заметки.

- `docs/troubleshooting.md`
  Диагностика типовых состояний: `bridge yes/no`, `rumble N`, WebHID picker.

## Ограничения

### Динамик DualSense

macOS видит DualSense как USB audio output, но в тестах звук идет через 3.5 мм
разъем геймпада в наушники, а не во встроенный динамик DualSense.

Настоящие controller-speaker эффекты PlayStation-игр, вероятно, требуют
отдельного аудиоканала со стороны игры/стримингового клиента. В браузерном
proof of concept такого аудиопотока нет.

### Touchpad

Bridge читает координаты touchpad из HID input reports и может синтезировать
browser pointer events. Для настоящей нативной поддержки touchpad внутри
стриминговой игры нужно, чтобы клиент Яндекса мапил эти события в игровой input
protocol.

## Предложение

Мы готовы передать репозиторий/PoC как готовую техническую основу. Лучшее
решение — встроить этот bridge в клиент Igromir / Yandex cloud gaming, чтобы:

- пользователю не требовался локальный injector;
- WebHID device selection был частью официальной диагностики контроллера;
- haptics работали стабильно для DualSense USB/Bluetooth;
- touchpad/audio можно было развивать уже на стороне клиента и стримингового
  протокола.

Спасибо.
