import { DEFAULT_BROWSER_CONFIG, randomInt, randomSleep, sleep } from "@/lib/auto-greeting/browser-manager";
import {
  BossCandidate,
  BossChatSession,
  BossJobHint,
} from "@/lib/auto-greeting/boss-operator";
import { planBossComputerUserAction } from "@/lib/auto-greeting/computer-user";
import type {
  BossAutomationOperator,
  BossGreetingExecutionResult,
} from "@/lib/auto-greeting/operator-interface";
import { loginManager, type PlatformAccount } from "@/lib/auto-greeting/login-manager";

const BOSS_URLS = {
  main: "https://www.zhipin.com",
  recommend: "https://www.zhipin.com/web/chat/recommend",
  recommendFrame: "https://www.zhipin.com/web/frame/recommend/",
  chat: "https://www.zhipin.com/web/chat/index",
};

const BOSS_SELECTORS = {
  recommendCard: ".candidate-card-wrap",
  recommendCardInner: ".candidate-card-wrap .card-inner[data-geek]",
  recommendGreetButton: ".btn.btn-greet",
  recommendResumeDialog: ".dialog-wrap.active, .dialog-lib-resume.recommendV2",
  recommendResumeGreetButton:
    ".dialog-wrap.active .btn-v2.btn-sure-v2.btn-greet, .dialog-wrap.active .button-chat-wrap.resumeGreet .btn-v2.btn-sure-v2.btn-greet",
  chatItem: ".geek-item",
  chatEditor: "#boss-chat-editor-input",
  chatSendButton: ".submit, .submit-content",
  chatMessageItem: ".item-friend, .item-myself",
  userInfo: ".nav-figure, .user-nav",
};

type AnyPlaywright = any;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：,.!?;:（）()\[\]{}'"']/g, "");
}

function scoreBossJob(
  job: { jobName?: string; positionName?: string; city?: string; locationName?: string; salaryDesc?: string },
  hint?: BossJobHint
): number {
  if (!hint) {
    return 1;
  }

  let score = 0;
  const jobName = normalizeText(job.jobName || job.positionName || "");
  const city = normalizeText(job.city || job.locationName || "");
  const salaryDesc = normalizeText(job.salaryDesc || "");

  if (hint.name) {
    const target = normalizeText(hint.name);
    if (jobName.includes(target) || target.includes(jobName)) {
      score += 10;
    }
  }

  if (hint.location) {
    const target = normalizeText(hint.location);
    if (city.includes(target) || target.includes(city)) {
      score += 4;
    }
  }

  if (hint.salaryMin && salaryDesc.includes(String(hint.salaryMin))) {
    score += 2;
  }

  if (hint.salaryMax && salaryDesc.includes(String(hint.salaryMax))) {
    score += 2;
  }

  return score;
}

function parseResumeText(rawText: string): Partial<BossCandidate> {
  const compact = rawText.replace(/\s+/g, " ").trim();
  return {
    resumePreview: compact.slice(0, 500) || undefined,
    advantage: compact.slice(0, 200) || undefined,
  };
}

async function dynamicImport(specifier: string): Promise<any> {
  const importer = new Function("s", "return import(s);") as (s: string) => Promise<any>;
  return importer(specifier);
}

function mapCookiesForPlaywright(cookies: PlatformAccount["cookies"]) {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || "/",
    expires: cookie.expires && cookie.expires > 0 ? cookie.expires : undefined,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite:
      cookie.sameSite === "Strict" || cookie.sameSite === "Lax" || cookie.sameSite === "None"
        ? cookie.sameSite
        : undefined,
    url: cookie.domain ? undefined : BOSS_URLS.main,
  }));
}

export class PlaywrightMcpBossOperator implements BossAutomationOperator {
  private playwright: AnyPlaywright | null = null;
  private browser: AnyPlaywright | null = null;
  private context: AnyPlaywright | null = null;
  private page: AnyPlaywright | null = null;
  private accountId: string | null = null;
  private account: PlatformAccount | null = null;
  private currentRecommendJobId: string | null = null;

