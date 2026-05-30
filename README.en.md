# DualSense Vibration for Yandex Igromir / Plus Gaming

[Русский](README.md) | English

A working bridge for Sony DualSense on macOS. It helps Yandex Igromir / Plus Gaming expose the controller correctly and enables in-game vibration.

Confirmed with Marvel's Spider-Man 2 through Igromir:

- controller input works;
- in-game vibration works;
- USB works;
- Bluetooth works;
- VPN is not required.

## Quick Start

Run this once before launching the game.

1. Click the green **Code** button on this repository page.
2. Click **Download ZIP**.
3. Unzip the archive.
4. Open Terminal in the unzipped folder.
5. Start Yandex Browser with this command:

```bash
"/Applications/Yandex.app/Contents/MacOS/Yandex" \
  --remote-debugging-port=9222 \
  "--remote-allow-origins=*" \
  "https://igromir.yandex.ru/"
```

6. In a second Terminal window, start the bridge:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

7. In Igromir, click **Connect Controller haptics**.
8. In the device picker, choose the real DualSense device:
   - USB: **Wireless Controller**;
   - Bluetooth: **DualSense Wireless Controller**.
9. Do not choose **GamePad-1**. It is a macOS compatibility layer and does not provide the required haptics output path.
10. Click **Test**. The controller should vibrate.
11. Launch the game.

Expected overlay state:

```text
bridge yes
1 gamepad(s)
rumble 0
```

During gameplay, `rumble` should increase when the game sends vibration events.

## What to Download

Regular users do not need to build anything. Download the repository through **Code -> Download ZIP** and run only:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

The main working folder is:

```text
yandex-dualsense-haptics-bridge/
```

## Repository Layout

```text
yandex-dualsense-haptics-bridge/
  bridge.js                  main bridge code
  inject-devtools-bridge.js   injects the bridge into an open Igromir tab
  manifest.json               browser extension example
  content.js                  fallback injector for extension mode

docs/
  troubleshooting.md          troubleshooting guide
  yandex-integration-notes.md technical notes for Yandex developers
```

## Troubleshooting

### Test Vibrates, But The Game Does Not

Watch `rumble N` in the overlay.

If `rumble N` increases, the game is calling haptics and the bridge receives it. If there is still no physical vibration, reconnect the controller and select **Wireless Controller** or **DualSense Wireless Controller**, not **GamePad-1**.

If `rumble N` does not increase, the game does not see the bridge. Restart Yandex Browser with the command above, run `inject-devtools-bridge.js`, reload Igromir, connect the controller, then launch the game.

### Multiple Devices In The Picker

Choose the real Sony controller:

- **Wireless Controller** for USB;
- **DualSense Wireless Controller** for Bluetooth.

Do not choose **GamePad-1**.

### DualSense Speaker Audio Does Not Work

macOS may expose DualSense as a USB audio device, but observed audio goes to headphones connected to the controller's 3.5 mm jack. The built-in DualSense speaker used by PlayStation games likely requires explicit support from the game or cloud gaming client.

This bridge currently solves controller input and vibration, not native DualSense speaker effects.

## For Developers

The bridge runs in the Igromir page context and does three main things:

1. Opens the real Sony controller through WebHID.
2. Patches `navigator.getGamepads()` so the gaming client sees `vibrationActuator.playEffect("dual-rumble")`.
3. Sends rumble commands back to DualSense through HID output reports.

Important implementation details:

- Sony vendor ID: `0x054c`.
- DualSense product ID: `0x0ce6`.
- USB DualSense on macOS uses report ID `0x02` and a 47-byte payload.
- Bluetooth DualSense uses report ID `0x31` and CRC32.
- The code must run early, before the gaming client caches `navigator.getGamepads()`.
- For extension integration, `document_start`, `all_frames`, and `world: "MAIN"` are important.

More integration details are in [docs/yandex-integration-notes.md](docs/yandex-integration-notes.md).

## Status

This is a working proof of concept. The best final user experience would be a first-party integration inside Igromir / Plus Gaming so users do not need Terminal, remote debugging, or a manual injector.
