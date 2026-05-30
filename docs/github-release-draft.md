# GitHub Release Draft

## Repository Description

DualSense WebHID/Gamepad API bridge for Yandex cloud gaming on macOS. Enables
working controller input and in-game vibration for Sony DualSense in Igromir /
Plus Gaming pages.

## Short README Pitch

This project is a working proof of concept for DualSense haptics in Yandex cloud
gaming. It patches the browser Gamepad API inside Yandex gaming pages and routes
`vibrationActuator.playEffect("dual-rumble")` calls to the real DualSense
controller through WebHID.

Confirmed with Marvel's Spider-Man 2 in Igromir:

- DualSense input works.
- In-game vibration works.
- USB and Bluetooth modes are supported.
- WebHID test vibration works before launching the game.

## Suggested GitHub Topics

- dualsense
- webhid
- gamepad-api
- haptics
- yandex
- cloud-gaming
- macos
- playstation-controller

## First Public Release Notes

### Added

- Browser-side DualSense haptics bridge for Yandex cloud gaming pages.
- Manifest V3 extension files for early `MAIN` world injection.
- DevTools Protocol injector for reliable local development and testing.
- DualSense USB rumble support with macOS-compatible 47-byte report payload.
- DualSense Bluetooth rumble support with report `0x31` and CRC32.
- Synthetic Gamepad fallback for Bluetooth mode.
- Debug overlay with:
  - WebHID connect button
  - haptics test button
  - touchpad pointer toggle
  - `bridge yes/no`
  - gamepad count
  - `rumble N`
- Touchpad HID data parsing and experimental pointer-event mode.
- Troubleshooting guide.
- Yandex integration notes.

### Confirmed

- Tested on macOS with Yandex Browser.
- Tested with Marvel's Spider-Man 2 in Igromir / Yandex cloud gaming.
- VPN is not required for the confirmed working path.

### Known limitations

- Built-in DualSense speaker effects are not implemented. macOS exposes the
  controller as an audio output over USB, but observed audio goes to headphones
  connected to the controller's 3.5 mm jack.
- Touchpad pointer mode is experimental and is not equivalent to native
  PlayStation touchpad support inside a streamed game.
- WebHID requires explicit user device selection.

## Suggested Repository Cleanup Before Publishing

Before making the repository public:

1. Remove local/system artifacts:
   - `.DS_Store`
   - `com.apple.GameController.backup.20260529-compat.plist`
   - compiled binary `dualsense_native_rumble`

2. Decide whether to keep diagnostics:
   - Keep `controller-haptics-test.html`.
   - Keep `dualsense_native_rumble.c`.
   - Do not publish local preference backups.

3. Add `.gitignore`:

```gitignore
.DS_Store
*.plist
dualsense_native_rumble
```

4. Rename repository to something explicit, for example:
   - `dualsense-yandex-cloud-bridge`
   - `yandex-dualsense-haptics-bridge`

5. Add a license before publishing.
   Recommended default: MIT, unless there is a reason to restrict reuse.

## Public Safety Note

This project is a user-side proof of concept. It does not bypass payment,
authentication, DRM, or cloud gaming access controls. It only exposes controller
haptics through standard browser/WebHID mechanisms after the user explicitly
selects their controller.
