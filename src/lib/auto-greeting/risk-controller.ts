/**
 * 风控系统 - 监控和管理自动打招呼过程中的风险
 * 
 * 核心功能：
 * - 风险指标计算
 * - 风险等级评估
 * - 风控动作决策
 * - 敏感词过滤
 * - 账号健康度监控
 */

import type {
  RiskMetrics,
  RiskLevel,
  RiskAction,
  HealthStatus,
  JobPosition,
  CandidateCommunication,
  Message,
} from './types';
import { RISK_THRESHOLDS, SENSITIVE_WORDS_PLATFORM, SENSITIVE_WORDS_PRIVACY } from './constants';

/**
 * 计算风险指标
 */
export function calculateRiskMetrics(
  communications: CandidateCommunication[],
  messages: Message[],
  recentFailures: number
): RiskMetrics {
  const totalGreeted = communications.length;
  const totalReplied = communications.filter(c => 
    c.status !== '待打招呼' && c.status !== '已打招呼'
  ).length;
  
  // 发送成功率
  const sendSuccessRate = totalGreeted > 0 
    ? ((totalGreeted - recentFailures) / totalGreeted) * 100 
    : 100;
  
  // 回复率
  const replyRate = totalGreeted > 0 
    ? (totalReplied / totalGreeted) * 100 
    : 0;
  
  // 回复率趋势（简化：用最近10条判断）
  const recentComms = communications.slice(-10);
  const recentReplyRate = recentComms.length > 0
    ? (recentComms.filter(c => c.status !== '待打招呼' && c.status !== '已打招呼').length / recentComms.length) * 100
    : 0;
  
  let replyRateTrend: 'up' | 'stable' | 'down' = 'stable';
  if (recentReplyRate > replyRate + 5) {
    replyRateTrend = 'up';
  } else if (recentReplyRate < replyRate - 5) {
    replyRateTrend = 'down';
  }
  
  // 已读不回比例（简化计算）
  const readNoReplyCount = communications.filter(c => 
    c.status === '已打招呼' && c.lastHrMessageTime
  ).length;
  const readNoReplyRate = totalGreeted > 0 
    ? (readNoReplyCount / totalGreeted) * 100 
    : 0;
  
  // 平均响应时间
  const responseTimes = communications
    .filter(c => c.firstGreetingTime && c.lastCandidateMessageTime)
    .map(c => {
      const first = new Date(c.firstGreetingTime!).getTime();
      const last = new Date(c.lastCandidateMessageTime!).getTime();
      return (last - first) / (1000 * 60); // 转换为分钟
    });
  
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;
  
  // 异常行为分数（基于多个因素）
  let abnormalBehaviorScore = 0;
  if (sendSuccessRate < 90) abnormalBehaviorScore += 20;
  if (replyRate < 20) abnormalBehaviorScore += 15;
  if (readNoReplyRate > 50) abnormalBehaviorScore += 15;
  if (recentFailures > 3) abnormalBehaviorScore += 25;
  
  return {
    sendSuccessRate,
    sendFailureCount: recentFailures,
    replyRate,
    replyRateTrend,
    readNoReplyRate,
    avgResponseTime,
    abnormalBehaviorScore,
    platformWarningCount: 0, // 需要从外部获取
    userReportCount: 0, // 需要从外部获取
  };
}

/**
 * 评估风险等级
 */
export function assessRiskLevel(metrics: RiskMetrics): RiskLevel {
  const { sendSuccessRate, replyRate, readNoReplyRate, sendFailureCount, abnormalBehaviorScore } = metrics;
  
  // 紧急：连续失败超过阈值或异常分数过高
  if (sendFailureCount >= RISK_THRESHOLDS.consecutiveFailuresCritical || 
      abnormalBehaviorScore >= 80) {
    return 'emergency';
  }
  
  // 危险：关键指标严重异常
  if (sendSuccessRate < RISK_THRESHOLDS.sendSuccessRateCritical ||
      replyRate < RISK_THRESHOLDS.replyRateCritical ||
      readNoReplyRate > RISK_THRESHOLDS.readNoReplyCritical) {
    return 'critical';
  }
  
  // 警告：指标接近异常
  if (sendSuccessRate < RISK_THRESHOLDS.sendSuccessRateWarning ||
      replyRate < RISK_THRESHOLDS.replyRateWarning ||
      readNoReplyRate > RISK_THRESHOLDS.readNoReplyWarning ||
      sendFailureCount >= RISK_THRESHOLDS.consecutiveFailuresWarning) {
    return 'warning';
  }
  
  return 'normal';
}

