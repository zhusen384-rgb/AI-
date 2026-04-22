/**
 * 对话引擎 - 管理对话状态和策略决策
 * 
 * 核心职责：
 * - 对话状态管理
 * - 阶段转换决策
 * - 策略动作生成
 * - 消息模板渲染
 */

import type {
  ConversationStage,
  ConversationState,
  StrategyResult,
  StrategyAction,
  JobPosition,
  CandidateCommunication,
  Message,
  Platform,
  IntentLevel,
} from './types';
import { HOOK_TEMPLATES, PLATFORM_STYLES } from './constants';

/**
 * 初始化对话状态
 */
export function initConversationState(): ConversationState {
  return {
    stage: 'ice_breaking',
    roundCount: 0,
    candidateResponseCount: 0,
    interestLevel: 'unknown',
    painPoints: [],
    matchedHighlights: [],
    stageHistory: [
      {
        stage: 'ice_breaking',
        enteredAt: new Date(),
      },
    ],
  };
}

/**
 * 更新对话状态
 */
export function updateConversationState(
  state: ConversationState,
  candidateMessage: string,
  aiAnalysis: {
    intent?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    interestLevel?: IntentLevel | 'high' | 'medium' | 'low' | 'unknown';
    keywords?: string[];
  }
): ConversationState {
  const newState = { ...state };
  
  // 更新对话轮数
  newState.roundCount += 1;
  newState.candidateResponseCount += 1;
  newState.lastCandidateMessage = candidateMessage;
  
  // 更新兴趣程度
  if (aiAnalysis.interestLevel) {
    // 如果已经是 high/medium/low/unknown，直接使用
    if (['high', 'medium', 'low', 'unknown'].includes(aiAnalysis.interestLevel)) {
      newState.interestLevel = aiAnalysis.interestLevel as 'high' | 'medium' | 'low' | 'unknown';
    } else {
      // IntentLevel (A/B/C/D) 转换
      const levelMap: Record<IntentLevel, 'high' | 'medium' | 'low'> = {
        'A': 'high',
        'B': 'medium',
        'C': 'low',
        'D': 'low',
      };
      newState.interestLevel = levelMap[aiAnalysis.interestLevel as IntentLevel] || 'unknown';
    }
  }
  
  // 提取痛点/需求
  if (aiAnalysis.keywords && aiAnalysis.keywords.length > 0) {
    newState.painPoints = [...new Set([...state.painPoints, ...aiAnalysis.keywords])];
  }
  
  // 根据情感调整兴趣程度
  if (aiAnalysis.sentiment === 'positive') {
    if (newState.interestLevel === 'unknown') {
      newState.interestLevel = 'medium';
    }
  } else if (aiAnalysis.sentiment === 'negative') {
    newState.interestLevel = 'low';
  }
  
  // 阶段转换
  const newStage = determineStageTransition(newState);
  if (newStage !== state.stage) {
    // 记录阶段历史
    newState.stageHistory = [
      ...state.stageHistory.map(h => 
        h.stage === state.stage ? { ...h, exitedAt: new Date() } : h
      ),
      { stage: newStage, enteredAt: new Date() },
    ];
    newState.stage = newStage;
  }
  
  return newState;
}

/**
 * 决定阶段转换
 */
function determineStageTransition(state: ConversationState): ConversationStage {
  const { stage, roundCount, candidateResponseCount, interestLevel } = state;
  
  // 阶段转换规则
  switch (stage) {
    case 'ice_breaking':
      // 破冰阶段：候选人回复后进入建立兴趣
      if (candidateResponseCount >= 1) {
        return 'interest_building';
      }
      break;
      
    case 'interest_building':
      // 建立兴趣阶段：兴趣高或对话3轮以上进入筛选
      if (interestLevel === 'high' || roundCount >= 3) {
        return 'screening';
      }
      // 兴趣低则保持
      if (interestLevel === 'low') {
        return 'interest_building';
      }
      break;
      
    case 'screening':
      // 筛选阶段：高意向进入转化
      if (interestLevel === 'high' && roundCount >= 2) {
        return 'conversion';
      }
      break;
      
    case 'conversion':
      // 转化阶段：保持
      break;
  }
  
  return stage;
}