  async init(accountId: string): Promise<{ success: boolean; error?: string }> {
    this.accountId = accountId;
    this.account = await loginManager.getAccount(accountId);
    if (!this.account) {
      return { success: false, error: "账号不存在" };
    }

    try {
      this.playwright = await dynamicImport("playwright");
      await this.launch();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Playwright MCP 初始化失败",
      };
    }
  }

  private async launch(): Promise<void> {
    if (!this.playwright) {
      throw new Error("Playwright 未加载");
    }

    const chromium = this.playwright.chromium;
    if (!chromium) {
      throw new Error("当前环境不支持 Chromium");
    }

    if (DEFAULT_BROWSER_CONFIG.browserWSEndpoint) {
      this.browser = await chromium.connect({
        wsEndpoint: DEFAULT_BROWSER_CONFIG.browserWSEndpoint,
      });
    } else if (DEFAULT_BROWSER_CONFIG.browserURL && chromium.connectOverCDP) {
      this.browser = await chromium.connectOverCDP(DEFAULT_BROWSER_CONFIG.browserURL);
    } else {
      this.browser = await chromium.launch({
        headless: DEFAULT_BROWSER_CONFIG.headless,
        slowMo: DEFAULT_BROWSER_CONFIG.slowMo,
        executablePath: DEFAULT_BROWSER_CONFIG.executablePath,
      });
    }

    this.context = await this.browser.newContext({
      viewport: DEFAULT_BROWSER_CONFIG.viewport,
      userAgent: this.account?.userAgent || DEFAULT_BROWSER_CONFIG.userAgent,
    });

    if (this.account?.cookies?.length) {
      await this.context.addCookies(mapCookiesForPlaywright(this.account.cookies));
    }

    this.page = await this.context.newPage();
    await this.page.goto(BOSS_URLS.main, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
    });
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async gotoRecommendPage(jobHint?: BossJobHint): Promise<void> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    const matchedJob = await this.resolveRecommendJob(jobHint);
    if (!matchedJob?.encryptJobId) {
      throw new Error("未找到 Boss 上对应的招聘岗位");
    }

    this.currentRecommendJobId = matchedJob.encryptJobId;
    await this.page.goto(
      `${BOSS_URLS.recommendFrame}?jobid=${matchedJob.encryptJobId}&status=0&filterParams=&t=&inspectFilterGuide=&version=9594&source=0`,
      {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
      }
    );
    await this.page.waitForSelector(BOSS_SELECTORS.recommendCard, {
      timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
    });
    await randomSleep(600, 1200);
  }

  async gotoChatPage(): Promise<void> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    await this.page.goto(BOSS_URLS.chat, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
    });
    await this.page.waitForSelector(BOSS_SELECTORS.chatItem, {
      timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
    });
    await randomSleep(600, 1200);
  }

  async getRecommendCandidates(jobHint?: BossJobHint): Promise<BossCandidate[]> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    await this.gotoRecommendPage(jobHint);
    const cards = await this.page.locator(BOSS_SELECTORS.recommendCard).evaluateAll((elements: Element[]) => {
      return elements.map((root) => {
        const name = root.querySelector<HTMLElement>(".name")?.textContent?.trim() || "";
        const expectText =
          root.querySelector<HTMLElement>(".expect-wrap .content")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const baseInfo = Array.from(root.querySelectorAll<HTMLElement>(".base-info span"))
          .map((element) => element.textContent?.trim() || "")
          .filter(Boolean);
        const salary = root.querySelector<HTMLElement>(".salary-wrap span")?.textContent?.trim() || undefined;
        const activeTime = root.querySelector<HTMLElement>(".active-text")?.textContent?.trim() || undefined;
        const latestWork =
          root.querySelector<HTMLElement>(".lately-work")?.textContent?.replace(/\s+/g, " ").trim() || undefined;
        const cardInner = root.querySelector<HTMLElement>(".card-inner[data-geek]");
        const text = (root.textContent || "").replace(/\s+/g, " ").trim();
        const expectTokens = expectText.split(" ").filter(Boolean);

        return {
          id: cardInner?.dataset.geek || name,
          cardKey: cardInner?.dataset.geek,
          name,
          salary,
          activeTime,
          location: expectTokens[0] || undefined,
          expectedCity: expectTokens[0] || undefined,
          title: expectTokens.slice(1).join(" ") || undefined,
          expectedPosition: expectTokens.slice(1).join(" ") || undefined,
          experience: baseInfo[0],
          education: baseInfo[1],
          company: latestWork,
          hasGreeted: !((root.querySelector(".btn.btn-greet")?.textContent || "").includes("打招呼")),
          cardText: text,
        };
      });
    });

    return cards.filter((item: BossCandidate) => item.name);
  }

  async inspectCandidateResume(candidate: BossCandidate): Promise<BossCandidate> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    const locator = await this.resolveCandidateLocator(candidate);
    if (!locator) {
      return candidate;
    }

    const plan = await planBossComputerUserAction({
      goal: "打开候选人简历弹窗并读取关键信息",
      pageState: "recommend_list",
      observation: candidate.cardText || candidate.name,
    });

    const responsePromise = this.page.waitForResponse(
      (response: any) =>
        response.url().includes("/wapi/zpjob/view/geek/info") && response.status() === 200,
      { timeout: 8000 }
    ).catch(() => null);

    await locator.click();
    await randomSleep(800, 1500);
    await this.page.waitForSelector(BOSS_SELECTORS.recommendResumeDialog, { timeout: 5000 }).catch(() => null);
    const response = await responsePromise;

    const dialogText = await this.page.locator(BOSS_SELECTORS.recommendResumeDialog).textContent().catch(() => "");
    const parsed = parseResumeText(dialogText || "");
    let enriched = {
      ...candidate,
      ...parsed,
    };

    if (response) {
      try {
        const payload = await response.json();
        const geekDetail = payload?.zpData?.geekDetailInfo || {};
        const base = geekDetail.geekBaseInfo || {};
        enriched = {
          ...enriched,
          company: enriched.company || base.company || undefined,
          education: enriched.education || base.degreeCategory || undefined,
          experience: enriched.experience || base.workYearsDesc || base.workYearDesc || undefined,
        };
      } catch {
        // keep parsed text result
      }
    }

    return {
      ...enriched,
      cardText: candidate.cardText,
      rawGeekId: candidate.rawGeekId || candidate.id,
      id: candidate.id || candidate.cardKey || candidate.name,
      advantage: enriched.advantage,
      resumePreview: enriched.resumePreview,
      skills: candidate.skills,
      hasGreeted: candidate.hasGreeted,
      cardKey: candidate.cardKey,
      diagnostics: undefined,
    } as BossCandidate;
  }

  async sendGreeting(
    candidate: BossCandidate,
    message: string,
    jobHint?: BossJobHint
  ): Promise<BossGreetingExecutionResult> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    if (!this.currentRecommendJobId) {
      await this.gotoRecommendPage(jobHint);
    }

    const locator = await this.resolveCandidateLocator(candidate);
    if (!locator) {
      return { success: false, error: "未找到候选人卡片" };
    }

    const plan = await planBossComputerUserAction({
      goal: "完成 Boss 候选人的首次打招呼",
      pageState: "resume_dialog_or_card",
      observation: `${candidate.name} ${candidate.title || ""} ${candidate.cardText || ""}`.trim(),
    });

    const cardRoot = locator.locator("xpath=ancestor-or-self::*[contains(@class,'candidate-card-wrap')][1]");
    const dialogButton = this.page.locator(BOSS_SELECTORS.recommendResumeGreetButton).first();
    const cardButton = cardRoot.locator(BOSS_SELECTORS.recommendGreetButton).first();
    const useDialogButton = await dialogButton.count().then((count: number) => count > 0).catch(() => false);
    const greetButton = useDialogButton ? dialogButton : cardButton;

    if (await greetButton.count().then((count: number) => count === 0)) {
      return { success: false, error: "候选人已打过招呼或按钮不可用" };
    }

    const buttonTextBefore = (await greetButton.textContent())?.trim() || "";
    if (!buttonTextBefore.includes("打招呼")) {
      return { success: false, error: "当前候选人已进入继续沟通状态" };
    }

    const startResponsePromise = this.page.waitForResponse(
      (response: any) =>
        response.url().includes("/wapi/zpjob/chat/start") && response.status() === 200,
      { timeout: 10000 }
    ).catch(() => null);

    await greetButton.click();
    await randomSleep(1000, 1800);

    const editor = this.page.locator(BOSS_SELECTORS.chatEditor).first();
    if (await editor.count().then((count: number) => count > 0).catch(() => false)) {
      await editor.fill("");
      await editor.type(message, { delay: randomInt(50, 120) });
      await randomSleep(300, 700);
      const sendButton = this.page.locator(BOSS_SELECTORS.chatSendButton).first();
      await sendButton.click();
      return {
        success: true,
        actualMessage: message,
        deliveryMode: "custom_message",
        platformUserId: candidate.rawGeekId ? `${candidate.rawGeekId}-0` : candidate.id,
        diagnostics: {
          buttonTextBefore,
          buttonTextAfter: "自定义消息已发送",
          startRequestSeen: false,
          checkJobOpenSeen: false,
          executionMode: "computer-user+playwright-mcp",
          plannerAction: plan.action,
          plannerReasoning: plan.reasoning,
        },
      };
    }

    const startResponse = await startResponsePromise;
    const buttonTextAfter = (await greetButton.textContent())?.trim() || "";

    if (!startResponse && buttonTextAfter.includes("继续沟通")) {
      return {
        success: true,
        platformUserId: candidate.rawGeekId ? `${candidate.rawGeekId}-0` : candidate.id,
        actualMessage: "Boss默认打招呼",
        deliveryMode: "boss_default_greet",
        diagnostics: {
          buttonTextBefore,
          buttonTextAfter,
          startRequestSeen: false,
          checkJobOpenSeen: false,
          executionMode: "computer-user+playwright-mcp",
          plannerAction: plan.action,
          plannerReasoning: plan.reasoning,
        },
      };
    }

    if (!startResponse) {
      return {
        success: false,
        error: "未捕获到 Boss 打招呼返回结果",
        diagnostics: {
          buttonTextBefore,
          buttonTextAfter,
          startRequestSeen: false,
          checkJobOpenSeen: false,
          executionMode: "computer-user+playwright-mcp",
          plannerAction: plan.action,
          plannerReasoning: plan.reasoning,
        },
      };
    }

    try {
      const payload = await startResponse.json();
      if (payload?.code !== 0) {
        return {
          success: false,
          error: payload?.message || "Boss 打招呼失败",
        };
      }

      return {
        success: true,
        platformUserId:
          payload?.zpData?.geekId != null ? `${payload.zpData.geekId}-0` : candidate.id,
        actualMessage: payload?.zpData?.greeting || "Boss默认打招呼",
        deliveryMode: "boss_default_greet",
        diagnostics: {
          buttonTextBefore,
          buttonTextAfter,
          startRequestSeen: true,
          checkJobOpenSeen: false,
          executionMode: "computer-user+playwright-mcp",
          plannerAction: plan.action,
          plannerReasoning: plan.reasoning,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "解析 Boss 打招呼结果失败",
      };
    }
  }

  async getChatSessions(): Promise<BossChatSession[]> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    await this.gotoChatPage();
    const sessions = await this.page.locator(BOSS_SELECTORS.chatItem).evaluateAll((elements: Element[]) => {
      return elements.map((root) => {
        const text = (root.textContent || "")
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean);
        let cursor = 0;
        let unreadCount = 0;

        if (text[cursor] && /^\d+$/.test(text[cursor])) {
          unreadCount = Number.parseInt(text[cursor], 10);
          cursor += 1;
        }

        return {
          candidateId: root.getAttribute("data-id") || "",
          candidateName: text[cursor + 1] || "",
          lastMessage: text.slice(cursor + 3).join(" ") || text[cursor + 2] || "",
          lastMessageTime: text[cursor] || "",
          unreadCount,
          hasNewMessage: unreadCount > 0,
        };
      });
    });

    return sessions.filter((session: BossChatSession) => session.candidateId);
  }

  async getChatHistory(candidateId: string) {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    await this.gotoChatPage();
    const session = this.page.locator(`${BOSS_SELECTORS.chatItem}[data-id="${candidateId}"]`).first();
    if (await session.count().then((count: number) => count === 0)) {
      return [];
    }

    await session.click();
    await randomSleep(600, 1200);

    const history = await this.page.locator(BOSS_SELECTORS.chatMessageItem).evaluateAll((elements: Element[]) => {
      return elements.map((element, index) => {
        const text = (element.querySelector(".text")?.textContent || element.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        const isSelf = element.classList.contains("item-myself");
        const rawTime = element.querySelector(".time")?.textContent?.trim() || "";
        const type = element.querySelector("img")
          ? "image"
          : /微信|vx|电话|手机号|邮箱/i.test(text)
            ? "contact"
            : /简历/.test(text)
              ? "resume"
              : "text";

        return {
          id: `${candidateId}-${index}`,
          content: text,
          sender: isSelf ? "hr" : "candidate",
          time: new Date().toISOString(),
          rawTime,
          type,
        };
      });
    });

    return history
      .filter((item: { content: string }) => item.content)
      .map((item: { id: string; content: string; sender: "hr" | "candidate"; time: string; rawTime?: string; type: "text" | "image" | "resume" | "contact" }) => ({
        ...item,
        time: new Date(item.time),
      }));
  }

  async replyMessage(candidateId: string, message: string): Promise<{ success: boolean; error?: string }> {
    if (!this.page) {
      throw new Error("页面未初始化");
    }

    await this.gotoChatPage();
    const session = this.page.locator(`${BOSS_SELECTORS.chatItem}[data-id="${candidateId}"]`).first();
    if (await session.count().then((count: number) => count === 0)) {
      return { success: false, error: "未找到对应聊天会话" };
    }

    const plan = await planBossComputerUserAction({
      goal: "在 Boss 聊天页发送回复消息",
      pageState: "chat_list",
      observation: candidateId,
    });

    await session.click();
    await randomSleep(600, 1200);
    const editor = this.page.locator(BOSS_SELECTORS.chatEditor).first();
    if (await editor.count().then((count: number) => count === 0)) {
      return { success: false, error: "未找到聊天输入框" };
    }

    await editor.fill("");
    await editor.type(message, { delay: randomInt(50, 120) });
    await randomSleep(300, 700);
    await this.page.locator(BOSS_SELECTORS.chatSendButton).first().click();
    await randomSleep(800, 1500);
    console.log("[playwright-mcp] reply planner:", plan);

    return { success: true };
  }

  async checkLogin(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    await this.page.goto(BOSS_URLS.main, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_BROWSER_CONFIG.defaultTimeout,
    });
    await sleep(1500);
    return this.page.locator(BOSS_SELECTORS.userInfo).first().count().then((count: number) => count > 0);
  }

  async screenshot(): Promise<Uint8Array | null> {
    if (!this.page) {
      return null;
    }
    const buffer = await this.page.screenshot({ fullPage: false });
    return new Uint8Array(buffer);
  }

  private async fetchJson<T = any>(url: string): Promise<T | null> {
    if (!this.page) {
      return null;
    }

    return this.page.evaluate(async (requestUrl: string) => {
      try {
        const response = await fetch(requestUrl, {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });
        return await response.json();
      } catch {
        return null;
      }
    }, url);
  }

  private async resolveRecommendJob(jobHint?: BossJobHint): Promise<{ encryptJobId: string; jobName: string; city?: string; salaryDesc?: string } | null> {
    const result = await this.fetchJson<any>(
      `https://www.zhipin.com/wapi/zpjob/job/data/list?position=0&type=0&searchStr=&comId=&tagIdStr=&page=1&_=${Date.now()}`
    );
    const data = result?.zpData?.data;
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const ranked = data
      .map((item: any) => ({
        encryptJobId: String(item.encryptJobId || item.encryptId || ""),
        jobName: String(item.jobName || item.positionName || ""),
        city: item.city || item.locationName || undefined,
        salaryDesc: item.salaryDesc || undefined,
        score: scoreBossJob(item, jobHint),
      }))
      .sort((left: any, right: any) => right.score - left.score);

    return ranked[0] || null;
  }

  private async resolveCandidateLocator(candidate: BossCandidate): Promise<any | null> {
    if (!this.page) {
      return null;
    }

    if (candidate.cardKey) {
      const keyLocator = this.page.locator(`${BOSS_SELECTORS.recommendCardInner}[data-geek="${candidate.cardKey}"]`).first();
      if (await keyLocator.count().then((count: number) => count > 0)) {
        return keyLocator;
      }
    }

    const cards = this.page.locator(BOSS_SELECTORS.recommendCard);
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      const text = ((await card.textContent()) || "").replace(/\s+/g, " ").trim();
      if (text.includes(candidate.name) && (!candidate.title || text.includes(candidate.title))) {
        return card;
      }
    }

    return null;
  }
}
