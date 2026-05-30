# Yandex Integration Notes

## Summary

This repository contains a working proof of concept that enables Sony DualSense
gamepad haptics in Yandex cloud gaming pages through WebHID and a patched
browser Gamepad API surface.

The prototype was tested with Marvel's Spider-Man 2 in Igromir/Yandex cloud
gaming. Game input and in-game vibration work.

## User Problem

On macOS, a DualSense controller can be visible to the browser and the operating
system, while cloud gaming clients do not reliably expose controller haptics to
the game stream.

Observed modes:

- USB:
  - The game can see controller input.
  - Browser haptics may be missing unless a bridge provides
    `vibrationActuator`.

- Bluetooth:
  - WebHID can access the controller.
  - Browser-native Gamepad API exposure may be incomplete or unsuitable for the
    cloud gaming client.

## Prototype Approach

The bridge runs in the page JavaScript context and:

1. Opens the Sony controller through WebHID.
2. Patches `navigator.getGamepads()`.
3. Adds a `vibrationActuator` compatible with
   `playEffect("dual-rumble", ...)`.
4. Sends DualSense rumble reports through WebHID.
5. Creates a synthetic Gamepad object when Bluetooth input is not exposed
   reliably through the native Gamepad API.
6. Reads DualSense touchpad data from HID input reports for experimental pointer
   support.

## Integration Points for Yandex

The clean product implementation should live inside the Yandex cloud gaming
client rather than as a user-side script.

Recommended internal implementation:

- Detect Sony controllers by VID/PID:
  - Sony vendor ID `0x054c`
  - DualSense product ID `0x0ce6`
  - DualShock 4 product IDs `0x05c4`, `0x09cc`

- Request/open WebHID access to the real Sony device, not macOS's synthetic
  `GamePad-1` device.

- Expose haptics to the cloud gaming runtime via browser-compatible
  `GamepadHapticActuator` behavior.

- For USB DualSense on macOS, send report ID `0x02` with a 47-byte payload.

- For Bluetooth DualSense, send report ID `0x31` with CRC32 as implemented in
  `bridge.js`.

- If native Gamepad API input is unreliable in Bluetooth mode, build a synthetic
  standard-mapped Gamepad object from HID input reports.

- Inject early, before the cloud gaming client caches `navigator.getGamepads()`.

- Ensure the code runs in the page's main JS world, not an isolated extension
  world.

## Files to Review

- `yandex-dualsense-haptics-bridge/bridge.js`
  Main prototype logic.

- `yandex-dualsense-haptics-bridge/manifest.json`
  Shows the extension-style injection requirements:
  `document_start`, `all_frames`, and `world: "MAIN"`.

- `yandex-dualsense-haptics-bridge/inject-devtools-bridge.js`
  Development injector used to prove the approach in a live Yandex Browser tab.

- `controller-haptics-test.html`
  Standalone test page for Gamepad API and WebHID behavior.

## Validation Criteria

Before launching a game, the page overlay should report:

```text
bridge yes
1 gamepad(s)
```

The `Test` button should vibrate the controller.

During gameplay, `rumble N` should grow when the game triggers haptics.

## Known Limitations

### Controller Speaker

DualSense over USB may appear as an audio output device in macOS, but normal
system audio is routed to the controller's 3.5 mm headset output. The built-in
DualSense speaker effects used by PlayStation games appear to require a separate
game/client audio path.

The prototype does not provide real controller-speaker effects because the
browser/cloud client does not expose such a separate stream.

### Touchpad

The prototype reads touchpad coordinates from DualSense HID reports and can
optionally synthesize browser pointer events.

This is not equivalent to native PlayStation touchpad support inside a streamed
game unless the cloud client maps those events into the game input protocol.

### Browser Permission

WebHID access requires a user gesture and explicit device selection. A production
implementation should provide clear UI and select the real Sony controller
instead of synthetic compatibility devices.

## Suggested Next Steps

1. Implement the WebHID haptics path inside the Yandex gaming client.
2. Add a first-party controller diagnostics panel:
   - selected HID device
   - Gamepad API device
   - haptics support
   - live input
   - last rumble call
3. Add official DualSense Bluetooth synthetic input fallback.
4. Investigate whether the stream protocol can carry controller-speaker audio
   separately from normal game audio.
5. Decide whether touchpad should be mapped as:
   - gamepad button only;
   - pointer events;
   - native cloud protocol touchpad events.