/**
 * 生成策略决策
 */
export function generateStrategy(
  state: ConversationState,
  job: JobPosition,
  platform: Platform
): StrategyResult {
  const { stage, interestLevel, roundCount, lastCandidateMessage } = state;
  const platformStyle = PLATFORM_STYLES[platform];
  
  let nextAction: StrategyAction;
  let message: string | undefined;
  let reasoning: string;
  let suggestedDelay = getRandomDelay(platform, stage);
  
  // 根据阶段和状态决策
  switch (stage) {
    case 'ice_breaking':
      // 破冰阶段：发送首次打招呼
      nextAction = 'reply';
      message = generateIceBreakingMessage(job, platform);
      reasoning = '首次打招呼，建立联系';
      break;
      
    case 'interest_building':
      // 建立兴趣阶段
      if (interestLevel === 'high') {
        nextAction = 'reply';
        message = generateInterestMessage(job, platform, state);
        reasoning = '候选人兴趣高，继续沟通建立兴趣';
      } else if (interestLevel === 'low') {
        nextAction = 'reply';
        message = generateReEngageMessage(job, platform);
        reasoning = '候选人兴趣低，尝试重新激发兴趣';
        suggestedDelay = suggestedDelay * 2; // 延长回复时间
      } else {
        nextAction = 'reply';
        message = generateInterestMessage(job, platform, state);
        reasoning = '继续建立兴趣';
      }
      break;
      
    case 'screening':
      // 筛选阶段
      if (interestLevel === 'high' && roundCount >= 3) {
        nextAction = 'request_contact';
        message = generateContactRequestMessage(job, platform);
        reasoning = '候选人意向高，请求联系方式';
      } else {
        nextAction = 'reply';
        message = generateScreeningMessage(job, platform, state);
        reasoning = '继续筛选，了解候选人情况';
      }
      break;
      
    case 'conversion':
      // 转化阶段
      if (interestLevel === 'high') {
        nextAction = 'schedule_interview';
        message = generateInterviewScheduleMessage(job, platform);
        reasoning = '候选人意向很高，安排面试';
      } else {
        nextAction = 'request_contact';
        message = generateContactRequestMessage(job, platform);
        reasoning = '进入转化阶段，请求联系方式';
      }
      break;
      
    default:
      nextAction = 'wait';
      reasoning = '等待候选人回复';
  }
  
  // 检查是否需要人工介入
  if (shouldEscalate(state)) {
    nextAction = 'escalate';
    reasoning = '检测到需要人工介入的情况';
    message = undefined;
  }
  
  return {
    stage,
    nextAction,
    message,
    reasoning,
    suggestedDelay,
  };
}

/**
 * 生成破冰消息
 */
function generateIceBreakingMessage(job: JobPosition, platform: Platform): string {
  const hooks = [
    ...HOOK_TEMPLATES.scarcity,
    ...HOOK_TEMPLATES.relevance,
    ...HOOK_TEMPLATES.curiosity,
  ];
  
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  
  // 替换变量
  let message = hook
    .replace('{经历}', '工作经历')
    .replace('{技能}', job.requirements.skills?.[0] || '技术')
    .replace('{相关项目}', job.name)
    .replace('{方向}', job.department || job.name);
  
  // 添加岗位信息
  const platformStyle = PLATFORM_STYLES[platform];
  if (message.length < platformStyle.maxLength - 30) {
    message += ` 我们正在招聘${job.name}，有兴趣聊聊吗？`;
  }
  
  return truncateMessage(message, platformStyle.maxLength);
}

/**
 * 生成建立兴趣消息
 */
function generateInterestMessage(
  job: JobPosition,
  platform: Platform,
  state: ConversationState
): string {
  const platformStyle = PLATFORM_STYLES[platform];
  
  // 根据候选人痛点生成
  const painPoint = state.painPoints[0];
  if (painPoint) {
    const message = `关于你提到的${painPoint}，我们这边${job.highlights?.[0] || '有不错的福利'}，可以详细聊聊`;
    return truncateMessage(message, platformStyle.maxLength);
  }
  
  // 使用亮点钩子
  const highlight = job.highlights?.[0];
  if (highlight) {
    return truncateMessage(`我们这边${highlight}，你觉得怎么样？`, platformStyle.maxLength);
  }
  
  return truncateMessage(`这个岗位主要负责${job.name}相关工作，你觉得怎么样？`, platformStyle.maxLength);
}

