/**
 * 登录态管理模块
 * 
 * 管理平台账号的登录状态、Cookie 存储、登录检测等
 */

import { Page, Cookie } from 'puppeteer';
import { getClient } from 'coze-coding-dev-sdk';
import { BrowserManager, sleep, randomInt } from './browser-manager';
import type { Platform } from './types';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

/**
 * 平台账号配置
 */
export interface PlatformAccount {
  id: string;
  platform: Platform;
  accountId: string;           // 平台账号ID
  nickname?: string;           // 平台昵称
  cookies: Cookie[];           // 登录 Cookies
  userAgent: string;           // User-Agent
  lastLoginTime?: Date;        // 最后登录时间
  lastActiveTime?: Date;       // 最后活跃时间
  loginStatus: 'valid' | 'expired' | 'unknown';  // 登录状态
  status: 'active' | 'paused' | 'banned';        // 账号状态
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 登录检测结果
 */
export interface LoginCheckResult {
  isLoggedIn: boolean;
  accountInfo?: {
    nickname?: string;
    avatar?: string;
    userId?: string;
  };
  error?: string;
}

/**
 * 平台 URL 配置
 */
const PLATFORM_URLS: Record<Platform, { main: string; login: string; chat: string }> = {
  boss: {
    main: 'https://www.zhipin.com',
    login: 'https://www.zhipin.com/web/user/?ka=header-login',
    chat: 'https://www.zhipin.com/web/chat/index',
  },
  zhilian: {
    main: 'https://www.zhaopin.com',
    login: 'https://passport.zhaopin.com/login',
    chat: 'https://www.zhaopin.com/chat',
  },
  liepin: {
    main: 'https://www.liepin.com',
    login: 'https://passport.liepin.com/cas/login',
    chat: 'https://www.liepin.com/im',
  },
  '51job': {
    main: 'https://www.51job.com',
    login: 'https://login.51job.com/login.php',
    chat: 'https://www.51job.com/chat',
  },
};

/**
 * 平台登录检测选择器
 */
const LOGIN_CHECK_SELECTORS: Record<Platform, {
  loggedIn: string[];
  notLoggedIn: string[];
  nickname?: string;
}> = {
  boss: {
    loggedIn: ['.nav-figure', '.user-nav', '.nav-job-manage'],
    notLoggedIn: ['a[href*="login"]', '.login-btn', '.btn-login'],
    nickname: '.nav-figure .name, .user-nav .name',
  },
  zhilian: {
    loggedIn: ['.user-info', '.userName'],
    notLoggedIn: ['a[href*="login"]', '.login-btn'],
    nickname: '.userName, .user-info .name',
  },
  liepin: {
    loggedIn: ['.user-info', '.user-name'],
    notLoggedIn: ['a[href*="login"]', '.login-btn'],
    nickname: '.user-name',
  },
  '51job': {
    loggedIn: ['.user-info', '.myinfo'],
    notLoggedIn: ['a[href*="login"]', '.login-btn'],
    nickname: '.user-name',
  },
};

export function getPlatformLoginSelectors(platform: Platform) {
  return LOGIN_CHECK_SELECTORS[platform];
}

export async function getPlatformLoginSnapshot(
  page: Page,
  platform: Platform
): Promise<{
  loggedIn: boolean;
  loggedInSelector?: string;
  notLoggedInSelector?: string;
  nickname?: string;
  currentUrl: string;
  title: string;
}> {
  const selectors = LOGIN_CHECK_SELECTORS[platform];

  return page.evaluate((currentSelectors) => {
    const loggedInSelector =
      currentSelectors.loggedIn.find((selector) => document.querySelector(selector)) || undefined;
    const notLoggedInSelector =
      currentSelectors.notLoggedIn.find((selector) => document.querySelector(selector)) || undefined;
    const nicknameSelector = currentSelectors.nickname || '';
    const nickname = nicknameSelector
      ? document.querySelector(nicknameSelector)?.textContent?.trim() || ''
      : '';

    const strongLoggedIn = Boolean(loggedInSelector) && !notLoggedInSelector && nickname.length > 0;

    return {
      loggedIn: strongLoggedIn,
      loggedInSelector,
      notLoggedInSelector,
      nickname,
      currentUrl: window.location.href,
      title: document.title,
    };
  }, selectors);
}

/**
 * 登录态管理器
 */
export class LoginManager {
  /**
   * 保存账号到数据库
   */
  async saveAccount(account: Omit<PlatformAccount, 'id' | 'createdAt' | 'updatedAt'> & {
    createdById?: string;
    tenantId?: string;
  }): Promise<string> {
    await ensureAutoGreetingRuntimeTables();
    const client = await getClient();
    
    const result = await client.query(`
      INSERT INTO ag_platform_accounts (
        platform, account_id, nickname, cookies, user_agent,
        last_login_time, last_active_time, login_status, status, created_by_id, tenant_id,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id
    `, [
      account.platform,
      account.accountId,
      account.nickname || null,
      JSON.stringify(account.cookies),
      account.userAgent,
      account.lastLoginTime || null,
      account.lastActiveTime || null,
      account.loginStatus,
      account.status,
      account.createdById || null,
      account.tenantId || null,
    ]);

    client.release();
    return result.rows[0]?.id;
  }

