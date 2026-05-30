# Linear Summary Draft

## Project

`gamepad-vibr`

## What We Solved

Built and verified a working proof of concept for Sony DualSense support in
Yandex cloud gaming on macOS.

The original problem was that the browser and macOS could see the controller,
but Igromir/Yandex cloud gaming did not reliably receive a correct
gamepad/haptics bridge. As a result, controller input or vibration could fail
depending on USB/Bluetooth mode and page injection timing.

## Confirmed Result

Marvel's Spider-Man 2 in Igromir/Yandex cloud gaming now works with:

- DualSense input.
- In-game vibration.
- USB connection.
- Bluetooth connection.
- WebHID test vibration before game launch.

Final testing showed VPN is not required for the working scenario.

## What Was Implemented

- Browser-side bridge in `yandex-dualsense-haptics-bridge/bridge.js`.
- WebHID connection to the real Sony controller.
- Patched `navigator.getGamepads()` in the page context.
- `vibrationActuator.playEffect("dual-rumble")` support.
- DualSense USB rumble reports for macOS.
- DualSense Bluetooth rumble reports with CRC32.
- Synthetic Gamepad fallback for Bluetooth mode.
- Debug overlay with:
  - connect button
  - haptics test button
  - touchpad pointer toggle
  - `bridge yes/no`
  - gamepad count
  - `rumble N`
- DevTools Protocol injector for reliable local testing:
  `yandex-dualsense-haptics-bridge/inject-devtools-bridge.js`
- Documentation:
  - `README.md`
  - `docs/troubleshooting.md`
  - `docs/yandex-integration-notes.md`
  - GitHub/Yandex/Linear draft docs

## Important Findings

- `GamePad-1` is macOS's synthetic compatibility device and should not be used
  for WebHID rumble.
- The real devices are:
  - USB: `Wireless Controller`
  - Bluetooth: `DualSense Wireless Controller`
- Extension/bridge code must run early in the page's main JS context.
- `document_start`, `all_frames`, and `MAIN` world are important for a proper
  product integration.
- DualSense USB on macOS needs a 47-byte output payload for report ID `0x02`.
- DualSense Bluetooth haptics uses report ID `0x31` with CRC32.

## Open Questions

1. Touchpad
   - Current bridge reads DualSense touchpad coordinates and can synthesize
     browser pointer events.
   - Need to determine whether Yandex can map touchpad data into the streamed
     game's native input protocol.

2. Controller speaker
   - macOS exposes DualSense as an audio output over USB, but observed sound
     goes to headphones connected to the controller's 3.5 mm jack.
   - Built-in speaker effects likely need a separate controller-speaker audio
     channel from the game/cloud client.

3. Product integration
   - Current reliable local path uses a DevTools injector.
   - Yandex should integrate the bridge internally so users do not need local
     scripts, remote debugging, or bookmarklets.

## Suggested Next Steps

1. Clean the repository for public GitHub release.
2. Add `.gitignore`, license, and remove local artifacts before publishing.
3. Share `docs/yandex-integration-notes.md` and `docs/yandex-message-draft.md`
   with Yandex.
4. Continue with touchpad hardening as the next feature.
5. Treat controller-speaker support as a separate research spike.