/**
 * 决定风控动作
 */
export function decideRiskAction(level: RiskLevel, metrics: RiskMetrics): RiskAction {
  switch (level) {
    case 'emergency':
      return {
        level: 'emergency',
        action: 'stop',
        reason: '检测到严重异常，需要立即停止所有自动化操作',
        suggestions: [
          '检查账号是否被限制',
          '检查网络连接是否正常',
          '联系平台客服了解情况',
          '暂停至少24小时后再尝试',
        ],
      };
      
    case 'critical':
      return {
        level: 'critical',
        action: 'pause',
        reason: '关键风险指标异常，建议暂停操作',
        suggestions: [
          '检查打招呼频率是否过高',
          '检查话术内容是否合规',
          '降低自动化程度',
          '人工介入处理',
        ],
      };
      
    case 'warning':
      return {
        level: 'warning',
        action: 'slowdown',
        reason: '部分指标接近异常阈值，建议降速运行',
        suggestions: [
          '增加打招呼间隔时间',
          '优化话术内容',
          '检查目标候选人匹配度',
        ],
        slowdownFactor: 2, // 降速2倍
      };
      
    default:
      return {
        level: 'normal',
        action: 'continue',
        reason: '风险指标正常，可以继续运行',
        suggestions: [],
      };
  }
}

/**
 * 检测敏感词
 */
export function detectSensitiveWords(content: string): {
  found: boolean;
  words: string[];
  type: 'platform' | 'privacy' | 'none';
} {
  const foundPlatformWords: string[] = [];
  const foundPrivacyWords: string[] = [];
  
  // 检测平台违规词
  for (const word of SENSITIVE_WORDS_PLATFORM) {
    if (content.includes(word)) {
      foundPlatformWords.push(word);
    }
  }
  
  // 检测隐私敏感词
  for (const word of SENSITIVE_WORDS_PRIVACY) {
    if (content.includes(word)) {
      foundPrivacyWords.push(word);
    }
  }
  
  if (foundPrivacyWords.length > 0) {
    return {
      found: true,
      words: foundPrivacyWords,
      type: 'privacy',
    };
  }
  
  if (foundPlatformWords.length > 0) {
    return {
      found: true,
      words: foundPlatformWords,
      type: 'platform',
    };
  }
  
  return {
    found: false,
    words: [],
    type: 'none',
  };
}

/**
 * 过滤敏感词
 */
export function filterSensitiveWords(content: string): string {
  let filtered = content;
  
  // 过滤平台违规词
  for (const word of SENSITIVE_WORDS_PLATFORM) {
    filtered = filtered.replace(new RegExp(word, 'g'), '*'.repeat(word.length));
  }
  
  // 过滤隐私敏感词
  for (const word of SENSITIVE_WORDS_PRIVACY) {
    filtered = filtered.replace(new RegExp(word, 'g'), '*'.repeat(word.length));
  }
  
  return filtered;
}

/**
 * 计算账号健康度
 */
export function calculateHealthStatus(metrics: RiskMetrics): HealthStatus {
  const { sendSuccessRate, replyRate, abnormalBehaviorScore, platformWarningCount, userReportCount } = metrics;
  
  // 危险：有平台警告或被举报
  if (platformWarningCount > 0 || userReportCount > 0) {
    return 'dangerous';
  }
  
  // 不健康：多个指标异常
  if (sendSuccessRate < 80 || replyRate < 10 || abnormalBehaviorScore > 60) {
    return 'unhealthy';
  }
  
  // 亚健康：部分指标不佳
  if (sendSuccessRate < 90 || replyRate < 20 || abnormalBehaviorScore > 30) {
    return 'subhealthy';
  }
  
  return 'healthy';
}

/**
 * 检查是否应该暂停操作
 */
