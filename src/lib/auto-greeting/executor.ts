/**
 * 自动化执行器 - 核心执行引擎
 * 
 * 职责：
 * - 管理执行队列
 * - 处理打招呼任务
 * - 处理自动回复
 * - 调用匹配引擎和对话引擎
 * - 与风控系统集成
 */

import type {
  JobPosition,
  CandidateCommunication,
  Message,
  Platform,
  ConversationState,
  OperationType,
} from './types';
import { matchCandidate, getGreetingTimeSlots } from './matching-engine';
import {
  initConversationState,
  updateConversationState,
  generateStrategy,
  shouldSendSecondGreeting,
  renderTemplate,
} from './conversation-engine';
import {
  analyzeCandidateMessage,
  generateReply,
  generateGreetingMessage,
} from './llm-integration';
import {
  calculateRiskMetrics,
  assessRiskLevel,
  decideRiskAction,
  shouldPause,
  calculateDelay,
  isInAllowedTimeWindow,
  getNextExecutionTime,
} from './risk-controller';

/**
 * 执行器配置
 */
export interface ExecutorConfig {
  maxConcurrency: number;          // 最大并发数
  batchPauseCount: number;         // 批次暂停数量
  batchPauseSeconds: number;       // 批次暂停秒数
  maxHourlyGreetings: number;      // 每小时最大打招呼数
}

const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxConcurrency: 5,
  batchPauseCount: 10,
  batchPauseSeconds: 60,
  maxHourlyGreetings: 50,
};

/**
 * 执行器状态
 */
export interface ExecutorState {
  isRunning: boolean;
  currentBatch: number;
  hourlyCount: number;
  lastHourReset: Date;
  consecutiveFailures: number;
  lastExecutionTime: Date | null;
  pausedUntil: Date | null;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  action: OperationType;
  communicationId?: string;
  messageId?: string;
  error?: string;
  delay?: number;
}

/**
 * 自动化执行器类
 */
