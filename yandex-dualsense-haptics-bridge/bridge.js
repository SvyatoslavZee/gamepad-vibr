(function dualSenseHapticsBridge() {
  if (window.__dualSenseHapticsBridgeInstalled) return;
  window.__dualSenseHapticsBridgeInstalled = true;

  const SONY_VENDOR_ID = 0x054c;
  const DUALSENSE_VENDOR_ID = SONY_VENDOR_ID;
  const DUALSENSE_PRODUCT_ID = 0x0ce6;
  const DUALSHOCK4_PRODUCT_IDS = new Set([0x05c4, 0x09cc]);

  const state = {
    device: null,
    outputSeq: 0,
    lastStatus: "not connected",
    patchedGamepads: new WeakSet(),
    syntheticGamepad: null,
    transport: "unknown",
    rumbleCalls: 0,
    lastGamepadCount: 0,
    lastHasBridgeActuator: false,
    connectedEventSent: false,
    pointerTouchpad: false,
    touchpad: {
      active: false,
      x: 0,
      y: 0,
      id: 0,
      lastPointerDown: false
    }
  };

  function isDualShock4(device = state.device) {
    return Boolean(device && device.vendorId === SONY_VENDOR_ID && DUALSHOCK4_PRODUCT_IDS.has(device.productId));
  }

  function isDualSense(device = state.device) {
    return Boolean(device && device.vendorId === DUALSENSE_VENDOR_ID && device.productId === DUALSENSE_PRODUCT_ID);
  }

  function makeButton(value = 0) {
    const normalized = Math.max(0, Math.min(Number(value || 0), 1));
    return {
      pressed: normalized > 0.5,
      touched: normalized > 0,
      value: normalized
    };
  }

  function normalizeAxis(value) {
    return Math.max(-1, Math.min(1, ((value || 0) - 128) / 127));
  }

  function createSyntheticGamepad() {
    const buttons = Array.from({ length: 18 }, () => makeButton(0));
    return {
      id: `${isDualShock4() ? "Wireless Controller" : "DualSense Wireless Controller"} (WebHID Bridge)`,
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: performance.now(),
      axes: [0, 0, 0, 0],
      buttons,
      vibrationActuator: bridgeActuator,
      hapticActuators: [bridgeActuator]
    };
  }

  function setButton(gamepad, index, value) {
    gamepad.buttons[index] = makeButton(value);
  }

  function updateDpad(gamepad, hat) {
    setButton(gamepad, 12, hat === 0 || hat === 1 || hat === 7);
    setButton(gamepad, 13, hat === 3 || hat === 4 || hat === 5);
    setButton(gamepad, 14, hat === 5 || hat === 6 || hat === 7);
    setButton(gamepad, 15, hat === 1 || hat === 2 || hat === 3);
  }

  function parseDualSenseInputReport(reportId, dataView) {
    if (reportId !== 0x31 && reportId !== 0x01) return;
    state.transport = reportId === 0x01 ? "usb" : "bluetooth";
    if (!state.syntheticGamepad) state.syntheticGamepad = createSyntheticGamepad();

    const data = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const offset = reportId === 0x31 ? 1 : 0;
    if (data.length < offset + 10) return;

    const gamepad = state.syntheticGamepad;
    gamepad.timestamp = performance.now();
    gamepad.axes[0] = normalizeAxis(data[offset + 0]);
    gamepad.axes[1] = normalizeAxis(data[offset + 1]);
    gamepad.axes[2] = normalizeAxis(data[offset + 2]);
    gamepad.axes[3] = normalizeAxis(data[offset + 3]);

    const leftTrigger = (data[offset + 4] || 0) / 255;
    const rightTrigger = (data[offset + 5] || 0) / 255;
    const buttons0 = data[offset + 7] || 0;
    const buttons1 = data[offset + 8] || 0;
    const buttons2 = data[offset + 9] || 0;

    setButton(gamepad, 0, (buttons0 & 0x20) ? 1 : 0);
    setButton(gamepad, 1, (buttons0 & 0x40) ? 1 : 0);
    setButton(gamepad, 2, (buttons0 & 0x10) ? 1 : 0);
    setButton(gamepad, 3, (buttons0 & 0x80) ? 1 : 0);
    setButton(gamepad, 4, (buttons1 & 0x01) ? 1 : 0);
    setButton(gamepad, 5, (buttons1 & 0x02) ? 1 : 0);
    setButton(gamepad, 6, Math.max(leftTrigger, (buttons1 & 0x04) ? 1 : 0));
    setButton(gamepad, 7, Math.max(rightTrigger, (buttons1 & 0x08) ? 1 : 0));
    setButton(gamepad, 8, (buttons1 & 0x10) ? 1 : 0);
    setButton(gamepad, 9, (buttons1 & 0x20) ? 1 : 0);
    setButton(gamepad, 10, (buttons1 & 0x40) ? 1 : 0);
    setButton(gamepad, 11, (buttons1 & 0x80) ? 1 : 0);
    updateDpad(gamepad, buttons0 & 0x0f);
    setButton(gamepad, 16, (buttons2 & 0x01) ? 1 : 0);
    setButton(gamepad, 17, (buttons2 & 0x02) ? 1 : 0);
    parseDualSenseTouchpad(data, offset);
  }

  function parseDualShock4InputReport(reportId, dataView) {
    if (reportId !== 0x01 && reportId !== 0x11) return;
    state.transport = reportId === 0x01 ? "usb-ds4" : "bluetooth-ds4";
    if (!state.syntheticGamepad) state.syntheticGamepad = createSyntheticGamepad();

    const data = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const offset = reportId === 0x11 ? 2 : 0;
    if (data.length < offset + 9) return;

    const gamepad = state.syntheticGamepad;
    gamepad.id = "Wireless Controller (WebHID Bridge)";
    gamepad.timestamp = performance.now();
    gamepad.axes[0] = normalizeAxis(data[offset + 0]);
    gamepad.axes[1] = normalizeAxis(data[offset + 1]);
    gamepad.axes[2] = normalizeAxis(data[offset + 2]);
    gamepad.axes[3] = normalizeAxis(data[offset + 3]);

    const buttons0 = data[offset + 4] || 0;
    const buttons1 = data[offset + 5] || 0;
    const buttons2 = data[offset + 6] || 0;
    const leftTrigger = (data[offset + 7] || 0) / 255;
    const rightTrigger = (data[offset + 8] || 0) / 255;

    setButton(gamepad, 0, (buttons0 & 0x20) ? 1 : 0);
    setButton(gamepad, 1, (buttons0 & 0x40) ? 1 : 0);
    setButton(gamepad, 2, (buttons0 & 0x10) ? 1 : 0);
    setButton(gamepad, 3, (buttons0 & 0x80) ? 1 : 0);
    setButton(gamepad, 4, (buttons1 & 0x01) ? 1 : 0);
    setButton(gamepad, 5, (buttons1 & 0x02) ? 1 : 0);
    setButton(gamepad, 6, Math.max(leftTrigger, (buttons1 & 0x04) ? 1 : 0));
    setButton(gamepad, 7, Math.max(rightTrigger, (buttons1 & 0x08) ? 1 : 0));
    setButton(gamepad, 8, (buttons1 & 0x10) ? 1 : 0);
    setButton(gamepad, 9, (buttons1 & 0x20) ? 1 : 0);
    setButton(gamepad, 10, (buttons1 & 0x40) ? 1 : 0);
    setButton(gamepad, 11, (buttons1 & 0x80) ? 1 : 0);
    updateDpad(gamepad, buttons0 & 0x0f);
    setButton(gamepad, 16, (buttons2 & 0x01) ? 1 : 0);
    setButton(gamepad, 17, (buttons2 & 0x02) ? 1 : 0);
  }

  function updateTouchpadState(active, rawX = 0, rawY = 0, id = 0) {
    state.touchpad.active = active;
    state.touchpad.x = active ? Math.max(0, Math.min(1, rawX / 1919)) : 0;
    state.touchpad.y = active ? Math.max(0, Math.min(1, rawY / 1079)) : 0;
    state.touchpad.id = id;
    if (state.pointerTouchpad) dispatchTouchpadPointer();
  }

  function parseDualSenseTouchpad(data, offset) {
    const touchOffset = offset + 32;
    if (data.length < touchOffset + 4) {
      updateTouchpadState(false);
      return;
    }
    const contact = data[touchOffset];
    const active = (contact & 0x80) === 0;
    if (!active) {
      updateTouchpadState(false);
      return;
    }
    const rawX = data[touchOffset + 1] | ((data[touchOffset + 2] & 0x0f) << 8);
    const rawY = ((data[touchOffset + 2] & 0xf0) >> 4) | (data[touchOffset + 3] << 4);
    updateTouchpadState(true, rawX, rawY, contact & 0x7f);
  }

  function dispatchTouchpadPointer() {
    const active = state.touchpad.active;
    const x = Math.round(state.touchpad.x * Math.max(1, window.innerWidth - 1));
    const y = Math.round(state.touchpad.y * Math.max(1, window.innerHeight - 1));
    const target = document.elementFromPoint(x, y) || document.body || document.documentElement;
    if (!target) return;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 17,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      buttons: active ? 1 : 0,
      button: active ? 0 : -1
    };
    const type = active
      ? (state.touchpad.lastPointerDown ? "pointermove" : "pointerdown")
      : (state.touchpad.lastPointerDown ? "pointerup" : null);
    if (!type) return;
    state.touchpad.lastPointerDown = active;
    try {
      target.dispatchEvent(new PointerEvent(type, eventOptions));
    } catch (error) {
      const fallback = new MouseEvent(type === "pointermove" ? "mousemove" : type === "pointerdown" ? "mousedown" : "mouseup", eventOptions);
      target.dispatchEvent(fallback);
    }
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function sendDualSenseBluetoothReport(rightMotor, leftMotor) {
    if (!state.device) return;
    if (!state.device.opened) await state.device.open();
    if (!isDualSense()) throw new Error("Selected device is not a DualSense Bluetooth controller.");

    const report = new Uint8Array(77);
    report[0] = (state.outputSeq++ & 0x0f) << 4;
    report[1] = 0x10;
    report[2] = 0x03;
    report[4] = rightMotor;
    report[5] = leftMotor;
    report[40] = 0x04;

    const crcInput = new Uint8Array(79);
    crcInput[0] = 0xa2;
    crcInput[1] = 0x31;
    crcInput.set(report, 2);
    const crc = crc32(crcInput.slice(0, 75));
    report[73] = crc & 0xff;
    report[74] = (crc >>> 8) & 0xff;
    report[75] = (crc >>> 16) & 0xff;
    report[76] = (crc >>> 24) & 0xff;

    await state.device.sendReport(0x31, report);
    state.transport = "bluetooth";
  }

  async function sendDualSenseUsbReport(rightMotor, leftMotor) {
    if (!state.device) return;
    if (!state.device.opened) await state.device.open();
    if (!isDualSense()) throw new Error("Selected device is not a DualSense USB controller.");

    const report = new Uint8Array(47);
    report[0] = 0x03;
    report[2] = rightMotor;
    report[3] = leftMotor;
    report[38] = 0x04;
    await state.device.sendReport(0x02, report);
    state.transport = "usb";
  }

  async function sendDualShock4UsbReport(rightMotor, leftMotor) {
    if (!state.device) return;
    if (!state.device.opened) await state.device.open();
    if (!isDualShock4()) throw new Error("Selected device is not a supported DS4 USB controller.");

    const report = new Uint8Array(31);
    report[0] = 0xff;
    report[1] = 0x04;
    report[2] = 0x00;
    report[3] = rightMotor;
    report[4] = leftMotor;
    await state.device.sendReport(0x05, report);
    state.transport = "usb-ds4";
  }

  async function sendControllerReport(rightMotor, leftMotor) {
    if (isDualShock4()) {
      await sendDualShock4UsbReport(rightMotor, leftMotor);
      return;
    }
    if (state.transport === "usb") {
      await sendDualSenseUsbReport(rightMotor, leftMotor);
      return;
    }
    if (state.transport === "bluetooth") {
      await sendDualSenseBluetoothReport(rightMotor, leftMotor);
      return;
    }
    try {
      await sendDualSenseUsbReport(rightMotor, leftMotor);
    } catch (usbError) {
      await sendDualSenseBluetoothReport(rightMotor, leftMotor);
    }
  }

  const bridgeActuator = {
    type: "dual-rumble",
    effects: ["dual-rumble"],
    async playEffect(effectType, params = {}) {
      if (effectType !== "dual-rumble") return "not-supported";
      const duration = Math.max(0, Math.min(Number(params.duration || 0), 5000));
      const weak = Math.max(0, Math.min(Number(params.weakMagnitude || 0), 1));
      const strong = Math.max(0, Math.min(Number(params.strongMagnitude || 0), 1));
      const rightMotor = Math.round(weak * 255);
      const leftMotor = Math.round(strong * 255);

      state.rumbleCalls += 1;
      updateBridgeStatus();
      await sendControllerReport(rightMotor, leftMotor);
      if (duration > 0) {
        window.setTimeout(() => {
          sendControllerReport(0, 0).catch(() => {});
        }, duration);
      }
      return "complete";
    },
    async pulse(value, duration) {
      const magnitude = Math.max(0, Math.min(Number(value || 0), 1));
      return this.playEffect("dual-rumble", {
        duration,
        weakMagnitude: magnitude,
        strongMagnitude: magnitude
      });
    },
    async reset() {
      await sendControllerReport(0, 0);
      return "complete";
    }
  };

  function attachBridgeActuator(gamepad) {
    if (!gamepad || state.patchedGamepads.has(gamepad)) return gamepad;
    try {
      Object.defineProperty(gamepad, "vibrationActuator", {
        configurable: true,
        enumerable: true,
        get() {
          return state.device ? bridgeActuator : null;
        }
      });
    } catch (error) {
      // Some Chromium builds expose read-only Gamepad objects. Prototype and
      // navigator patches below still cover those cases when allowed.
    }
    try {
      Object.defineProperty(gamepad, "hapticActuators", {
        configurable: true,
        enumerable: true,
        get() {
          return state.device ? [bridgeActuator] : [];
        }
      });
    } catch (error) {
      // Best effort; cloud clients usually check vibrationActuator first.
    }
    state.patchedGamepads.add(gamepad);
    return gamepad;
  }

  function patchGamepadPrototype() {
    if ("Gamepad" in window) {
      const originalVibration = Object.getOwnPropertyDescriptor(Gamepad.prototype, "vibrationActuator");
      const originalHaptics = Object.getOwnPropertyDescriptor(Gamepad.prototype, "hapticActuators");

      try {
        Object.defineProperty(Gamepad.prototype, "vibrationActuator", {
          configurable: true,
          enumerable: true,
          get() {
            const nativeActuator = originalVibration && originalVibration.get ? originalVibration.get.call(this) : null;
            return state.device ? bridgeActuator : nativeActuator;
          }
        });
      } catch (error) {
        setStatus(`Gamepad prototype vibration patch failed: ${error.message || error}`);
      }

      try {
        Object.defineProperty(Gamepad.prototype, "hapticActuators", {
          configurable: true,
          enumerable: true,
          get() {
            const nativeActuators = originalHaptics && originalHaptics.get ? originalHaptics.get.call(this) : [];
            return state.device ? [bridgeActuator] : nativeActuators;
          }
        });
      } catch (error) {
        setStatus(`Gamepad prototype haptics patch failed: ${error.message || error}`);
      }
    }

    if (!navigator.getGamepads || navigator.getGamepads.__dualSenseBridgePatched) return;
    const nativeGetGamepads = navigator.getGamepads.bind(navigator);
    const patchedGetGamepads = function getGamepadsWithDualSenseHaptics() {
      const gamepads = Array.from(nativeGetGamepads());
      for (const gamepad of gamepads) attachBridgeActuator(gamepad);
      const hasNativeGamepad = gamepads.some(Boolean);
      if (state.device && !hasNativeGamepad) {
        if (!state.syntheticGamepad) state.syntheticGamepad = createSyntheticGamepad();
        gamepads[0] = state.syntheticGamepad;
      }
      return gamepads;
    };
    patchedGetGamepads.__dualSenseBridgePatched = true;

    const originalVibration = Object.getOwnPropertyDescriptor(Gamepad.prototype, "vibrationActuator");
    try {
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        enumerable: false,
        value: patchedGetGamepads
      });
      return;
    } catch (error) {
      // Fall back to Navigator.prototype below.
    }

    try {
      Object.defineProperty(Navigator.prototype, "getGamepads", {
        configurable: true,
        enumerable: false,
        value: patchedGetGamepads
      });
    } catch (error) {
      setStatus(`navigator.getGamepads patch failed: ${error.message || error}`);
    }
  }

  function patchExistingGamepads() {
    try {
      if (!navigator.getGamepads) return;
      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) attachBridgeActuator(gamepad);
      updateGamepadProbeState(Array.from(gamepads).filter(Boolean));
    } catch (error) {
      setStatus(`existing gamepad patch failed: ${error.message || error}`);
    }
  }

  function emitGamepadConnected() {
    if (state.connectedEventSent) return;
    state.connectedEventSent = true;
    const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const gamepad = gamepads[0] || state.syntheticGamepad || createSyntheticGamepad();
    attachBridgeActuator(gamepad);
    try {
      window.dispatchEvent(new GamepadEvent("gamepadconnected", { gamepad }));
    } catch (error) {
      const event = new Event("gamepadconnected");
      event.gamepad = gamepad;
      window.dispatchEvent(event);
    }
  }

  function updateGamepadProbeState(gamepads) {
    state.lastGamepadCount = gamepads.length;
    state.lastHasBridgeActuator = gamepads.some((gamepad) => gamepad.vibrationActuator === bridgeActuator);
  }

  function updateBridgeStatus() {
    if (!state.device) {
      setStatus(`Controller haptics: not connected, ${state.lastGamepadCount} gamepad(s)`);
      return;
    }
    setStatus(
      `Controller haptics: ${state.transport}, ${state.lastGamepadCount} gamepad(s), ` +
      `bridge ${state.lastHasBridgeActuator ? "yes" : "no"}, rumble ${state.rumbleCalls}`
    );
  }

  function installDebugApi() {
    window.__dualSenseHapticsBridge = {
      connect,
      test: () => bridgeActuator.playEffect("dual-rumble", {
        duration: 400,
        weakMagnitude: 1,
        strongMagnitude: 1
      }),
      status: () => ({
        connected: Boolean(state.device),
        opened: Boolean(state.device && state.device.opened),
        lastStatus: state.lastStatus,
        getGamepadsPatched: Boolean(navigator.getGamepads && navigator.getGamepads.__dualSenseBridgePatched),
        transport: state.transport,
        rumbleCalls: state.rumbleCalls,
        gamepadCount: state.lastGamepadCount,
        hasBridgeActuator: state.lastHasBridgeActuator,
        touchpad: { ...state.touchpad },
        pointerTouchpad: state.pointerTouchpad
      }),
      setPointerTouchpad: (enabled) => {
        state.pointerTouchpad = Boolean(enabled);
        return state.pointerTouchpad;
      }
    };
  }

  function installGamepadProbe() {
    window.setInterval(() => {
      try {
        const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
        updateGamepadProbeState(gamepads);
        updateBridgeStatus();
      } catch (error) {
        // Keep the page quiet if a site blocks polling.
      }
    }, 1000);
  }

  function setStatus(text) {
    state.lastStatus = text;
    const node = document.getElementById("dualsense-haptics-bridge-status");
    if (node) node.textContent = text;
  }

  async function openDevice(device) {
    state.device = device;
    if (!device.opened) await device.open();
    if (!state.syntheticGamepad) state.syntheticGamepad = createSyntheticGamepad();
    device.addEventListener("inputreport", (event) => {
      if (isDualShock4()) parseDualShock4InputReport(event.reportId, event.data);
      else parseDualSenseInputReport(event.reportId, event.data);
    });
    patchExistingGamepads();
    emitGamepadConnected();
    updateBridgeStatus();
    return device;
  }

  async function connect() {
    try {
      if (!("hid" in navigator)) {
        setStatus("WebHID is not available in this browser");
        return;
      }
      const devices = await navigator.hid.requestDevice({
        filters: [
          { vendorId: SONY_VENDOR_ID }
        ]
      });
      if (!devices.length) {
        setStatus("Controller haptics: no device selected");
        return;
      }
      await openDevice(devices[0]);
      await bridgeActuator.playEffect("dual-rumble", {
        duration: 250,
        weakMagnitude: 0.7,
        strongMagnitude: 0.7
      });
    } catch (error) {
      setStatus(`Controller haptics: ${error.name || "Error"}: ${error.message || error}`);
    }
  }

  async function reconnectKnownDevice() {
    try {
      if (!("hid" in navigator)) return;
      const devices = await navigator.hid.getDevices();
      const device = devices.find((candidate) => (
        candidate.vendorId === SONY_VENDOR_ID
      ));
      if (device) await openDevice(device);
    } catch (error) {
      setStatus(`Controller haptics reconnect failed: ${error.message || error}`);
    }
  }

  function mountButton() {
    if (document.getElementById("dualsense-haptics-bridge")) return;

    const root = document.createElement("div");
    root.id = "dualsense-haptics-bridge";
    root.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "display:flex",
      "gap:8px",
      "align-items:center",
      "padding:8px",
      "border:1px solid rgba(255,255,255,.24)",
      "border-radius:8px",
      "background:rgba(20,20,24,.88)",
      "color:white",
      "font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "box-shadow:0 8px 30px rgba(0,0,0,.35)"
    ].join(";");

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Connect Controller haptics";
    button.style.cssText = [
      "height:30px",
      "border:0",
      "border-radius:6px",
      "padding:0 10px",
      "background:#fff",
      "color:#111",
      "font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", connect);

    const test = document.createElement("button");
    test.type = "button";
    test.textContent = "Test";
    test.style.cssText = button.style.cssText;
    test.addEventListener("click", () => bridgeActuator.playEffect("dual-rumble", {
      duration: 350,
      weakMagnitude: 1,
      strongMagnitude: 1
    }).catch((error) => setStatus(error.message || String(error))));

    const touchpad = document.createElement("button");
    touchpad.type = "button";
    touchpad.textContent = "Touchpad Pointer";
    touchpad.style.cssText = button.style.cssText;
    touchpad.addEventListener("click", () => {
      state.pointerTouchpad = !state.pointerTouchpad;
      setStatus(`Touchpad pointer ${state.pointerTouchpad ? "on" : "off"}`);
    });

    const status = document.createElement("span");
    status.id = "dualsense-haptics-bridge-status";
    status.textContent = state.lastStatus;

    root.append(button, test, touchpad, status);
    document.documentElement.appendChild(root);
  }

  try {
    patchGamepadPrototype();
    installDebugApi();
    installGamepadProbe();
    window.addEventListener("gamepadconnected", (event) => {
      attachBridgeActuator(event.gamepad);
      patchExistingGamepads();
    }, true);
  } catch (error) {
    setStatus(`Gamepad patch failed: ${error.message || error}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton, { once: true });
  } else {
    mountButton();
  }
  reconnectKnownDevice();
  window.addEventListener("gamepadconnected", patchExistingGamepads);
})();
