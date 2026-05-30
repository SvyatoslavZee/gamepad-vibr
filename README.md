# DualSense Haptics Bridge for Yandex Cloud Gaming

Proof-of-concept bridge that makes a Sony DualSense controller expose working
browser haptics in Yandex cloud gaming pages.

The confirmed working path is:

1. Yandex Browser loads an Igromir / Plus Gaming page.
2. `bridge.js` patches the page's `navigator.getGamepads()` result.
3. The page sees a gamepad with `vibrationActuator.playEffect("dual-rumble")`.
4. The bridge sends rumble commands to DualSense through WebHID.

This was tested with Marvel's Spider-Man 2 in Igromir/Yandex cloud gaming:
game input and in-game vibration work.

## Quick Start

1. Clone or download this repository.
2. Open a terminal in the repository folder.
3. Start Yandex Browser with DevTools enabled:

```bash
"/Applications/Yandex.app/Contents/MacOS/Yandex" \
  --remote-debugging-port=9222 \
  "--remote-allow-origins=*" \
  "https://igromir.yandex.ru/"
```

4. Start the bridge injector:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

5. Open Igromir / Plus Gaming.
6. In the page overlay click `Connect Controller haptics`.
7. Choose the real Sony device:
   - USB: `Wireless Controller`
   - Bluetooth: `DualSense Wireless Controller`
8. Do not choose `GamePad-1`; that is macOS's synthetic compatibility device.
9. Click `Test` and confirm that the controller vibrates.
10. Launch the game.

Expected overlay state before launching the game:

```text
bridge yes
1 gamepad(s)
rumble N
```

If the `Test` button vibrates and `rumble N` grows during gameplay, the game is
calling the browser haptics API and the bridge is receiving it.

## What Works

- DualSense over USB.
- DualSense over Bluetooth.
- In-game vibration through browser `GamepadHapticActuator`.
- Manual haptics test button in the page overlay.
- DevTools injector flow for pages where unpacked extension loading is awkward.
- Touchpad data reading from DualSense HID reports.
- Optional experimental `Touchpad Pointer` mode that converts touchpad movement
  into browser pointer/mouse events.

## What Does Not Work Yet

- Built-in DualSense speaker effects from PlayStation games.
  macOS can expose DualSense as an audio device over USB, but in testing the
  audio output goes through the controller's 3.5 mm headphone jack, not the
  built-in controller speaker.
- Native macOS cursor control from the touchpad.
  Browser code can synthesize pointer events inside a web page, but system-wide
  cursor control would require a native macOS helper.

## Repository Layout

- `yandex-dualsense-haptics-bridge/bridge.js`
  Main browser-side bridge. It patches the Gamepad API, opens the controller
  through WebHID, sends rumble reports, reads touchpad data, and renders the
  small debug overlay.

- `yandex-dualsense-haptics-bridge/content.js`
  Fallback content-script injector for extension mode.

- `yandex-dualsense-haptics-bridge/manifest.json`
  Manifest V3 extension definition. It targets Yandex/Igromir pages and injects
  `bridge.js` in the page's `MAIN` world at `document_start`.

- `yandex-dualsense-haptics-bridge/inject-devtools-bridge.js`
  Local DevTools Protocol injector. This is the most reproducible flow during
  development because it injects the current `bridge.js` into matching Yandex
  tabs and keeps scanning for new pages.

- `controller-haptics-test.html`
  Standalone local test page for Gamepad API and WebHID haptics.

- `install-dualsense-plusgaming-bridge.html`
  Bookmarklet installer page. Useful as a fallback/manual route.

- `dualsense_native_rumble.c`
  macOS IOKit diagnostic utility used to verify USB rumble outside the browser.

## Requirements

- macOS.
- Yandex Browser.
- Sony DualSense controller.
- Node.js available on PATH.
- Yandex Browser launched with DevTools remote debugging for the injector flow.

## Validation Commands

```bash
node --check yandex-dualsense-haptics-bridge/bridge.js
node --check yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
node -e "JSON.parse(require('fs').readFileSync('yandex-dualsense-haptics-bridge/manifest.json', 'utf8')); console.log('manifest json ok')"
```

## Extension Mode

The `yandex-dualsense-haptics-bridge` folder is also a Manifest V3 unpacked
extension. In environments where Yandex Browser allows local unpacked extension
loading, load that folder from the browser's extensions page.

The extension path is cleaner for end users, but the DevTools injector is the
most reliable development path because it guarantees that the current local
`bridge.js` is injected into the active Yandex gaming page.

## Touchpad

DualSense touchpad click is exposed as gamepad button `17`.

The bridge also reads touch contact coordinates from HID reports. The overlay's
`Touchpad Pointer` button enables an experimental mode that converts touchpad
touches into browser `PointerEvent` / mouse events.

This can help web canvases that accept pointer input, but it is not the same as
native PlayStation touchpad support inside the streamed game.

## Audio / Controller Speaker

DualSense over USB may appear in macOS as an audio output device. In testing,
sound is routed to headphones connected to the controller's 3.5 mm jack.

The built-in DualSense speaker used by PlayStation games appears to require
game/client support for a separate controller-speaker audio path. This bridge
does not currently provide real Spider-Man 2 controller-speaker effects because
the browser/cloud client does not expose that separate audio stream.

## VPN Note

Final testing showed that VPN is not required for the bridge or in-game
vibration to work.

## Current Status

Working proof of concept:

- Game input works.
- In-game haptics work.
- The bridge is reproducible through the DevTools injector.

Next work:

- Harden touchpad pointer mode.
- Research DualSense speaker protocol and whether Yandex can expose a separate
  controller-speaker audio channel.
- Package the project as a first-party Yandex integration path.
