(function dualSensePlusGamingBridge() {
  if (window.__dualSensePlusGamingBridge) {
    window.__dualSensePlusGamingBridge.mount();
    return;
  }

  const SONY_VENDOR_ID = 0x054c;
  const DUALSENSE_VENDOR_ID = SONY_VENDOR_ID;
  const DUALSENSE_PRODUCT_ID = 0x0ce6;
  const DUALSHOCK4_PRODUCT_IDS = new Set([0x05c4, 0x09cc]);

  const state = {
    device: null,
    outputSeq: 0,
    syntheticGamepad: null,
    nativeGetGamepads: navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null,
    connectedEventSent: false,
    patchedWindows: new WeakSet(),
    patchedGamepads: new WeakSet(),
    rumbleCalls: 0,
    transport: "unknown",
    frameStats: {
      patched: 0,
      blocked: 0
    }
  };

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

  function isDualShock4(device = state.device) {
    return Boolean(device && device.vendorId === SONY_VENDOR_ID && DUALSHOCK4_PRODUCT_IDS.has(device.productId));
  }

  function isDualSense(device = state.device) {
    return Boolean(device && device.vendorId === DUALSENSE_VENDOR_ID && device.productId === DUALSENSE_PRODUCT_ID);
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

  async function sendDualSenseReport(rightMotor, leftMotor) {
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

  const actuator = {
    type: "dual-rumble",
    effects: ["dual-rumble"],
    async playEffect(effectType, params = {}) {
      if (effectType !== "dual-rumble") return "not-supported";
      const weak = Math.max(0, Math.min(Number(params.weakMagnitude || 0), 1));
      const strong = Math.max(0, Math.min(Number(params.strongMagnitude || 0), 1));
      const duration = Math.max(0, Math.min(Number(params.duration || 0), 5000));
      state.rumbleCalls += 1;
      updateReadyStatus();
      await sendDualSenseReport(Math.round(weak * 255), Math.round(strong * 255));
      if (duration > 0) {
        setTimeout(() => sendDualSenseReport(0, 0).catch(() => {}), duration);
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
      await sendDualSenseReport(0, 0);
      return "complete";
    }
  };

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
    return {
      id: "DualSense Wireless Controller (WebHID Bridge)",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: performance.now(),
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => makeButton(0)),
      vibrationActuator: actuator,
      hapticActuators: [actuator]
    };
  }

  function ensureSyntheticGamepad() {
    if (!state.syntheticGamepad) state.syntheticGamepad = createSyntheticGamepad();
    return state.syntheticGamepad;
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
    const data = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const offset = reportId === 0x31 ? 1 : 0;
    if (data.length < offset + 10) return;

    const gamepad = ensureSyntheticGamepad();
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
  }

  function parseDualShock4InputReport(reportId, dataView) {
    if (reportId !== 0x01 && reportId !== 0x11) return;
    state.transport = reportId === 0x01 ? "usb-ds4" : "bluetooth-ds4";
    const data = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const offset = reportId === 0x11 ? 2 : 0;
    if (data.length < offset + 9) return;

    const gamepad = ensureSyntheticGamepad();
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

  function attachBridgeActuator(targetWindow, gamepad) {
    if (!gamepad || state.patchedGamepads.has(gamepad)) return gamepad;
    try {
      Object.defineProperty(gamepad, "vibrationActuator", {
        configurable: true,
        enumerable: true,
        get() {
          return state.device ? actuator : null;
        }
      });
    } catch (error) {}
    try {
      Object.defineProperty(gamepad, "hapticActuators", {
        configurable: true,
        enumerable: true,
        get() {
          return state.device ? [actuator] : [];
        }
      });
    } catch (error) {}
    state.patchedGamepads.add(gamepad);
    return gamepad;
  }

  function patchGamepadPrototype(targetWindow) {
    if (!targetWindow.Gamepad || targetWindow.Gamepad.prototype.__dualSenseBridgeActuatorPatched) return;
    const prototype = targetWindow.Gamepad.prototype;
    const originalVibration = Object.getOwnPropertyDescriptor(prototype, "vibrationActuator");
    const originalHaptics = Object.getOwnPropertyDescriptor(prototype, "hapticActuators");
    try {
      Object.defineProperty(prototype, "vibrationActuator", {
        configurable: true,
        enumerable: true,
        get() {
          const nativeActuator = originalVibration && originalVibration.get ? originalVibration.get.call(this) : null;
          return state.device ? actuator : nativeActuator;
        }
      });
    } catch (error) {}
    try {
      Object.defineProperty(prototype, "hapticActuators", {
        configurable: true,
        enumerable: true,
        get() {
          const nativeActuators = originalHaptics && originalHaptics.get ? originalHaptics.get.call(this) : [];
          return state.device ? [actuator] : nativeActuators;
        }
      });
    } catch (error) {}
    try {
      Object.defineProperty(prototype, "__dualSenseBridgeActuatorPatched", {
        configurable: true,
        value: true
      });
    } catch (error) {}
  }

  function patchWindowGamepads(targetWindow = window) {
    if (state.patchedWindows.has(targetWindow)) return true;
    if (!targetWindow.navigator || !targetWindow.navigator.getGamepads) return false;
    patchGamepadPrototype(targetWindow);
    const nativeGetGamepads = targetWindow.navigator.getGamepads.bind(targetWindow.navigator);
    targetWindow.navigator.getGamepads = function getGamepadsWithDualSenseBridge() {
      const gamepads = Array.from(nativeGetGamepads());
      for (const gamepad of gamepads) attachBridgeActuator(targetWindow, gamepad);
      if (state.device && !gamepads.some(Boolean)) {
        gamepads[0] = ensureSyntheticGamepad();
      }
      return gamepads;
    };
    state.patchedWindows.add(targetWindow);
    return true;
  }

  function scanAndPatchFrames(rootWindow = window) {
    let patched = 0;
    let blocked = 0;

    function visit(targetWindow) {
      try {
        if (patchWindowGamepads(targetWindow)) patched += 1;
        for (let index = 0; index < targetWindow.frames.length; index += 1) {
          visit(targetWindow.frames[index]);
        }
      } catch (error) {
        blocked += 1;
      }
    }

    visit(rootWindow);
    state.frameStats = {
      patched,
      blocked
    };
    updateReadyStatus();
  }

  function updateReadyStatus() {
    if (state.device) {
      setStatus(`Controller ${state.transport}; frames ${state.frameStats.patched}/${state.frameStats.blocked} blocked; rumble ${state.rumbleCalls}`);
    } else {
      setStatus(`Bridge ready; frames ${state.frameStats.patched}/${state.frameStats.blocked} blocked`);
    }
  }

  function emitGamepadConnected() {
    if (state.connectedEventSent) return;
    state.connectedEventSent = true;
    const gamepad = ensureSyntheticGamepad();
    try {
      window.dispatchEvent(new GamepadEvent("gamepadconnected", { gamepad }));
    } catch (error) {
      const event = new Event("gamepadconnected");
      event.gamepad = gamepad;
      window.dispatchEvent(event);
    }
  }

  function setStatus(text) {
    const status = document.getElementById("dualsense-plusgaming-status");
    if (status) status.textContent = text;
  }

  async function openDevice(device) {
    state.device = device;
    if (!device.opened) await device.open();
    device.addEventListener("inputreport", (event) => {
      if (isDualShock4()) parseDualShock4InputReport(event.reportId, event.data);
      else parseDualSenseInputReport(event.reportId, event.data);
    });
    ensureSyntheticGamepad();
    scanAndPatchFrames();
    emitGamepadConnected();
    updateReadyStatus();
    await actuator.playEffect("dual-rumble", {
      duration: 220,
      weakMagnitude: 0.7,
      strongMagnitude: 0.7
    });
  }

  async function connect() {
    try {
      if (!("hid" in navigator)) {
        setStatus("WebHID is unavailable");
        return;
      }
      const devices = await navigator.hid.requestDevice({
        filters: [
          { vendorId: SONY_VENDOR_ID }
        ]
      });
      if (!devices.length) {
        setStatus("No Sony controller selected");
        return;
      }
      await openDevice(devices[0]);
    } catch (error) {
      setStatus(`${error.name || "Error"}: ${error.message || error}`);
    }
  }

  function mount() {
    let root = document.getElementById("dualsense-plusgaming-bridge");
    if (root) {
      root.style.display = "flex";
      return;
    }

    root = document.createElement("div");
    root.id = "dualsense-plusgaming-bridge";
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
      "background:rgba(18,18,22,.9)",
      "color:white",
      "font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "box-shadow:0 8px 30px rgba(0,0,0,.35)"
    ].join(";");

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Connect Controller";
    button.style.cssText = [
      "height:30px",
      "border:0",
      "border-radius:6px",
      "padding:0 10px",
      "background:white",
      "color:#111",
      "font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", connect);

    const test = document.createElement("button");
    test.type = "button";
    test.textContent = "Test";
    test.style.cssText = button.style.cssText;
    test.addEventListener("click", () => actuator.playEffect("dual-rumble", {
      duration: 350,
      weakMagnitude: 1,
      strongMagnitude: 1
    }).catch((error) => setStatus(error.message || String(error))));

    const status = document.createElement("span");
    status.id = "dualsense-plusgaming-status";
    status.textContent = "Bridge ready";

    root.append(button, test, status);
    document.documentElement.appendChild(root);
  }

  scanAndPatchFrames();
  setInterval(scanAndPatchFrames, 1000);
  window.__dualSensePlusGamingBridge = {
    mount,
    scanAndPatchFrames,
    connect,
    test: () => actuator.playEffect("dual-rumble", {
      duration: 350,
      weakMagnitude: 1,
      strongMagnitude: 1
    }),
    getGamepads: () => navigator.getGamepads(),
    status: () => ({
      connected: Boolean(state.device),
      syntheticGamepad: Boolean(state.syntheticGamepad),
      frames: state.frameStats,
      transport: state.transport
    })
  };
  mount();
})();
