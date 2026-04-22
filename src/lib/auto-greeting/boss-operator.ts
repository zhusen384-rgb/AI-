/**
 * BOSS 直聘平台操作模块
 *
 * 新版 Boss Web 端链路：
 * - 推荐牛人页：/web/chat/recommend
 * - 推荐页实际内容：/web/frame/recommend/
 * - 沟通页：/web/chat/index
 *
 * 自动化流程：
 * 1. 通过岗位列表接口找到 Boss 上对应岗位
 * 2. 进入推荐牛人页并选中该岗位
 * 3. 点击候选人卡片查看简历信息
 * 4. 判断匹配后点击“打招呼”
 * 5. 在沟通页同步消息并自动回复
 */

import { ElementHandle, Frame, Page } from 'puppeteer';
import {
  BrowserManager,
  humanClick,
  humanType,
  randomInt,
  randomSleep,
  sleep,
} from './browser-manager';
import { loginManager, PlatformAccount } from './login-manager';

export interface BossJobHint {
  name?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
}

export interface BossCandidate {
  id: string;
  name: string;
  avatar?: string;
  title?: string;
  company?: string;
  education?: string;
  experience?: string;
  age?: number;
  location?: string;
  salary?: string;
  skills?: string[];
  activeTime?: string;
  geoInfo?: string;
  advantage?: string;
  matchScore?: number;
  cardUrl?: string;
  hasGreeted?: boolean;
  hasReplied?: boolean;
  cardKey?: string;
  rawGeekId?: string;
  encryptGeekId?: string;
  securityId?: string;
  expectedPosition?: string;
  expectedCity?: string;
  resumePreview?: string;
  cardText?: string;
  workHistory?: Array<{
    companyName: string;
    position?: string;
    duration?: string;
  }>;
}

export interface BossMessage {
  id: string;
  content: string;
  sender: 'hr' | 'candidate';
  time: Date;
  rawTime?: string;
  type: 'text' | 'image' | 'resume' | 'contact';
}

export interface BossChatSession {
  candidateId: string;
  candidateName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  hasNewMessage: boolean;
}

interface BossJobRecord {
  encryptJobId: string;
  jobName: string;
  city?: string;
  salaryDesc?: string;
  positionName?: string;
  locationName?: string;
  jobStatus?: number;
}

interface BossGreetingResult {
  success: boolean;
  error?: string;
  platformUserId?: string;
  actualMessage?: string;
  deliveryMode?: 'boss_default_greet' | 'custom_message';
  diagnostics?: {
    buttonTextBefore?: string;
    buttonTextAfter?: string;
    startRequestSeen?: boolean;
    checkJobOpenSeen?: boolean;
  };
}

interface BossResumeDetail {
  advantage?: string;
  skills?: string[];
  title?: string;
  location?: string;
  salary?: string;
  company?: string;
  education?: string;
  experience?: string;
  workHistory?: Array<{
    companyName: string;
    position?: string;
    duration?: string;
  }>;
}

const BOSS_URLS = {
  main: 'https://www.zhipin.com',
  recommend: 'https://www.zhipin.com/web/chat/recommend',
  recommendFrame: 'https://www.zhipin.com/web/frame/recommend/',
  chat: 'https://www.zhipin.com/web/chat/index',
};

const BOSS_SELECTORS = {
  recommendCard: '.candidate-card-wrap',
  recommendCardInner: '.candidate-card-wrap .card-inner[data-geek]',
  recommendGreetButton: '.btn.btn-greet',
  recommendResumeDialog: '.dialog-wrap.active, .dialog-lib-resume.recommendV2',
  recommendResumeGreetButton: '.dialog-wrap.active .btn-v2.btn-sure-v2.btn-greet, .dialog-wrap.active .button-chat-wrap.resumeGreet .btn-v2.btn-sure-v2.btn-greet',
  recommendFrame: 'iframe[src*="/web/frame/recommend/"]',
  chatItem: '.geek-item',
  chatEditor: '#boss-chat-editor-input',
  chatSendButton: '.submit, .submit-content',
  chatMessageItem: '.item-friend, .item-myself',
  chatSystemMessage: '.message-item',
  userInfo: '.nav-figure, .user-nav',
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？；：,.!?;:（）()\[\]{}'"']/g, '');
}