export function shouldPause(
  consecutiveFailures: number,
  hourlyCount: number,
  maxHourlyCount: number
): { shouldPause: boolean; reason: string } {
  // 连续失败
  if (consecutiveFailures >= RISK_THRESHOLDS.consecutiveFailuresCritical) {
    return {
      shouldPause: true,
      reason: `连续失败${consecutiveFailures}次，超过阈值${RISK_THRESHOLDS.consecutiveFailuresCritical}`,
    };
  }
  
  // 超过小时限制
  if (hourlyCount >= maxHourlyCount) {
    return {
      shouldPause: true,
      reason: `本小时已打招呼${hourlyCount}次，达到限制${maxHourlyCount}`,
    };
  }
  
  return { shouldPause: false, reason: '' };
}

/**
 * 计算延迟时间（模拟真人行为）
 */
export function calculateDelay(
  baseDelay: number,
  humanSimulation: {
    minDelaySeconds: number;
    maxDelaySeconds: number;
    nightMinDelaySeconds?: number;
    nightMaxDelaySeconds?: number;
    nightStartTime?: string;
    nightEndTime?: string;
  }
): number {
  const now = new Date();
  const currentHour = now.getHours();
  
  // 解析夜间时间
  const nightStartHour = parseInt(humanSimulation.nightStartTime?.split(':')[0] || '22');
  const nightEndHour = parseInt(humanSimulation.nightEndTime?.split(':')[0] || '8');
  
  // 判断是否在夜间
  const isNight = currentHour >= nightStartHour || currentHour < nightEndHour;
  
  let minDelay: number;
  let maxDelay: number;
  
  if (isNight && humanSimulation.nightMinDelaySeconds && humanSimulation.nightMaxDelaySeconds) {
    minDelay = humanSimulation.nightMinDelaySeconds * 1000;
    maxDelay = humanSimulation.nightMaxDelaySeconds * 1000;
  } else {
    minDelay = humanSimulation.minDelaySeconds * 1000;
    maxDelay = humanSimulation.maxDelaySeconds * 1000;
  }
  
  // 添加随机性
  const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
  
  // 添加抖动（±10%）
  const jitter = randomDelay * 0.1 * (Math.random() * 2 - 1);
  
  return Math.floor(randomDelay + jitter);
}

/**
 * 检查是否在允许的时间窗口内
 */
export function isInAllowedTimeWindow(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  
  // 周末放宽限制
  const isWeekend = day === 0 || day === 6;
  
  // 工作日：9:00 - 21:00
  // 周末：10:00 - 20:00
  if (isWeekend) {
    return hour >= 10 && hour < 20;
  }
  
  return hour >= 9 && hour < 21;
}

/**
 * 获取下一次执行时间
 */
export function getNextExecutionTime(
  humanSimulation: {
    batchPauseCount: number;
    batchPauseSeconds: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
  },
  currentCount: number
): Date {
  // 检查是否需要批次暂停
  if (currentCount > 0 && currentCount % humanSimulation.batchPauseCount === 0) {
    const pauseDelay = humanSimulation.batchPauseSeconds * 1000;
    return new Date(Date.now() + pauseDelay);
  }
  
  // 正常延迟
  const delay = calculateDelay(0, humanSimulation);
  return new Date(Date.now() + delay);
}

/**
 * 生成风控报告
 */
export function generateRiskReport(
  metrics: RiskMetrics,
  level: RiskLevel,
  action: RiskAction
): string {
  const lines = [
    '=== 风控报告 ===',
    `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
    '【风险指标】',
    `- 发送成功率: ${metrics.sendSuccessRate.toFixed(1)}%`,
    `- 回复率: ${metrics.replyRate.toFixed(1)}% (${metrics.replyRateTrend === 'up' ? '↑' : metrics.replyRateTrend === 'down' ? '↓' : '→'})`,
    `- 已读不回率: ${metrics.readNoReplyRate.toFixed(1)}%`,
    `- 连续失败次数: ${metrics.sendFailureCount}`,
    `- 异常行为分数: ${metrics.abnormalBehaviorScore}/100`,
    '',
    '【风险评估】',
    `- 风险等级: ${level.toUpperCase()}`,
    `- 建议动作: ${action.action}`,
    `- 原因: ${action.reason}`,
    '',
  ];
  
  if (action.suggestions.length > 0) {
    lines.push('【建议措施】');
    action.suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. ${s}`);
    });
  }
  
  return lines.join('\n');
}
