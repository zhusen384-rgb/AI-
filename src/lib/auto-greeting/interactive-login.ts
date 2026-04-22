import { randomUUID } from "crypto";
import type { Cookie, Page } from "puppeteer";
import { BrowserManager, humanClick, humanType, randomSleep, sleep } from "@/lib/auto-greeting/browser-manager";
import { loginManager } from "@/lib/auto-greeting/login-manager";
import type { Platform } from "@/lib/auto-greeting/types";

type SessionStatus = "launching" | "waiting_login" | "completed" | "error" | "cancelled";

interface SessionOwner {
  userId: string;
  tenantId?: string;
}

interface InteractiveLoginSession {
  id: string;
  platform: Platform;
  status: SessionStatus;
  browserManager: BrowserManager;
  page: Page;
  owner: SessionOwner;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  accountRecordId?: string;
  nickname?: string;
  currentUrl?: string;
  title?: string;
  pageTextSnippet?: string;
  screenshotDataUrl?: string;
  confirmedLoggedInChecks: number;
}

function isDetachedFrameError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('detached Frame') ||
    error.message.includes('Execution context was destroyed') ||
    error.message.includes('Cannot find context with specified id')
  );
}

async function navigateLikeHuman(page: Page, platform: Platform): Promise<void> {
  if (platform !== "boss") {
    await page.goto("https://www.zhipin.com/web/user/?ka=header-login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    return;
  }

  const useGoogleSearch = process.env.AUTO_GREETING_LOGIN_VIA_GOOGLE === "true";
  if (useGoogleSearch) {
    try {
      await page.goto("https://www.google.com/", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await randomSleep(500, 1200);

      const searchInput = await page.$('textarea[name="q"], input[name="q"]');
      if (searchInput) {
        await humanType(page, 'textarea[name="q"], input[name="q"]', "boss直聘", {
          minDelay: 60,
          maxDelay: 160,
        });
        await randomSleep(400, 900);
        await page.keyboard.press("Enter");
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => undefined);
        await randomSleep(800, 1500);

        const resultHref = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
          const candidate = anchors.find((anchor) => {
            const href = anchor.href || "";
            const text = (anchor.innerText || anchor.textContent || "").trim();
            return href.includes("zhipin.com") && text.length > 0;
          });

          if (!candidate?.href) {
            return null;
          }

          try {
            const url = new URL(candidate.href);
            const redirectTarget = url.searchParams.get("q") || url.searchParams.get("url");
            return redirectTarget || candidate.href;
          } catch {
            return candidate.href;
          }
        });

        if (resultHref) {
          await page.goto(resultHref, {
            waitUntil: "networkidle2",
            timeout: 20000,
          });
          return;
        }
      }
    } catch {
      // Fall back to direct navigation when search is blocked or unavailable.
    }
  }

  await page.goto("https://www.zhipin.com/web/user/?ka=header-login", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
}

async function readLoginState(page: Page, platform: Platform) {
  const currentUrl = (() => {
    try {
      return page.url();
    } catch {
      return "";
    }
  })();

  const title = await page.title().catch(() => "");

  const cookies = await page.cookies().catch(() => [] as Cookie[]);
  const usefulCookies = cookies.filter((cookie) => cookie.value && cookie.value.length > 5);

  if (usefulCookies.length === 0) {
    return {
      loggedIn: false,
      currentUrl,
      title,
      nickname: "",
    };
  }

  const checkResult = await loginManager.checkLoginStatus(platform, usefulCookies);

  return {
    loggedIn: checkResult.isLoggedIn,
    nickname: checkResult.accountInfo?.nickname || "",
    currentUrl,
    title,
  };
}

