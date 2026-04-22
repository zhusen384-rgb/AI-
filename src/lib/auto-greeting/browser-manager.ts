/**
 * 浏览器自动化核心模块
 * 
 * 使用 Puppeteer 控制浏览器进行自动化操作
 */

import puppeteer, { Browser, Page, BrowserContext, Cookie } from 'puppeteer';
import fs from 'fs';

/**
 * 浏览器配置
 */
export interface BrowserConfig {
  headless: boolean;           // 是否无头模式
  slowMo: number;              // 操作减速（毫秒）
  defaultTimeout: number;      // 默认超时时间
  viewport: {
    width: number;
    height: number;
  };
  userAgent: string;
  cookies?: Cookie[];          // 预设 Cookies
  executablePath?: string;
  userDataDir?: string;
  profileDirectory?: string;
  browserWSEndpoint?: string;
  browserURL?: string;
  disableAntiDetection?: boolean;
  interactiveMode?: boolean;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return value === '1' || value.toLowerCase() === 'true';
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function detectChromeExecutablePath(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * 默认浏览器配置
 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: readBooleanEnv('AUTO_GREETING_HEADLESS', true),
  slowMo: readNumberEnv('AUTO_GREETING_SLOW_MO', 50),
  defaultTimeout: readNumberEnv('AUTO_GREETING_DEFAULT_TIMEOUT', 30000),
  viewport: {
    width: readNumberEnv('AUTO_GREETING_VIEWPORT_WIDTH', 1920),
    height: readNumberEnv('AUTO_GREETING_VIEWPORT_HEIGHT', 1080),
  },
  userAgent:
    process.env.AUTO_GREETING_USER_AGENT ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  executablePath: process.env.AUTO_GREETING_CHROME_EXECUTABLE_PATH || detectChromeExecutablePath(),
  userDataDir: process.env.AUTO_GREETING_CHROME_USER_DATA_DIR,
  profileDirectory: process.env.AUTO_GREETING_CHROME_PROFILE_DIR,
  browserWSEndpoint: process.env.AUTO_GREETING_CHROME_WS_ENDPOINT,
  browserURL: process.env.AUTO_GREETING_CHROME_BROWSER_URL,
  disableAntiDetection: false,
  interactiveMode: false,
};

/**
 * 浏览器管理器
 * 单例模式，管理浏览器实例
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private config: BrowserConfig;

  private constructor(config: Partial<BrowserConfig> = {}) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...config };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<BrowserConfig>): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager(config);
    }
    return BrowserManager.instance;
  }

  static createDedicated(config?: Partial<BrowserConfig>): BrowserManager {
    return new BrowserManager(config);
  }

  /**
   * 启动浏览器
   */
  async launch(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (!this.config.interactiveMode && (this.config.browserWSEndpoint || this.config.browserURL)) {
      this.browser = await puppeteer.connect({
        browserWSEndpoint: this.config.browserWSEndpoint,
        browserURL: this.config.browserURL,
        defaultViewport: this.config.viewport,
      });
      return this.browser;
    }

    const launchArgs = [`--window-size=${this.config.viewport.width},${this.config.viewport.height}`];

    if (!this.config.interactiveMode) {
      launchArgs.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      );
    }