  /**
   * 更新账号 Cookies
   */
  async updateCookies(accountId: string, cookies: Cookie[]): Promise<void> {
    await ensureAutoGreetingRuntimeTables();
    const client = await getClient();
    
    await client.query(`
      UPDATE ag_platform_accounts 
      SET cookies = $1, login_status = 'valid', last_active_time = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(cookies), accountId]);

    client.release();
  }

  /**
   * 获取账号
   */
  async getAccount(accountId: string): Promise<PlatformAccount | null> {
    await ensureAutoGreetingRuntimeTables();
    const client = await getClient();
    
    const result = await client.query(`
      SELECT * FROM ag_platform_accounts WHERE id = $1
    `, [accountId]);

    client.release();

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.rowToAccount(row);
  }

  /**
   * 获取平台所有活跃账号
   */
  async getActiveAccounts(platform: Platform): Promise<PlatformAccount[]> {
    await ensureAutoGreetingRuntimeTables();
    const client = await getClient();
    
    const result = await client.query(`
      SELECT * FROM ag_platform_accounts 
      WHERE platform = $1 AND status = 'active' AND login_status = 'valid'
      ORDER BY last_active_time DESC
    `, [platform]);

    client.release();

    return result.rows.map(row => this.rowToAccount(row));
  }

  /**
   * 检测登录状态
   */
  async checkLoginStatus(platform: Platform, cookies: Cookie[]): Promise<LoginCheckResult> {
    await ensureAutoGreetingRuntimeTables();
    const browserManager = BrowserManager.getInstance();
    const page = await browserManager.createPage(`check-${Date.now()}`, cookies);

    try {
      const urls = PLATFORM_URLS[platform];
      await page.goto(urls.main, { waitUntil: 'networkidle2', timeout: 30000 });

      // 等待页面加载
      await sleep(2000);

      const snapshot = await getPlatformLoginSnapshot(page, platform);
      if (snapshot.loggedIn) {
        await page.close();
        return {
          isLoggedIn: true,
          accountInfo: { nickname: snapshot.nickname },
        };
      }

      if (snapshot.notLoggedInSelector) {
        await page.close();
        return {
          isLoggedIn: false,
          error: '未登录或登录已过期',
        };
      }

      await page.close();
      return {
        isLoggedIn: false,
        error: '无法确定登录状态',
      };

    } catch (error) {
      await page.close();
      return {
        isLoggedIn: false,
        error: error instanceof Error ? error.message : '检测登录状态失败',
      };
    }
  }

  /**
   * 刷新登录状态
   */
  async refreshLoginStatus(accountId: string): Promise<LoginCheckResult> {
    await ensureAutoGreetingRuntimeTables();
    const account = await this.getAccount(accountId);
    if (!account) {
      return { isLoggedIn: false, error: '账号不存在' };
    }

    const result = await this.checkLoginStatus(account.platform, account.cookies);

    // 更新数据库
    const client = await getClient();
    await client.query(`
      UPDATE ag_platform_accounts 
      SET login_status = $1, updated_at = NOW()
      WHERE id = $2
    `, [result.isLoggedIn ? 'valid' : 'expired', accountId]);
    client.release();

    return result;
  }

  /**
   * 创建登录页面（用于用户扫码登录）
   */
  async createLoginPage(
    platform: Platform,
    browserManager: BrowserManager = BrowserManager.getInstance()
  ): Promise<{ page: Page; loginUrl: string }> {
    const page = await browserManager.createPage(`login-${Date.now()}`);

    const urls = PLATFORM_URLS[platform];
    await page.goto(urls.login, { waitUntil: 'networkidle2' });

    return { page, loginUrl: urls.login };
  }

  /**
   * 等待登录完成并获取 Cookies
   */
  async waitForLogin(platform: Platform, page: Page, timeout: number = 120000): Promise<Cookie[] | null> {
    const selectors = LOGIN_CHECK_SELECTORS[platform];
    const urls = PLATFORM_URLS[platform];

    try {
      // 等待登录成功的标志元素
      await page.waitForSelector(selectors.loggedIn.join(','), { timeout });
      
      // 导航到主页确保登录成功
      await page.goto(urls.main, { waitUntil: 'networkidle2' });
      await sleep(2000);

      // 获取所有 cookies
      const cookies = await page.cookies();

      // 过滤出有用的 cookies
      const usefulCookies = cookies.filter(c => 
        !c.name.startsWith('_') && 
        c.value && 
        c.value.length > 5
      );

      return usefulCookies;
    } catch (error) {
      console.error('等待登录超时:', error);
      return null;
    }
  }

  /**
   * 行数据转换为账号对象
   */
  private rowToAccount(row: any): PlatformAccount {
    return {
      id: row.id,
      platform: row.platform,
      accountId: row.account_id,
      nickname: row.nickname,
      cookies: typeof row.cookies === 'string' ? JSON.parse(row.cookies) : row.cookies,
      userAgent: row.user_agent,
      lastLoginTime: row.last_login_time,
      lastActiveTime: row.last_active_time,
      loginStatus: row.login_status,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * 导出单例
 */
export const loginManager = new LoginManager();
