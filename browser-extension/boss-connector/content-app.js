(function () {
  if (window.__AUTO_GREETING_EXTENSION_APP_BRIDGE__) {
    return;
  }
  window.__AUTO_GREETING_EXTENSION_APP_BRIDGE__ = true;

  window.addEventListener('message', async (event) => {
    const payload = event.data;
    if (event.source !== window) return;
    if (!payload || payload.source !== 'auto-greeting-app' || !payload.requestId) return;

    try {
      let response;
      if (payload.type === 'PING') {
        response = await chrome.runtime.sendMessage({ type: 'APP_PING' });
      } else if (payload.type === 'GET_BOSS_TABS') {
        response = await chrome.runtime.sendMessage({ type: 'GET_BOSS_TABS' });
      } else if (payload.type === 'RUN_BOSS_COMMAND') {
        response = await chrome.runtime.sendMessage({
          type: 'RUN_BOSS_COMMAND',
          command: payload.command,
          payload: payload.payload,
          tabId: payload.tabId,
        });
      } else {
        response = { ok: false, error: '未知桥接请求' };
      }

      window.postMessage(
        {
          source: 'auto-greeting-extension',
          requestId: payload.requestId,
          response,
        },
        '*'
      );
    } catch (error) {
      window.postMessage(
        {
          source: 'auto-greeting-extension',
          requestId: payload.requestId,
          response: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        },
        '*'
      );
    }
  });
})();