/**
 * 生成重新激活消息
 */
function generateReEngageMessage(job: JobPosition, platform: Platform): string {
  const platformStyle = PLATFORM_STYLES[platform];
  
  const messages = [
    `这个岗位还在招，如果你有兴趣可以随时联系我`,
    `我们最近扩大了hc，如果你还在看机会可以聊聊`,
    `薪资范围可以聊，如果你有兴趣的话`,
  ];
  
  return truncateMessage(messages[Math.floor(Math.random() * messages.length)], platformStyle.maxLength);
}

/**
 * 生成筛选消息
 */
function generateScreeningMessage(
  job: JobPosition,
  platform: Platform,
  state: ConversationState
): string {
  const platformStyle = PLATFORM_STYLES[platform];
  
  // 询问期望薪资
  if (state.roundCount <= 3) {
    return truncateMessage('你期望的薪资范围大概是多少？我们这边可以沟通', platformStyle.maxLength);
  }
  
  // 询问到岗时间
  return truncateMessage('如果你这边没问题的话，大概什么时候能到岗？', platformStyle.maxLength);
}

/**
 * 生成联系方式请求消息
 */
function generateContactRequestMessage(job: JobPosition, platform: Platform): string {
  const platformStyle = PLATFORM_STYLES[platform];
  
  const messages = [
    '方便加个微信详聊吗？我的微信：[微信号码]',
    '可以留个电话吗？我安排同事和你对接',
    '方便发个简历到我邮箱吗？[邮箱地址]',
  ];
  
  return truncateMessage(messages[Math.floor(Math.random() * messages.length)], platformStyle.maxLength);
}

/**
 * 生成面试安排消息
 */
function generateInterviewScheduleMessage(job: JobPosition, platform: Platform): string {
  const platformStyle = PLATFORM_STYLES[platform];
  
  return truncateMessage(
    '太好了！我这边安排一下面试，你最近什么时候方便？',
    platformStyle.maxLength
  );
}

/**
 * 判断是否需要人工介入
 */
function shouldEscalate(state: ConversationState): boolean {
  // 连续无效沟通
  if (state.roundCount > 10 && state.candidateResponseCount < 3) {
    return true;
  }
  
  // 候选人明确表达需要人工
  if (state.lastCandidateMessage?.includes('人工') || 
      state.lastCandidateMessage?.includes('电话') ||
      state.lastCandidateMessage?.includes('面试官')) {
    return true;
  }
  
  return false;
}

/**
 * 获取随机延迟时间（模拟真人）
 */
function getRandomDelay(platform: Platform, stage: ConversationStage): number {
  const baseDelay = {
    ice_breaking: { min: 5000, max: 15000 },    // 5-15秒
    interest_building: { min: 10000, max: 30000 }, // 10-30秒
    screening: { min: 15000, max: 45000 },      // 15-45秒
    conversion: { min: 20000, max: 60000 },     // 20-60秒
  };
  
  const range = baseDelay[stage] || baseDelay.ice_breaking;
  return Math.floor(Math.random() * (range.max - range.min) + range.min);
}

/**
 * 截断消息
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength - 3) + '...';
}

/**
 * 渲染消息模板
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}

/**
 * 检查是否应该发送二次打招呼
 */
export function shouldSendSecondGreeting(
  communication: CandidateCommunication,
  job: JobPosition
): boolean {
  if (!job.secondGreetingEnabled) {
    return false;
  }
  
  if (communication.secondGreetingSent) {
    return false;
  }
  
  // 检查是否在沉默期（候选人已读不回）
  if (communication.status === '已打招呼' && communication.lastHrMessageTime) {
    const lastMessageTime = new Date(communication.lastHrMessageTime);
    const now = new Date();
    const hoursSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastMessage >= job.secondGreetingDelayHours;
  }
  
  return false;
}
