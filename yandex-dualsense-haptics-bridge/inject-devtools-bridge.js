#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.DUALSENSE_BRIDGE_DEBUG_PORT || 9222);
const bridgePath = path.join(__dirname, "bridge.js");
const targetPattern = /(^https:\/\/.*\.(yandex|yandex\.net|yastatic|ya)\.|^https:\/\/(igromir|plusgaming)\.yandex\.ru|^http:\/\/localhost:8765)/;
let nextId = 1;
const injected = new Set();

function readBridge() {
  return fs.readFileSync(bridgePath, "utf8");
}

function getJson(route) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: route }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function injectTab(tab, bridge) {
  const client = await connectCdp(tab.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: bridge });
    await client.send("Runtime.evaluate", {
      expression: bridge,
      awaitPromise: false,
      returnByValue: true
    });
    const status = await client.send("Runtime.evaluate", {
      expression: "window.__dualSenseHapticsBridge && window.__dualSenseHapticsBridge.status && window.__dualSenseHapticsBridge.status()",
      returnByValue: true
    });
    injected.add(tab.id);
    console.log(`[bridge] injected ${tab.url}`);
    console.log(`[bridge] status ${JSON.stringify(status.result && status.result.value)}`);
  } finally {
    client.close();
  }
}

async function scan() {
  const bridge = readBridge();
  const tabs = await getJson("/json/list");
  for (const tab of tabs) {
    if (tab.type !== "page" || !targetPattern.test(tab.url || "")) continue;
    if (injected.has(tab.id)) continue;
    try {
      await injectTab(tab, bridge);
    } catch (error) {
      console.error(`[bridge] inject failed ${tab.url}: ${error.message || error}`);
    }
  }
}

async function main() {
  console.log(`[bridge] waiting for Yandex DevTools on 127.0.0.1:${port}`);
  console.log("[bridge] start Yandex with: /Applications/Yandex.app/Contents/MacOS/Yandex --remote-debugging-port=9222 --remote-allow-origins=* https://igromir.yandex.ru/");
  await scan();
  setInterval(() => {
    scan().catch((error) => console.error(`[bridge] scan failed: ${error.message || error}`));
  }, 1000);
}

main().catch((error) => {
  console.error(`[bridge] fatal: ${error.message || error}`);
  process.exit(1);
});