async function captureSessionSnapshot(session: InteractiveLoginSession): Promise<void> {
  if (session.page.isClosed()) {
    return;
  }

  try {
    const [title, pageText, screenshot] = await Promise.all([
      session.page.title().catch(() => ""),
      session.page
        .evaluate(() => (document.body?.innerText || "").trim().slice(0, 800))
        .catch(() => ""),
      session.page.screenshot({ fullPage: false }).catch(() => null),
    ]);

    session.currentUrl = session.page.url();
    session.title = title || session.title;
    session.pageTextSnippet = pageText || session.pageTextSnippet;

    if (screenshot) {
      session.screenshotDataUrl = `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
    }
  } catch (error) {
    if (isDetachedFrameError(error)) {
      session.error = "登录页面正在跳转，请继续完成登录...";
      return;
    }

    if (error instanceof Error) {
      session.error = error.message;
    }
  }
}

async function readLoginStateWithRetry(
  page: Page,
  platform: Platform,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
) {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 600;

  let lastError: unknown = null;

  for (let index = 0; index < attempts; index += 1) {
    if (page.isClosed()) {
      throw new Error('登录窗口已关闭');
    }

    try {
      return await readLoginState(page, platform);
    } catch (error) {
      lastError = error;
      if (!isDetachedFrameError(error) || index === attempts - 1) {
        throw error;
      }
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('读取登录状态失败');
}

async function closeSession(session: InteractiveLoginSession): Promise<void> {
  try {
    await session.page.close();
  } catch {
    // Ignore close failures during cleanup.
  }

  await session.browserManager.close().catch(() => undefined);
}

export class InteractiveLoginManager {
  private static instance: InteractiveLoginManager;
  private readonly sessions = new Map<string, InteractiveLoginSession>();

  static getInstance(): InteractiveLoginManager {
    if (!InteractiveLoginManager.instance) {
      InteractiveLoginManager.instance = new InteractiveLoginManager();
    }

    return InteractiveLoginManager.instance;
  }

  async startSession(platform: Platform, owner: SessionOwner) {
    const sessionId = randomUUID();
    const browserManager = BrowserManager.createDedicated({
      headless: false,
      slowMo: 80,
      disableAntiDetection: true,
      interactiveMode: true,
      browserURL: undefined,
      browserWSEndpoint: undefined,
      userDataDir: undefined,
      profileDirectory: undefined,
    });
    const page = await browserManager.createPage(`interactive-login-${sessionId}`);

    const session: InteractiveLoginSession = {
      id: sessionId,
      platform,
      status: "launching",
      browserManager,
      page,
      owner,
      createdAt: new Date(),
      updatedAt: new Date(),
      confirmedLoggedInChecks: 0,
    };

    this.sessions.set(sessionId, session);

    try {
      await navigateLikeHuman(page, platform);
      await page.bringToFront().catch(() => undefined);
      session.status = "waiting_login";
      session.nickname = undefined;
      await captureSessionSnapshot(session);
      session.updatedAt = new Date();
      session.confirmedLoggedInChecks = 0;
    } catch (error) {
      session.status = "error";
      session.error = error instanceof Error ? error.message : "登录窗口启动失败";
      session.updatedAt = new Date();
    }

    return this.serializeSession(session);
  }

  async getSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.status === "waiting_login" || session.status === "launching") {
      try {
        const loginState = await readLoginStateWithRetry(session.page, session.platform);
        session.nickname = loginState.nickname || session.nickname;
        session.currentUrl = loginState.currentUrl;
        session.title = loginState.title;
        await captureSessionSnapshot(session);

        if (loginState.loggedIn) {
          session.confirmedLoggedInChecks += 1;
          if (session.confirmedLoggedInChecks >= 1) {
            session.status = "completed";
            await this.finalizeSession(session);
          } else {
            session.status = "waiting_login";
          }
        } else if (session.status === "launching") {
          session.status = "waiting_login";
          session.confirmedLoggedInChecks = 0;
        } else {
          session.confirmedLoggedInChecks = 0;
        }

        session.updatedAt = new Date();
      } catch (error) {
        if (isDetachedFrameError(error)) {
          session.status = "waiting_login";
          session.error = "登录页面正在跳转，请继续完成登录...";
          await captureSessionSnapshot(session);
          session.updatedAt = new Date();
        } else {
          session.status = "error";
          session.error = error instanceof Error ? error.message : "登录状态检测失败";
          await captureSessionSnapshot(session);
          session.updatedAt = new Date();
        }
      }
    }

    return this.serializeSession(session);
  }

  async cancelSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = "cancelled";
    session.updatedAt = new Date();
    await closeSession(session);
    this.sessions.delete(sessionId);
    return true;
  }

  private async finalizeSession(session: InteractiveLoginSession) {
    if (session.accountRecordId) {
      return;
    }

    const cookies = await session.page.cookies();
    const usefulCookies = cookies.filter((cookie) => cookie.value && cookie.value.length > 5);

    if (usefulCookies.length === 0) {
      session.status = "error";
      session.error = "登录成功但未获取到有效 Cookies";
      return;
    }

    session.accountRecordId = await loginManager.saveAccount({
      platform: session.platform,
      accountId: "",
      nickname: session.nickname || "",
      cookies: usefulCookies,
      userAgent:
        (await session.page.evaluate(() => navigator.userAgent).catch(() => "")) ||
        "Mozilla/5.0",
      loginStatus: "valid",
      status: "active",
      createdById: session.owner.userId,
      tenantId: session.owner.tenantId,
    });

    await closeSession(session);
  }

  private serializeSession(session: InteractiveLoginSession) {
    return {
      id: session.id,
      platform: session.platform,
      status: session.status,
      error: session.error,
      accountRecordId: session.accountRecordId,
      nickname: session.nickname,
      currentUrl: session.currentUrl,
      title: session.title,
      pageTextSnippet: session.pageTextSnippet,
      screenshotDataUrl: session.screenshotDataUrl,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}

export const interactiveLoginManager = InteractiveLoginManager.getInstance();
