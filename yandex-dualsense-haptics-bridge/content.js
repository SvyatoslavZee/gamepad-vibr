(function injectBridge() {
  function inject() {
    const parent = document.documentElement || document.head || document.body;
    if (!parent) {
      window.setTimeout(inject, 10);
      return;
    }
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("bridge.js");
    script.async = false;
    script.onload = () => script.remove();
    parent.appendChild(script);
  }

  inject();
})();
