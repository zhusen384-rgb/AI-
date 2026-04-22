const RECOMMEND_FRAME_KEYWORD = '/web/frame/recommend/';
const SERVICE_WORKER_PATH = chrome.runtime.getManifest().background?.service_worker || 'background.js';
const EXTENSION_ASSET_PREFIX = SERVICE_WORKER_PATH.includes('/')
  ? `${SERVICE_WORKER_PATH.substring(0, SERVICE_WORKER_PATH.lastIndexOf('/') + 1)}`
  : '';
const BOSS_CONTENT_SCRIPT_PATH = `${EXTENSION_ASSET_PREFIX}content-boss.js`;
const FRAME_COMMANDS = new Set([
  'boss.getPageInfo',
  'boss.selectRecommendJob',
  'boss.inspectFirstCandidate',
  'boss.greetFirstCandidate',
  'boss.inspectNextCandidate',
  'boss.greetCurrentCandidate',
  'boss.skipCurrentCandidate',
  'boss.resetSeenCandidates',
  'boss.reviewCurrentCandidateResume',
]);

async function getBossTabs() {
  const tabs = await chrome.tabs.query({
    url: ['https://www.zhipin.com/*', 'https://zhipin.com/*'],
  });

  return tabs.map((tab) => ({
    id: tab.id,
    active: Boolean(tab.active),
    title: tab.title || '',
    url: tab.url || '',
  }));
}

async function getRecommendFrameId(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const recommendFrame = frames.find((frame) => frame.url && frame.url.includes(RECOMMEND_FRAME_KEYWORD));
  return recommendFrame?.frameId ?? 0;
}

async function getActiveBossTab() {
  const tabs = await chrome.tabs.query({
    url: ['https://www.zhipin.com/*', 'https://zhipin.com/*'],
    active: true,
    lastFocusedWindow: true,
  });

  return tabs[0] || null;
}

async function ensureBossContentScriptInjected(tabId, frameId) {
  const target = frameId
    ? { tabId, frameIds: [frameId] }
    : { tabId, allFrames: true };

  await chrome.scripting.executeScript({
    target,
    files: [BOSS_CONTENT_SCRIPT_PATH],
  });
}

async function sendBossCommand(tabId, command, payload) {
  let frameId = FRAME_COMMANDS.has(command)
    ? await getRecommendFrameId(tabId)
    : 0;

  const message = {
    type: 'BOSS_COMMAND',
    command,
    payload: payload || {},
  };

  if (FRAME_COMMANDS.has(command) && !frameId) {
    await ensureBossContentScriptInjected(tabId);
    frameId = await getRecommendFrameId(tabId);
  }

  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      message,
      frameId ? { frameId } : undefined
    );

    return {
      tabId,
      frameId,
      response,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const needsReinject = errorMessage.includes('Receiving end does not exist');

    if (!needsReinject) {
      throw error;
    }

    await ensureBossContentScriptInjected(tabId, frameId || undefined);
    if (FRAME_COMMANDS.has(command) && !frameId) {
      frameId = await getRecommendFrameId(tabId);
    }

    const retryResponse = await chrome.tabs.sendMessage(
      tabId,
      message,
      frameId ? { frameId } : undefined
    );

    return {
      tabId,
      frameId,
      response: retryResponse,
      reinjected: true,
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'APP_PING') {
        sendResponse({
          ok: true,
          data: {
            version: chrome.runtime.getManifest().version,
          },
        });
        return;
      }

      if (message?.type === 'GET_BOSS_TABS') {
        sendResponse({
          ok: true,
          data: await getBossTabs(),
        });
        return;
      }

      if (message?.type === 'RUN_BOSS_COMMAND') {
        const requestedTabId = Number(message.tabId);
        const activeBossTab = await getActiveBossTab();
        const tabId = Number.isFinite(requestedTabId) ? requestedTabId : activeBossTab?.id;

        if (!tabId) {
          sendResponse({
            ok: false,
            error: '未找到可用的 Boss 标签页',
          });
          return;
        }

        sendResponse({
          ok: true,
          data: await sendBossCommand(tabId, message.command, message.payload || {}),
        });
        return;
      }

      sendResponse({
        ok: false,
        error: '未知消息类型',
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});