    if (this.config.profileDirectory) {
      launchArgs.push(`--profile-directory=${this.config.profileDirectory}`);
    }

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: launchArgs,
      defaultViewport: this.config.viewport,
      ...(this.config.interactiveMode ? {} : { ignoreDefaultArgs: ['--enable-automation'] }),
      executablePath: this.config.executablePath,
      userDataDir: this.config.userDataDir,
      });

    return this.browser;
  }

  private shouldReuseDefaultSession(cookies?: Cookie[]): boolean {
    if (this.config.interactiveMode) {
      return false;
    }

    const hasPersistentBrowser = Boolean(
      this.config.userDataDir || this.config.browserWSEndpoint || this.config.browserURL
    );
    return hasPersistentBrowser && (!cookies || cookies.length === 0);
  }

  /**
   * 创建或获取上下文（用于不同账号）
   */
  async getContext(accountId: string, cookies?: Cookie[]): Promise<BrowserContext> {
    const browser = await this.launch();

    if (this.shouldReuseDefaultSession(cookies)) {
      return browser.defaultBrowserContext();
    }

    // 如果已有上下文，直接返回
    if (this.contexts.has(accountId)) {
      const context = this.contexts.get(accountId)!;
      return context;
    }

    // 创建新的浏览器上下文
    const context = await browser.createBrowserContext();
    this.contexts.set(accountId, context);

    // 如果提供了 cookies，设置它们
    if (cookies && cookies.length > 0) {
      const page = await context.newPage();
      await page.setCookie(...cookies);
      // 不关闭页面，由调用者管理
    }

    return context;
  }

  /**
   * 创建新页面
   */
  async createPage(accountId: string, cookies?: Cookie[]): Promise<Page> {
    let page: Page;
    const browser = await this.launch();

    if (this.config.interactiveMode) {
      const existingPages = await browser.pages();
      for (const existingPage of existingPages) {
        await existingPage.close().catch(() => undefined);
      }
      page = await browser.newPage();
    } else {
      page = this.shouldReuseDefaultSession(cookies)
        ? await browser.newPage()
        : await (await this.getContext(accountId, cookies)).newPage();
    }

    if (!this.config.interactiveMode) {
      // 交互式手动登录尽量保持浏览器默认行为，避免登录页异常渲染。
      await page.setUserAgent(this.config.userAgent);
    }

    // 设置默认超时
    page.setDefaultTimeout(this.config.defaultTimeout);

    // 交互式手动登录时不需要注入反检测脚本，避免干扰登录页。
    if (!this.config.disableAntiDetection) {
      await this.injectAntiDetection(page);
    }

    if (this.config.interactiveMode) {
      await page.bringToFront().catch(() => undefined);
    }

    return page;
  }

  /**
   * 注入反检测脚本
   */
  private async injectAntiDetection(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      // 隐藏 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 模拟真实的 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 模拟真实的 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });

      // 隐藏 Chrome 自动化标志
      // @ts-ignore
      window.chrome = {
        runtime: {},
      };

      // 覆盖 permissions 查询
      const originalQuery = window.navigator.permissions.query;
      // @ts-ignore
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: 'granted' } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
    });
  }

  /**
   * 关闭指定账号的上下文
   */
  async closeContext(accountId: string): Promise<void> {
    const context = this.contexts.get(accountId);
    if (context) {
      await context.close();
      this.contexts.delete(accountId);
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.contexts.clear();
    }
  }

  /**
   * 检查浏览器是否运行中
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

/**
 * 模拟真人输入
 */
export async function humanType(page: Page, selector: string, text: string, options?: {
  minDelay?: number;
  maxDelay?: number;
}): Promise<void> {
  const minDelay = options?.minDelay ?? 30;
  const maxDelay = options?.maxDelay ?? 100;

  await page.focus(selector);
  
  for (const char of text) {
    await page.keyboard.type(char);
    // 随机延迟
    const delay = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);
    await sleep(delay);
  }
}

/**
 * 模拟真人点击
 */
export async function humanClick(page: Page, selector: string, options?: {
  scroll?: boolean;
  moveMouse?: boolean;
}): Promise<void> {
  const element = await page.waitForSelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  // 滚动到元素
  if (options?.scroll !== false) {
    await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(randomInt(100, 300));
  }

  // 移动鼠标
  if (options?.moveMouse !== false) {
    const box = await element.boundingBox();
    if (box) {
      const x = box.x + box.width / 2 + randomInt(-5, 5);
      const y = box.y + box.height / 2 + randomInt(-5, 5);
      await page.mouse.move(x, y, {
        steps: randomInt(5, 10),
      });
      await sleep(randomInt(50, 150));
    }
  }

  await element.click();
  await sleep(randomInt(100, 300));
}

/**
 * 模拟真人等待
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机整数
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机等待（模拟真人行为）
 */
export async function randomSleep(minMs: number, maxMs: number): Promise<void> {
  await sleep(randomInt(minMs, maxMs));
}

/**
 * 导出类型
 */
export type { Cookie };