export class AutoGreetingExecutor {
  private config: ExecutorConfig;
  private state: ExecutorState;
  private job: JobPosition | null = null;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.state = {
      isRunning: false,
      currentBatch: 0,
      hourlyCount: 0,
      lastHourReset: new Date(),
      consecutiveFailures: 0,
      lastExecutionTime: null,
      pausedUntil: null,
    };
  }

  /**
   * 设置当前岗位
   */
  setJob(job: JobPosition): void {
    this.job = job;
  }

  /**
   * 检查是否可以执行
   */
  canExecute(): { canExecute: boolean; reason: string } {
    // 检查是否在暂停期
    if (this.state.pausedUntil && new Date() < this.state.pausedUntil) {
      return {
        canExecute: false,
        reason: `暂停中，直到 ${this.state.pausedUntil.toLocaleTimeString()}`,
      };
    }

    // 检查是否在允许的时间窗口
    if (!isInAllowedTimeWindow()) {
      return {
        canExecute: false,
        reason: '不在允许的时间窗口内',
      };
    }

    // 检查小时限制
    this.resetHourlyCountIfNeeded();
    if (this.state.hourlyCount >= this.config.maxHourlyGreetings) {
      return {
        canExecute: false,
        reason: `本小时已达到限制 ${this.config.maxHourlyGreetings}`,
      };
    }

    // 检查连续失败
    const pauseCheck = shouldPause(
      this.state.consecutiveFailures,
      this.state.hourlyCount,
      this.config.maxHourlyGreetings
    );
    if (pauseCheck.shouldPause) {
      return {
        canExecute: false,
        reason: pauseCheck.reason,
      };
    }

    return { canExecute: true, reason: '' };
  }

  /**
   * 执行打招呼任务
   */
  async executeGreeting(
    candidate: {
      name?: string;
      skills?: string[];
      experience?: number;
      currentCompany?: string;
      location?: string;
      expectedSalary?: { min: number; max: number } | string;
      intentLevel?: string;
    },
    platform: Platform
  ): Promise<ExecutionResult> {
    if (!this.job) {
      return {
        success: false,
        action: 'greeting_first',
        error: '未设置岗位',
      };
    }

    const checkResult = this.canExecute();
    if (!checkResult.canExecute) {
      return {
        success: false,
        action: 'greeting_first',
        error: checkResult.reason,
      };
    }

    try {
      // 1. 匹配度计算
      const matchResult = matchCandidate(candidate as any, this.job);
      
      if (!matchResult.matched) {
        return {
          success: false,
          action: 'greeting_first',
          error: '匹配度不足',
        };
      }

      // 2. 生成打招呼消息
      const greetingMessage = await generateGreetingMessage({
        job: this.job,
        candidateName: candidate.name,
        candidateSkills: candidate.skills,
        platform,
      });

      // 3. 计算延迟
      const delay = calculateDelay(0, this.job.humanSimulation);

      // 4. 更新状态
      this.state.currentBatch++;
      this.state.hourlyCount++;
      this.state.lastExecutionTime = new Date();

      // 5. 重置连续失败计数
      this.state.consecutiveFailures = 0;

      // 6. 检查批次暂停
      if (this.state.currentBatch % this.config.batchPauseCount === 0) {
        this.state.pausedUntil = new Date(
          Date.now() + this.config.batchPauseSeconds * 1000
        );
      }

      return {
        success: true,
        action: 'greeting_first',
        // 实际应用中这里会返回数据库生成的ID
        communicationId: `comm-${Date.now()}`,
        messageId: `msg-${Date.now()}`,
        delay,
      };
    } catch (error) {
      this.state.consecutiveFailures++;
      return {
        success: false,
        action: 'greeting_first',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 执行自动回复
   */
  async executeReply(
    communication: CandidateCommunication,
    candidateMessage: string,
    conversationHistory: Message[]
  ): Promise<ExecutionResult> {
    if (!this.job) {
      return {
        success: false,
        action: 'reply_auto',
        error: '未设置岗位',
      };
    }

    try {
      // 1. 分析候选人消息
      const analysis = await analyzeCandidateMessage(candidateMessage, {
        job: this.job,
        conversationHistory,
        platform: communication.platform,
      });

      // 2. 更新对话状态
      const currentState: ConversationState = communication as any;
      const newState = updateConversationState(currentState, candidateMessage, {
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        interestLevel: analysis.intentLevel === 'A' ? 'high' : 
                       analysis.intentLevel === 'B' ? 'medium' : 
                       analysis.intentLevel === 'C' ? 'low' : 'unknown',
        keywords: analysis.keywords,
      });

      // 3. 生成策略
      const strategy = generateStrategy(newState, this.job, communication.platform);

      // 4. 根据策略决定动作
      if (strategy.nextAction === 'escalate') {
        return {
          success: true,
          action: 'manual_intervene',
          communicationId: communication.id,
          error: '需要人工介入',
        };
      }

      if (strategy.nextAction === 'wait') {
        return {
          success: true,
          action: 'reply_auto',
          communicationId: communication.id,
          delay: strategy.suggestedDelay,
        };
      }

      // 5. 生成回复
      const replyMessage = await generateReply({
        job: this.job,
        candidateMessage,
        conversationHistory,
        platform: communication.platform,
        stage: newState.stage,
      });

      // 6. 计算延迟
      const delay = strategy.suggestedDelay || calculateDelay(0, this.job.humanSimulation);

      return {
        success: true,
        action: strategy.nextAction === 'request_contact' ? 'contact_requested' : 'reply_auto',
        communicationId: communication.id,
        messageId: `msg-${Date.now()}`,
        delay,
      };
    } catch (error) {
      return {
        success: false,
        action: 'reply_auto',
        communicationId: communication.id,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 执行二次打招呼
   */
  async executeSecondGreeting(
    communication: CandidateCommunication
  ): Promise<ExecutionResult> {
    if (!this.job) {
      return {
        success: false,
        action: 'greeting_second',
        error: '未设置岗位',
      };
    }

    // 检查是否应该发送二次打招呼
    if (!shouldSendSecondGreeting(communication, this.job)) {
      return {
        success: false,
        action: 'greeting_second',
        error: '不满足二次打招呼条件',
      };
    }

    const checkResult = this.canExecute();
    if (!checkResult.canExecute) {
      return {
        success: false,
        action: 'greeting_second',
        error: checkResult.reason,
      };
    }

    try {
      // 生成二次打招呼消息
      const secondGreetingMessage = await generateGreetingMessage({
        job: this.job,
        candidateName: communication.name,
        platform: communication.platform,
      });

      const delay = calculateDelay(0, this.job.humanSimulation);

      return {
        success: true,
        action: 'greeting_second',
        communicationId: communication.id,
        messageId: `msg-${Date.now()}`,
        delay,
      };
    } catch (error) {
      return {
        success: false,
        action: 'greeting_second',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 批量处理候选人
   */
  async processBatch(
    candidates: Array<{
      profile: any;
      platform: Platform;
    }>
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (const { profile, platform } of candidates) {
      const checkResult = this.canExecute();
      if (!checkResult.canExecute) {
        results.push({
          success: false,
          action: 'greeting_first',
          error: checkResult.reason,
        });
        break;
      }

      const result = await this.executeGreeting(profile, platform);
      results.push(result);

      // 添加延迟
      if (result.success && result.delay) {
        await this.sleep(result.delay);
      }
    }

    return results;
  }

  /**
   * 获取执行器状态
   */
  getState(): ExecutorState {
    return { ...this.state };
  }

  /**
   * 获取下一个执行时间
   */
  getNextExecutionTime(): Date {
    return getNextExecutionTime(
      this.job?.humanSimulation || {
        batchPauseCount: this.config.batchPauseCount,
        batchPauseSeconds: this.config.batchPauseSeconds,
        minDelaySeconds: 8,
        maxDelaySeconds: 25,
      },
      this.state.currentBatch
    );
  }

  /**
   * 重置小时计数
   */
  private resetHourlyCountIfNeeded(): void {
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.state.lastHourReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 1) {
      this.state.hourlyCount = 0;
      this.state.lastHourReset = now;
    }
  }

  /**
   * 暂停执行
   */
  pause(durationSeconds: number): void {
    this.state.pausedUntil = new Date(Date.now() + durationSeconds * 1000);
  }

  /**
   * 恢复执行
   */
  resume(): void {
    this.state.pausedUntil = null;
  }

  /**
   * 重置执行器
   */
  reset(): void {
    this.state = {
      isRunning: false,
      currentBatch: 0,
      hourlyCount: 0,
      lastHourReset: new Date(),
      consecutiveFailures: 0,
      lastExecutionTime: null,
      pausedUntil: null,
    };
  }

  /**
   * 工具函数：休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建执行器实例
 */
export function createExecutor(config?: Partial<ExecutorConfig>): AutoGreetingExecutor {
  return new AutoGreetingExecutor(config);
}

/**
 * 获取平台最佳打招呼时段
 */
export function getOptimalGreetingSlots(platform: Platform): Array<{
  start: string;
  end: string;
  priority: number;
}> {
  return getGreetingTimeSlots(platform);
}

/**
 * 计算执行优先级
 */
export function calculatePriority(
  communication: CandidateCommunication
): number {
  let priority = 100;

  // 意向等级影响
  const intentPriority: Record<string, number> = {
    A: 50,
    B: 30,
    C: 10,
    D: -20,
  };
  priority += intentPriority[communication.intentLevel || ''] || 0;

  // 状态影响
  if (communication.status === '待打招呼') {
    priority += 20;
  } else if (communication.status === '沟通中') {
    priority += 40;
  }

  // 匹配度影响
  priority += Math.floor((communication.matchScore || 0) / 5);

  return Math.max(0, Math.min(200, priority));
}
