# Troubleshooting

## Overlay Does Not Appear

Use the DevTools injector flow first.

1. Start Yandex Browser with remote debugging:

```bash
"/Applications/Yandex.app/Contents/MacOS/Yandex" \
  --remote-debugging-port=9222 \
  "--remote-allow-origins=*" \
  "https://igromir.yandex.ru/"
```

2. Start the injector:

```bash
node yandex-dualsense-haptics-bridge/inject-devtools-bridge.js
```

3. Open or reload the Igromir / Plus Gaming page.

Expected overlay text:

```text
Connect Controller haptics
Test
Touchpad Pointer
Controller haptics: ...
```

If the overlay still does not appear, check that DevTools is reachable:

```bash
curl http://127.0.0.1:9222/json/list
```

## WebHID Picker Shows Multiple Devices

Choose the real Sony controller:

- USB: `Wireless Controller`
- Bluetooth: `DualSense Wireless Controller`

Do not choose `GamePad-1`. That is macOS's synthetic compatibility device and
does not expose the output reports needed for haptics.

## Test Button Vibrates, But Game Does Not

Watch the overlay while an in-game vibration should happen.

If `rumble N` grows:

- The game called the browser haptics API.
- The bridge received the call.
- If there is no physical vibration, the issue is in WebHID report sending or
  the wrong HID device was selected.

If `rumble N` does not grow:

- The game did not call the browser haptics API visible to the bridge.
- Check that the bridge is injected into the gaming page before launching the
  game.
- Reload the page with the injector running.

## Bluetooth Input Does Not Work

The bridge creates a synthetic Gamepad object from WebHID reports when Bluetooth
does not expose a reliable native Gamepad API device.

Check from DevTools:

```js
window.__dualSenseHapticsBridge.status()
Array.from(navigator.getGamepads()).filter(Boolean)
```

Expected:

- `connected: true`
- `opened: true`
- `hasBridgeActuator: true`
- at least one gamepad in `navigator.getGamepads()`

Move sticks and press buttons. Axes and pressed buttons should update.

## USB Haptics Does Not Work

For DualSense USB, the bridge sends a 47-byte WebHID payload with report ID
`0x02`. This matches the macOS HID output report size observed for the
controller.

If USB haptics fail:

1. Reconnect the controller.
2. Choose `Wireless Controller` in WebHID.
3. Click `Test`.
4. If `Test` fails, verify with the local test page:

```text
http://localhost:8765/controller-haptics-test.html
```

## VPN

Final testing showed that VPN is not required for the bridge or vibration.

If behavior appears to differ with VPN, compare overlay values:

- `bridge yes/no`
- `gamepad(s)`
- `rumble N`

The overlay values are more reliable than network assumptions.

## Audio Device Appears, But Controller Speaker Is Silent

If macOS shows DualSense as an audio output over USB, plug headphones into the
controller's 3.5 mm jack.

If sound plays through the headphones, macOS is routing normal system audio to
the controller headset output, not to the built-in DualSense speaker.

The built-in speaker effects used by PlayStation games likely require a separate
controller-speaker audio path from the game/client. The current browser bridge
does not have access to that separate audio stream.
