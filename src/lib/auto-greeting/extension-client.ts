"use client";

type BridgeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type BossTabInfo = {
  id?: number;
  active: boolean;
  title: string;
  url: string;
};

type BossCommandResult<T = unknown> = {
  tabId: number;
  frameId?: number;
  response?: BridgeResponse<T>;
};

function createRequestId(): string {
  return `ag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function waitForBridgeResponse<T>(requestId: string, timeoutMs = 3000): Promise<BridgeResponse<T>> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('扩展未响应，请确认扩展已安装并已刷新页面'));
    }, timeoutMs);

    const listener = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.source !== 'auto-greeting-extension' || payload.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve(payload.response as BridgeResponse<T>);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', listener);
    };

    window.addEventListener('message', listener);
  });
}

async function postBridgeMessage<T>(payload: Record<string, unknown>, timeoutMs = 3000): Promise<BridgeResponse<T>> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      error: '当前环境不支持浏览器扩展桥接',
    };
  }

  const requestId = createRequestId();
  const responsePromise = waitForBridgeResponse<T>(requestId, timeoutMs);
  window.postMessage(
    {
      source: 'auto-greeting-app',
      requestId,
      ...payload,
    },
    '*'
  );

  return responsePromise;
}

export async function pingBossExtension() {
  return postBridgeMessage<{ version: string }>({ type: 'PING' });
}

export async function getBossExtensionTabs() {
  return postBridgeMessage<BossTabInfo[]>({ type: 'GET_BOSS_TABS' });
}

export async function runBossExtensionCommand<T = unknown>(
  command: string,
  options?: {
    tabId?: number;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
  }
) {
  return postBridgeMessage<BossCommandResult<T>>(
    {
      type: 'RUN_BOSS_COMMAND',
      command,
      tabId: options?.tabId,
      payload: options?.payload || {},
    },
    options?.timeoutMs ?? 5000
  );
}