function splitLocationAndPosition(value?: string): { location?: string; position?: string } {
  if (!value) {
    return {};
  }

  const tokens = value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return {};
  }

  return {
    location: tokens[0],
    position: tokens.slice(1).join(' ') || undefined,
  };
}

function parseResumeDetail(raw: any): BossResumeDetail {
  const data = raw?.zpData || raw || {};
  const detail = data.geekDetailInfo || {};
  const geekCard = data.geekCard || detail.geekBaseInfo || data;
  const geekWorks = Array.isArray(detail.geekWorkExpList)
    ? detail.geekWorkExpList
    : Array.isArray(geekCard.geekWorks || data.geekWorks)
      ? (geekCard.geekWorks || data.geekWorks)
      : [];
  const geekEdus = Array.isArray(detail.geekEduExpList)
    ? detail.geekEduExpList
    : Array.isArray(geekCard.geekEdus || data.geekEdus)
      ? (geekCard.geekEdus || data.geekEdus)
      : [];
  const geekProjects = Array.isArray(detail.geekProjExpList) ? detail.geekProjExpList : [];
  const primaryEdu = geekCard.geekEdu || data.geekEdu || geekEdus[0];
  const expected = Array.isArray(detail.geekExpPosList) ? detail.geekExpPosList[0] : undefined;
  const skillEntries = Array.isArray(geekCard.matches || data.matches)
    ? (geekCard.matches || data.matches)
    : Array.isArray(detail.professionalSkill)
      ? detail.professionalSkill
      : [];
  const summaryParts = [
    geekCard.geekDesc?.content,
    data.geekDesc?.content,
    detail.geekBaseInfo?.userDescription,
    geekProjects
      .map((item: any) => [item.name, item.roleName, item.performance, item.projectDescription]
        .filter(Boolean)
        .join(' '))
      .filter(Boolean)
      .join(' | '),
  ].filter(Boolean);

  return {
    advantage: summaryParts.join(' | ') || undefined,
    skills: skillEntries.length > 0 ? skillEntries.map((item: unknown) => String(item)) : undefined,
    title:
      expected?.positionName ||
      geekCard.expectPositionName ||
      data.expectPositionName ||
      undefined,
    location:
      expected?.locationName ||
      geekCard.expectLocationName ||
      data.expectLocationName ||
      undefined,
    salary: geekCard.salary || data.salary || undefined,
    company: geekWorks[0]?.company || detail.geekBaseInfo?.company || undefined,
    education:
      primaryEdu?.degreeName ||
      geekCard.geekDegree ||
      detail.geekBaseInfo?.degreeCategory ||
      data.geekDegree ||
      undefined,
    experience:
      geekCard.geekWorkYear ||
      detail.geekBaseInfo?.workYearsDesc ||
      detail.geekBaseInfo?.workYearDesc ||
      data.geekWorkYear ||
      undefined,
    workHistory: geekWorks.map((item: any) => ({
      companyName: String(item.company || item.companyName || ''),
      position: item.positionName || item.positionTitle || undefined,
      duration: item.startDate || item.endDate
        ? `${item.startDate || ''}${item.endDate ? `-${item.endDate}` : ''}`
        : undefined,
    })),
  };
}

function parseJobListResponse(result: any): BossJobRecord[] {
  const data = result?.zpData?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    encryptJobId: String(item.encryptJobId || item.encryptId || ''),
    jobName: String(item.jobName || item.positionName || ''),
    city: item.city || item.locationName || undefined,
    salaryDesc: item.salaryDesc || undefined,
    positionName: item.positionName || undefined,
    locationName: item.locationName || item.city || undefined,
    jobStatus: typeof item.jobStatus === 'number' ? item.jobStatus : undefined,
  }));
}

function scoreCandidateMerge(pageCandidate: BossCandidate, apiCandidate: BossCandidate): number {
  let score = 0;

  if (pageCandidate.name && apiCandidate.name && pageCandidate.name === apiCandidate.name) {
    score += 100;
  }

  if (pageCandidate.salary && apiCandidate.salary && pageCandidate.salary === apiCandidate.salary) {
    score += 30;
  }

  const pageTitle = normalizeText(pageCandidate.expectedPosition || pageCandidate.title || '');
  const apiTitle = normalizeText(apiCandidate.expectedPosition || apiCandidate.title || '');
  if (pageTitle && apiTitle && (pageTitle === apiTitle || pageTitle.includes(apiTitle) || apiTitle.includes(pageTitle))) {
    score += 25;
  }

  const pageLocation = normalizeText(pageCandidate.expectedCity || pageCandidate.location || '');
  const apiLocation = normalizeText(apiCandidate.expectedCity || apiCandidate.location || '');
  if (pageLocation && apiLocation && (pageLocation === apiLocation || pageLocation.includes(apiLocation) || apiLocation.includes(pageLocation))) {
    score += 20;
  }

  if (pageCandidate.education && apiCandidate.education && pageCandidate.education === apiCandidate.education) {
    score += 10;
  }

  return score;
}

function scoreBossJob(job: BossJobRecord, hint?: BossJobHint): number {
  if (!hint?.name) {
    return 0;
  }

  const targetName = normalizeText(hint.name);
  const jobName = normalizeText(job.jobName || job.positionName || '');
  const targetLocation = normalizeText(hint.location || '');
  const jobLocation = normalizeText(job.city || job.locationName || '');

  let score = 0;

  if (jobName === targetName) {
    score += 120;
  } else if (jobName.includes(targetName) || targetName.includes(jobName)) {
    score += 80;
  } else {
    const targetTokens = targetName.split(/[-_]/).filter(Boolean);
    if (targetTokens.some((token) => token && jobName.includes(token))) {
      score += 40;
    }
  }

  if (targetLocation && jobLocation) {
    if (jobLocation.includes(targetLocation) || targetLocation.includes(jobLocation)) {
      score += 30;
    }
  }

  if (job.jobStatus === 0) {
    score += 10;
  }

  return score;
}

export class BossOperator {
  private page: Page | null = null;
  private account: PlatformAccount | null = null;
  private browserManager: BrowserManager;
  private currentRecommendJob: BossJobRecord | null = null;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
  }

  async init(accountId: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.account = await loginManager.getAccount(accountId);
      if (!this.account) {
        return { success: false, error: '账号不存在' };
      }

      if (this.account.status !== 'active') {
        return { success: false, error: '账号未激活或已暂停' };
      }

      if (this.account.loginStatus !== 'valid') {
        const checkResult = await loginManager.checkLoginStatus('boss', this.account.cookies);
        if (!checkResult.isLoggedIn) {
          return { success: false, error: '登录已过期，请重新登录' };
        }
      }

      this.page = await this.browserManager.createPage(accountId, this.account.cookies);
      if (this.account.userAgent) {
        await this.page.setUserAgent(this.account.userAgent);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      };
    }
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }

  async gotoRecommendPage(jobHint?: BossJobHint): Promise<void> {
    if (!this.page) throw new Error('页面未初始化');

    const matchedJob = await this.resolveRecommendJob(jobHint);
    if (!matchedJob) {
      throw new Error('未找到 Boss 上对应的招聘岗位');
    }

    this.currentRecommendJob = matchedJob;
    await this.page.goto(BOSS_URLS.recommend, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await this.page.waitForSelector(BOSS_SELECTORS.recommendFrame, { timeout: 10000 });
    const frame = await this.getRecommendFrame();
    if (!frame) {
      throw new Error('未找到推荐牛人内容区');
    }

    const recommendUrl = `${BOSS_URLS.recommendFrame}?jobid=${matchedJob.encryptJobId}&status=0&filterParams=&t=&inspectFilterGuide=&version=9594&source=0`;
    await frame.goto(recommendUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await this.selectRecommendJob(frame, matchedJob);
    await frame.waitForSelector(BOSS_SELECTORS.recommendCard, { timeout: 10000 });
    await randomSleep(800, 1500);
  }

  async gotoChatPage(): Promise<void> {
    if (!this.page) throw new Error('页面未初始化');

    await this.page.goto(BOSS_URLS.chat, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await this.page.waitForSelector(BOSS_SELECTORS.chatItem, { timeout: 10000 });
    await randomSleep(800, 1500);
  }

  async getRecommendCandidates(jobHint?: BossJobHint): Promise<BossCandidate[]> {
    if (!this.page) throw new Error('页面未初始化');

    await this.gotoRecommendPage(jobHint);
    if (!this.currentRecommendJob) {
      return [];
    }

    const apiCandidates = await this.fetchRecommendCandidatesFromAPI(this.currentRecommendJob.encryptJobId);
    const pageCandidates = await this.parseRecommendCandidatesFromPage();

    if (apiCandidates.length === 0) {
      return pageCandidates;
    }

    const remainingApiCandidates = [...apiCandidates];
    return pageCandidates.map((candidate) => {
      let matchedIndex = -1;
      let bestScore = -1;

      remainingApiCandidates.forEach((apiCandidate, index) => {
        const score = scoreCandidateMerge(candidate, apiCandidate);
        if (score > bestScore) {
          bestScore = score;
          matchedIndex = index;
        }
      });

      if (matchedIndex === -1) {
        return candidate;
      }

      const [apiCandidate] = remainingApiCandidates.splice(matchedIndex, 1);
      if (!apiCandidate) {
        return candidate;
      }

      return {
        ...candidate,
        ...apiCandidate,
        cardKey: candidate.cardKey,
        cardText: candidate.cardText,
        hasGreeted: candidate.hasGreeted,
      };
    });
  }

  async inspectCandidateResume(candidate: BossCandidate): Promise<BossCandidate> {
    if (!this.page) throw new Error('页面未初始化');

    const card = await this.findRecommendCardRoot(candidate);
    if (!card) {
      return candidate;
    }

    const detailResponsePromise = this.page
      .waitForResponse(
        (response) => response.url().includes('/wapi/zpjob/view/geek/info') && response.status() === 200,
        { timeout: 8000 }
      )
      .catch(() => null);

    const box = await card.boundingBox();
    if (box) {
      await this.page.mouse.move(box.x + Math.min(120, box.width / 2), box.y + Math.min(120, box.height / 2), {
        steps: 12,
      });
      await this.page.mouse.click(box.x + Math.min(120, box.width / 2), box.y + Math.min(120, box.height / 2));
    } else {
      await card.click();
    }

    await randomSleep(800, 1500);

    const cardSnapshot = await this.parseRecommendCandidateCard(card);
    const frame = await this.getRecommendFrame();
    if (frame) {
      await frame.waitForSelector(BOSS_SELECTORS.recommendResumeDialog, { timeout: 5000 }).catch(() => null);
    }
    const detailResponse = await detailResponsePromise;
    if (!detailResponse) {
      return {
        ...candidate,
        ...cardSnapshot,
      };
    }

    try {
      const text = await detailResponse.text();
      const detail = parseResumeDetail(JSON.parse(text));
      return {
        ...candidate,
        ...cardSnapshot,
        ...detail,
        workHistory: detail.workHistory?.length ? detail.workHistory : cardSnapshot.workHistory,
      };
    } catch {
      return {
        ...candidate,
        ...cardSnapshot,
      };
    }
  }

  async sendGreeting(
    candidate: BossCandidate,
    message: string,
    jobHint?: BossJobHint
  ): Promise<BossGreetingResult> {
    if (!this.page) throw new Error('页面未初始化');

    if (!this.currentRecommendJob) {
      await this.gotoRecommendPage(jobHint);
    }

    const card = await this.findRecommendCardRoot(candidate);
    if (!card) {
      return { success: false, error: '未找到候选人卡片' };
    }

    const frame = await this.getRecommendFrame();
    const dialogGreetButton = frame
      ? await frame.$(BOSS_SELECTORS.recommendResumeGreetButton)
      : null;
    const greetButton = dialogGreetButton || await card.$(BOSS_SELECTORS.recommendGreetButton);
    if (!greetButton) {
      return { success: false, error: '候选人已打过招呼或按钮不可用' };
    }

    const buttonText = await greetButton.evaluate((element) => element.textContent?.trim() || '');
    if (!buttonText.includes('打招呼')) {
      return { success: false, error: '当前候选人已进入继续沟通状态' };
    }

    let startRequestSeen = false;
    let checkJobOpenSeen = false;
    const startResponsePromise = this.page
      .waitForResponse((response) => {
        if (response.url().includes('/wapi/zpboss/h5/geek/detail/checkJobOpen')) {
          checkJobOpenSeen = true;
        }
        if (response.url().includes('/wapi/zpjob/chat/start') && response.status() === 200) {
          startRequestSeen = true;
          return true;
        }
        return false;
      }, { timeout: 10000 })
      .catch(() => null);

    const box = await greetButton.boundingBox();
    if (dialogGreetButton && frame) {
      await frame.evaluate((selector) => {
        const button = document.querySelector<HTMLButtonElement>(selector);
        button?.click();
      }, BOSS_SELECTORS.recommendResumeGreetButton);
    } else if (box) {
      await this.page.mouse.move(box.x + box.width / 2 + randomInt(-4, 4), box.y + box.height / 2 + randomInt(-4, 4), {
        steps: 12,
      });
      await randomSleep(120, 260);
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await greetButton.click();
    }

    await randomSleep(1000, 1800);

    const editor = await this.page.$(BOSS_SELECTORS.chatEditor);
    if (editor) {
      await editor.evaluate((element) => {
        element.textContent = '';
      });
      await humanType(this.page, BOSS_SELECTORS.chatEditor, message, {
        minDelay: 60,
        maxDelay: 150,
      });
      await randomSleep(300, 700);
      await humanClick(this.page, BOSS_SELECTORS.chatSendButton);
      return {
        success: true,
        actualMessage: message,
        deliveryMode: 'custom_message',
        platformUserId:
          candidate.rawGeekId && candidate.rawGeekId !== ''
            ? `${candidate.rawGeekId}-0`
            : candidate.id,
        diagnostics: {
          buttonTextBefore: buttonText,
          buttonTextAfter: '自定义消息已发送',
          startRequestSeen,
          checkJobOpenSeen,
        },
      };
    }

    const startResponse = await startResponsePromise;
    const buttonTextAfter = await greetButton.evaluate((element) => element.textContent?.trim() || '');
    if (!startResponse && buttonTextAfter.includes('继续沟通')) {
      return {
        success: true,
        platformUserId:
          candidate.rawGeekId && candidate.rawGeekId !== ''
            ? `${candidate.rawGeekId}-0`
            : candidate.id,
        actualMessage: 'Boss默认打招呼',
        deliveryMode: 'boss_default_greet',
        diagnostics: {
          buttonTextBefore: buttonText,
          buttonTextAfter,
          startRequestSeen,
          checkJobOpenSeen,
        },
      };
    }

    if (!startResponse) {
      return {
        success: false,
        error: '未捕获到 Boss 打招呼返回结果',
        diagnostics: {
          buttonTextBefore: buttonText,
          buttonTextAfter,
          startRequestSeen,
          checkJobOpenSeen,
        },
      };
    }

    try {
      const rawText = await startResponse.text();
      const payload = JSON.parse(rawText);
      if (payload?.code !== 0) {
        return {
          success: false,
          error: payload?.message || 'Boss 打招呼失败',
        };
      }

      const platformUserId =
        payload?.zpData?.geekId != null
          ? `${payload.zpData.geekId}-0`
          : candidate.rawGeekId
            ? `${candidate.rawGeekId}-0`
            : candidate.id;

      return {
        success: true,
        platformUserId,
        actualMessage: payload?.zpData?.greeting || 'Boss默认打招呼',
        deliveryMode: 'boss_default_greet',
        diagnostics: {
          buttonTextBefore: buttonText,
          buttonTextAfter,
          startRequestSeen,
          checkJobOpenSeen,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '解析 Boss 打招呼结果失败',
      };
    }
  }

  async getChatSessions(): Promise<BossChatSession[]> {
    if (!this.page) throw new Error('页面未初始化');

    await this.gotoChatPage();

    const sessions: BossChatSession[] = [];
    const items = await this.page.$$(BOSS_SELECTORS.chatItem);

    for (const item of items) {
      try {
        const session = await this.parseChatSession(item);
        if (session.candidateId) {
          sessions.push(session);
        }
      } catch (error) {
        console.error('解析聊天会话失败:', error);
      }
    }

    return sessions;
  }

  async getChatHistory(candidateId: string): Promise<BossMessage[]> {
    if (!this.page) throw new Error('页面未初始化');

    try {
      const sessionSelector = `${BOSS_SELECTORS.chatItem}[data-id="${candidateId}"]`;
      await humanClick(this.page, sessionSelector);
      await randomSleep(600, 1200);

      const items = await this.page.$$(BOSS_SELECTORS.chatMessageItem);
      const messages: BossMessage[] = [];

      for (const [index, item] of items.entries()) {
        const content = await item.evaluate((element) => {
          const text = element.querySelector('.text');
          return (text?.textContent || element.textContent || '').replace(/\s+/g, ' ').trim();
        });

        if (!content) {
          continue;
        }

        const isSelf = await item.evaluate((element) => element.classList.contains('item-myself'));
        const time = await item.evaluate((element) => {
          const timeNode = element.querySelector('.time');
          return timeNode?.textContent?.trim() || '';
        });

        const type = await item.evaluate((element) => {
          const text = (element.querySelector('.text')?.textContent || '').trim();
          if (element.querySelector('img')) {
            return 'image';
          }
          if (/微信|vx|电话|手机号|邮箱/i.test(text)) {
            return 'contact';
          }
          if (/简历/.test(text)) {
            return 'resume';
          }
          return 'text';
        });

        messages.push({
          id: `${candidateId}-${index}`,
          content,
          sender: isSelf ? 'hr' : 'candidate',
          time: new Date(),
          rawTime: time,
          type,
        });
      }

      return messages;
    } catch (error) {
      console.error('获取聊天记录失败:', error);
      return [];
    }
  }

  async replyMessage(candidateId: string, message: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.page) throw new Error('页面未初始化');

    try {
      if (!this.page.url().includes('/web/chat/index')) {
        await this.gotoChatPage();
      }

      const sessionSelector = `${BOSS_SELECTORS.chatItem}[data-id="${candidateId}"]`;
      await humanClick(this.page, sessionSelector);
      await randomSleep(600, 1200);

      const editor = await this.page.waitForSelector(BOSS_SELECTORS.chatEditor, { timeout: 8000 });
      if (!editor) {
        return { success: false, error: '未找到聊天输入框' };
      }

      await this.page.$eval(BOSS_SELECTORS.chatEditor, (element) => {
        element.textContent = '';
      });
      await humanType(this.page, BOSS_SELECTORS.chatEditor, message, {
        minDelay: 60,
        maxDelay: 150,
      });
      await randomSleep(300, 700);
      await humanClick(this.page, BOSS_SELECTORS.chatSendButton);
      await randomSleep(800, 1500);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '回复失败',
      };
    }
  }

  async checkLogin(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(BOSS_URLS.main, { waitUntil: 'networkidle2' });
      await sleep(2000);
      const userInfo = await this.page.$(BOSS_SELECTORS.userInfo);
      return userInfo !== null;
    } catch {
      return false;
    }
  }

  async screenshot(): Promise<Uint8Array | null> {
    if (!this.page) return null;
    return await this.page.screenshot({ fullPage: false });
  }

  private async fetchJson<T = any>(url: string): Promise<T | null> {
    if (!this.page) {
      return null;
    }

    return this.page.evaluate(async (requestUrl) => {
      try {
        const response = await fetch(requestUrl, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        });
        return await response.json();
      } catch {
        return null;
      }
    }, url);
  }

  private async fetchBossJobList(): Promise<BossJobRecord[]> {
    if (this.page && !this.page.url().includes('zhipin.com')) {
      await this.page.goto(BOSS_URLS.recommend, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await randomSleep(800, 1500);
    }

    const jobs: BossJobRecord[] = [];

    for (let page = 1; page <= 5; page += 1) {
      const result = await this.fetchJson<any>(
        `https://www.zhipin.com/wapi/zpjob/job/data/list?position=0&type=0&searchStr=&comId=&tagIdStr=&page=${page}&_=${Date.now()}`
      );

      const rows = parseJobListResponse(result);
      jobs.push(...rows);

      if (!result?.zpData?.hasMore) {
        break;
      }
    }

    return jobs;
  }

  private async resolveRecommendJob(jobHint?: BossJobHint): Promise<BossJobRecord | null> {
    if (this.currentRecommendJob && (!jobHint?.name || scoreBossJob(this.currentRecommendJob, jobHint) > 0)) {
      return this.currentRecommendJob;
    }

    const jobs = await this.fetchBossJobList();
    if (jobs.length === 0) {
      return null;
    }

    const ranked = jobs
      .map((job) => ({ job, score: scoreBossJob(job, jobHint) }))
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.job || null;
  }

  private async fetchRecommendCandidatesFromAPI(encryptJobId: string): Promise<BossCandidate[]> {
    const result = await this.fetchJson<any>(
      `https://www.zhipin.com/wapi/zpjob/rec/geek/list?age=16,-1&school=0&activation=0&gender=0&recentNotView=0&exchangeResumeWithColleague=0&major=0&keyword1=-1&switchJobFrequency=0&experience=0&degree=0&intention=0&salary=0&jobId=${encryptJobId}&page=1&coverScreenMemory=0&cardType=0`
    );

    const geekList = result?.zpData?.geekList;
    if (!Array.isArray(geekList)) {
      return [];
    }

    return geekList.map((item: any) => {
      const geekCard = item.geekCard || item;
      const location = geekCard.expectLocationName || item.expectLocationName;
      const title = geekCard.expectPositionName || item.expectPositionName;

      return {
        id:
          geekCard.geekId != null
            ? `${geekCard.geekId}-0`
            : String(geekCard.encryptGeekId || geekCard.securityId || ''),
        rawGeekId: geekCard.geekId != null ? String(geekCard.geekId) : undefined,
        encryptGeekId: geekCard.encryptGeekId || undefined,
        securityId: geekCard.securityId || undefined,
        name: String(geekCard.geekName || item.geekName || ''),
        avatar: geekCard.geekAvatar || item.geekAvatar || undefined,
        title: title || undefined,
        expectedPosition: title || undefined,
        company: Array.isArray(geekCard.geekWorks) ? geekCard.geekWorks[0]?.company : undefined,
        education:
          geekCard.geekEdu?.degreeName ||
          geekCard.geekDegree ||
          item.geekEdu?.degreeName ||
          item.geekDegree ||
          undefined,
        experience: geekCard.geekWorkYear || item.geekWorkYear || undefined,
        location: location || undefined,
        expectedCity: location || undefined,
        salary: geekCard.salary || item.salary || undefined,
        skills: Array.isArray(geekCard.matches || item.matches)
          ? (geekCard.matches || item.matches).map((entry: unknown) => String(entry))
          : undefined,
        activeTime: geekCard.activeDesc || item.activeDesc || undefined,
        advantage: geekCard.geekDesc?.content || item.geekDesc?.content || undefined,
        resumePreview: geekCard.geekDesc?.content || item.geekDesc?.content || undefined,
        workHistory: Array.isArray(geekCard.geekWorks)
          ? geekCard.geekWorks.map((entry: any) => ({
              companyName: String(entry.company || ''),
              position: entry.positionName || entry.positionTitle || undefined,
              duration: entry.startDate || entry.endDate
                ? `${entry.startDate || ''}${entry.endDate ? `-${entry.endDate}` : ''}`
                : undefined,
            }))
          : undefined,
      };
    });
  }

  private async parseRecommendCandidatesFromPage(): Promise<BossCandidate[]> {
    const frame = await this.getRecommendFrame();
    if (!frame) {
      return [];
    }

    const cards = await frame.$$(BOSS_SELECTORS.recommendCard);
    const results: BossCandidate[] = [];

    for (const card of cards) {
      const parsed = await this.parseRecommendCandidateCard(card);
      if (parsed.name) {
        results.push(parsed);
      }
    }

    return results;
  }

  private async parseRecommendCandidateCard(card: ElementHandle<Element>): Promise<BossCandidate> {
    return card.evaluate((root) => {
      const cardInner = root.querySelector<HTMLElement>('.card-inner[data-geek]');
      const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
      const name = root.querySelector<HTMLElement>('.name')?.textContent?.trim() || '';
      const salary = root.querySelector<HTMLElement>('.salary-wrap span')?.textContent?.trim() || undefined;
      const activeTime = root.querySelector<HTMLElement>('.active-text')?.textContent?.trim() || undefined;
      const baseInfo = Array.from(root.querySelectorAll<HTMLElement>('.base-info span'))
        .map((element) => element.textContent?.trim() || '')
        .filter(Boolean);
      const expectText = root.querySelector<HTMLElement>('.expect-wrap .content')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const latestWork = root.querySelector<HTMLElement>('.lately-work')?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
      const labelRows = Array.from(root.querySelectorAll<HTMLElement>('.row.row-flex')).map((element) => ({
        label: element.querySelector<HTMLElement>('.label')?.textContent?.trim() || '',
        content: element.querySelector<HTMLElement>('.content')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      }));

      const advantageRow = labelRows.find((item) => item.label === '优势');
      const timelineTexts = Array.from(root.querySelectorAll<HTMLElement>('.timeline-wrap .content'))
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean);
      const workHistory = latestWork && latestWork !== '无工作经历'
        ? [
            {
              companyName: latestWork,
            },
          ]
        : [];
      const expectTokens = expectText.split(/\s+/).filter(Boolean);

      return {
        id: cardInner?.dataset.geek || name,
        cardKey: cardInner?.dataset.geek || undefined,
        name,
        salary,
        activeTime,
        age: baseInfo[0] ? Number.parseInt(baseInfo[0], 10) || undefined : undefined,
        experience: baseInfo[1] || undefined,
        education: baseInfo[2] || undefined,
        location: expectTokens[0] || undefined,
        expectedCity: expectTokens[0] || undefined,
        title: expectTokens.slice(1).join(' ') || undefined,
        expectedPosition: expectTokens.slice(1).join(' ') || undefined,
        advantage: advantageRow?.content || undefined,
        company: latestWork && latestWork !== '无工作经历' ? latestWork : undefined,
        resumePreview: timelineTexts.join(' | ') || undefined,
        workHistory,
        hasGreeted: !((root.querySelector('.btn.btn-greet')?.textContent || '').includes('打招呼')),
        cardText: text,
      };
    });
  }

  private async findRecommendCardRoot(candidate: BossCandidate): Promise<ElementHandle<Element> | null> {
    const frame = await this.getRecommendFrame();
    if (!frame) {
      return null;
    }

    if (candidate.cardKey) {
      const inner = await frame.$(`${BOSS_SELECTORS.recommendCardInner}[data-geek="${candidate.cardKey}"]`);
      if (inner) {
        return inner.evaluateHandle((element) => element.closest('.candidate-card-wrap') as Element) as Promise<ElementHandle<Element>>;
      }
    }

    const cards = await frame.$$(BOSS_SELECTORS.recommendCard);
    for (const card of cards) {
      const matched = await card.evaluate((root, target) => {
        const name = root.querySelector('.name')?.textContent?.trim() || '';
        const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
        return name === target.name || (target.title ? text.includes(target.title) && name === target.name : name === target.name);
      }, {
        name: candidate.name,
        title: candidate.title || '',
      });

      if (matched) {
        return card;
      }
    }

    return null;
  }

  private async parseChatSession(item: ElementHandle<Element>): Promise<BossChatSession> {
    return item.evaluate((root) => {
      const text = (root.textContent || '').split('\n').map((entry) => entry.trim()).filter(Boolean);
      let cursor = 0;
      let unreadCount = 0;

      if (text[cursor] && /^\d+$/.test(text[cursor])) {
        unreadCount = Number.parseInt(text[cursor], 10);
        cursor += 1;
      }

      const lastMessageTime = text[cursor] || '';
      const candidateName = text[cursor + 1] || '';
      const lastMessage = text.slice(cursor + 3).join(' ') || text[cursor + 2] || '';

      return {
        candidateId: root.getAttribute('data-id') || '',
        candidateName,
        lastMessage,
        lastMessageTime,
        unreadCount,
        hasNewMessage: unreadCount > 0,
      };
    });
  }

  private async getRecommendFrame(): Promise<Frame | null> {
    if (!this.page) {
      return null;
    }

    const directFrame = this.page
      .frames()
      .find((frame) => frame.url().includes('/web/frame/recommend/'));
    if (directFrame) {
      return directFrame;
    }

    const frameHandle = await this.page.$(BOSS_SELECTORS.recommendFrame);
    if (!frameHandle) {
      return null;
    }

    return frameHandle.contentFrame();
  }

  private async selectRecommendJob(frame: Frame, job: BossJobRecord): Promise<void> {
    const currentValue = await frame.evaluate(() => {
      const current = document.querySelector<HTMLElement>('li.job-item.curr');
      return current?.getAttribute('value') || null;
    });

    if (currentValue === job.encryptJobId) {
      return;
    }

    const dropdownLabel = await frame.$('.ui-dropmenu-label');
    if (!dropdownLabel) {
      return;
    }

    await dropdownLabel.evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await randomSleep(200, 500);
    await dropdownLabel.click();
    await randomSleep(400, 800);

    const optionSelector = `li.job-item[value="${job.encryptJobId}"]`;
    const option = await frame.waitForSelector(optionSelector, { timeout: 5000 }).catch(() => null);
    if (!option) {
      return;
    }

    const responsePromise = this.page
      ? this.page
          .waitForResponse(
            (response) =>
              response.url().includes('/wapi/zpjob/rec/geek/list') &&
              response.url().includes(`jobId=${job.encryptJobId}`) &&
              response.status() === 200,
            { timeout: 8000 }
          )
          .catch(() => null)
      : Promise.resolve(null);

    await option.evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await randomSleep(200, 500);
    await option.click();
    await responsePromise;
    await randomSleep(600, 1200);
  }
}

export const createBossOperator = () => new BossOperator();
