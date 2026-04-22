/**
 * 自动化任务执行器
 *
 * 负责：
 * - 基于 Boss 网页端执行自动打招呼
 * - 同步 Boss 聊天消息到本地数据库
 * - 对候选人的新消息执行自动回复
 * - 持久化任务状态，避免只存在于内存中
 */

import { getClient } from "coze-coding-dev-sdk";
import { BossCandidate, BossChatSession, BossOperator } from "./boss-operator";
import { loginManager, PlatformAccount } from "./login-manager";
import { randomInt, randomSleep, sleep } from "./browser-manager";
import type { Message, Platform } from "./types";
import { ensureAutoGreetingRuntimeTables } from "@/lib/db/ensure-auto-greeting-runtime-tables";
import { matchCandidate } from "./matching-engine";
import {
  analyzeCandidateMessage,
  generateReply,
} from "./llm-integration";
import {
  generateStrategy,
  initConversationState,
  updateConversationState,
} from "./conversation-engine";
import {
  applyCandidateSignals,
  buildBossMessagePlatformId,
  findActiveGreetingTemplate,
  getCommunicationByPlatformUser,
  getConversationHistory,
  insertMessageIfMissing,
  logOperation,
  mapBossCandidateToProfile,
  mapJobRowToJobPosition,
  renderGreetingTemplate,
  updateJobStats,
  withAutoGreetingClient,
  upsertCommunicationForCandidate,
} from "./runtime-service";
import { findBestQaAnswer } from "./qa-service";
import { extractCandidateSignals } from "./contact-extractor";
import type { BossAutomationOperator } from "./operator-interface";
import { createBossAutomationOperator, type AutoGreetingExecutionMode } from "./operator-factory";

export type TaskStatus = "idle" | "running" | "paused" | "completed" | "error";

export interface TaskConfig {
  jobId: string;
  accountId: string;
  platform: Platform;
  executionMode?: AutoGreetingExecutionMode;
  taskType?: "greet" | "reply" | "all";
  maxGreetings: number;
  matchThreshold: number;
  greetingIntervalMin: number;
  greetingIntervalMax: number;
  replyDelayMin: number;
  replyDelayMax: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  greetingTemplate?: string;
}

export interface TaskState {
  status: TaskStatus;
  greetedCount: number;
  repliedCount: number;
  matchedCount: number;
  errorCount: number;
  lastExecutionTime: Date | null;
  currentAction: string;
  errors: string[];
}

interface TaskOwner {
  createdById: string;
  tenantId?: string;
}

interface PersistedTaskRow {
  id: string;
  config: TaskConfig;
  state: Partial<TaskState> | null;
  status: TaskStatus;
  created_by_id?: string | null;
  tenant_id?: string | null;
}

function parseTaskState(raw: unknown): Partial<TaskState> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as Partial<TaskState>;
}

function parseTaskConfig(raw: unknown): TaskConfig | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as TaskConfig;
}

function buildStatusFromStage(stage: string, intentLevel?: string | null): string {
  if (intentLevel === "A") {
    return "高意向";
  }

  if (stage === "conversion") {
    return "沟通中";
  }

  if (stage === "interest_building" || stage === "screening") {
    return "沟通中";
  }

  return "已打招呼";
}

function resolveReplyStatus(
  currentStatus: string | null | undefined,
  stage: string,
  intentLevel?: string | null,
  signalStatus?: string | null
): string {
  if (signalStatus) {
    return signalStatus;
  }

  if (currentStatus === "已获取联系方式" || currentStatus === "已获取简历") {
    return currentStatus;
  }

  return buildStatusFromStage(stage, intentLevel);
}

export class AutomationTask {
  private readonly taskId: string;
  private readonly config: TaskConfig;
  private state: TaskState;
  private operator: BossAutomationOperator | null = null;
  private account: PlatformAccount | null = null;
  private shouldStop = false;
  private jobInfo: Record<string, any> | null = null;
  private greetingTemplate: string | null = null;

  constructor(taskId: string, config: TaskConfig, initialState?: Partial<TaskState> | null) {
    this.taskId = taskId;
    this.config = config;
    this.state = {
      status: initialState?.status || "idle",
      greetedCount: initialState?.greetedCount || 0,
      repliedCount: initialState?.repliedCount || 0,
      matchedCount: initialState?.matchedCount || 0,
      errorCount: initialState?.errorCount || 0,
      lastExecutionTime: initialState?.lastExecutionTime
        ? new Date(initialState.lastExecutionTime)
        : null,
      currentAction: initialState?.currentAction || "",
      errors: Array.isArray(initialState?.errors) ? initialState.errors : [],
    };
  }

  getState(): TaskState {
    return { ...this.state };
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.state.status === "running") {
      return { success: false, error: "任务已在运行中" };
    }

    try {
      await ensureAutoGreetingRuntimeTables();
      this.shouldStop = false;
      this.state.status = "running";
      this.state.currentAction = "初始化中...";
      await this.persistState();

      await this.loadJobInfo();
      await this.loadGreetingTemplate();

      const initResult = await this.initializeOperator();
      if (!initResult.success) {
        this.state.status = "error";
        this.state.errors.push(initResult.error || "初始化失败");
        await this.persistState(initResult.error || "初始化失败");
        return initResult;
      }

      void this.executeLoop();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "启动失败";
      this.state.status = "error";
      this.state.errors.push(errorMessage);
      await this.persistState(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async stop(): Promise<void> {
    this.shouldStop = true;
    this.state.status = "paused";
    this.state.currentAction = "已暂停";
    await this.persistState();

    if (this.operator) {
      await this.operator.close();
      this.operator = null;
    }
  }

  private async loadJobInfo(): Promise<void> {
    const client = await getClient();

    try {
      const result = await client.query(
        `
          SELECT *
          FROM ag_job_positions
          WHERE id = $1
          LIMIT 1
        `,
        [this.config.jobId]
      );

      if (result.rows.length === 0) {
        throw new Error("岗位不存在");
      }

      this.jobInfo = result.rows[0];
    } finally {
      client.release();
    }
  }

  private async loadGreetingTemplate(): Promise<void> {
    this.greetingTemplate = await withAutoGreetingClient(client =>
      findActiveGreetingTemplate(client, this.config.jobId, this.config.platform, "first")
    );
  }

  private async initializeOperator(): Promise<{ success: boolean; error?: string }> {
    this.account = await loginManager.getAccount(this.config.accountId);
    if (!this.account) {
      return { success: false, error: "账号不存在" };
    }

    if (this.account.status !== "active") {
      return { success: false, error: "账号未激活或已暂停" };
    }

    if (this.config.platform !== "boss") {
      return { success: false, error: "当前仅支持 Boss 平台" };
    }

    const desiredMode = this.config.executionMode || "computer-user-playwright-mcp";
    const { operator, executionMode } = await createBossAutomationOperator(desiredMode);
    this.operator = operator;
    const initResult = await this.operator.init(this.config.accountId);

    if (!initResult.success && executionMode === "computer-user-playwright-mcp") {
      await this.operator.close().catch(() => undefined);
      this.operator = new BossOperator();
      const legacyResult = await this.operator.init(this.config.accountId);
      if (legacyResult.success) {
        this.config.executionMode = "legacy-puppeteer";
      }
      return legacyResult;
    }

    this.config.executionMode = executionMode;
    return initResult;
  }

  private async executeLoop(): Promise<void> {
    while (!this.shouldStop) {
      try {
        const shouldContinue = await this.shouldContinueRunning();
        if (!shouldContinue) {
          break;
        }

        if (!this.isInWorkingHours()) {
          this.state.currentAction = "不在工作时间，等待中...";
          await this.persistState();
          await sleep(30000);
          continue;
        }

        let didWork = false;

        if (this.config.taskType !== "reply" && this.state.greetedCount < this.config.maxGreetings) {
          didWork = (await this.executeGreetingRound()) || didWork;
        }

        if (this.config.taskType !== "greet") {
          didWork = (await this.executeReplyRound()) || didWork;
        }

        if (this.state.greetedCount >= this.config.maxGreetings && this.config.taskType !== "reply") {
          this.state.status = "completed";
          this.state.currentAction = "已完成打招呼目标";
          await this.persistState();
          break;
        }

        this.state.currentAction = didWork ? "等待下一轮执行..." : "暂无可处理候选人，轮询中...";
        this.state.lastExecutionTime = new Date();
        await this.persistState();

        const nextDelay = didWork
          ? randomInt(
              this.config.greetingIntervalMin * 1000,
              this.config.greetingIntervalMax * 1000
            )
          : Math.max(15000, this.config.replyDelayMin * 1000);
        await sleep(nextDelay);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "执行出错";
        this.state.errorCount += 1;
        this.state.errors.push(errorMessage);
        this.state.currentAction = `执行异常: ${errorMessage}`;

        if (this.state.errorCount >= 5) {
          this.state.status = "error";
          await this.persistState(errorMessage);
          break;
        }

        await this.persistState(errorMessage);
        await sleep(15000);
      }
    }

    if (this.operator) {
      await this.operator.close();
      this.operator = null;
    }
  }

  private async shouldContinueRunning(): Promise<boolean> {
    const client = await getClient();

    try {
      const result = await client.query(
        `
          SELECT status
          FROM ag_automation_tasks
          WHERE id = $1
          LIMIT 1
        `,
        [this.taskId]
      );

      const persistedStatus = result.rows[0]?.status as TaskStatus | undefined;
      if (!persistedStatus) {
        this.shouldStop = true;
        return false;
      }

      if (persistedStatus === "paused" || persistedStatus === "completed" || persistedStatus === "error") {
        this.state.status = persistedStatus;
        this.shouldStop = true;
        return false;
      }

      return true;
    } finally {
      client.release();
    }
  }

  private async executeGreetingRound(): Promise<boolean> {
    if (!this.operator || !this.jobInfo) {
      return false;
    }

    this.state.currentAction = "获取候选人列表...";
    await this.persistState();

    const job = mapJobRowToJobPosition(this.jobInfo);
    const candidates = await this.operator.getRecommendCandidates({
      name: job.name,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
    });
    this.state.matchedCount = candidates.length;

    let greetedSomeone = false;

    for (const candidate of candidates) {
      if (this.shouldStop || this.state.greetedCount >= this.config.maxGreetings) {
        break;
      }

      if (!candidate.id || candidate.hasGreeted) {
        continue;
      }

      this.state.currentAction = `查看 ${candidate.name || "候选人"} 简历...`;
      await this.persistState();

      const inspectedCandidate = await this.operator.inspectCandidateResume(candidate);
      const existingCommunication = await withAutoGreetingClient(client =>
        getCommunicationByPlatformUser(client, this.config.jobId, this.config.platform, inspectedCandidate.id)
      );
      if (existingCommunication) {
        continue;
      }

      const matchResult = matchCandidate(mapBossCandidateToProfile(inspectedCandidate), job);
      const effectiveScore =
        typeof inspectedCandidate.matchScore === "number"
          ? Math.max(inspectedCandidate.matchScore, matchResult.score)
          : matchResult.score;

      if (effectiveScore < this.config.matchThreshold) {
        continue;
      }

      this.state.currentAction = `向 ${inspectedCandidate.name || "候选人"} 打招呼...`;
      await this.persistState();

      const greetingMessage = await this.generateGreetingMessage(inspectedCandidate, matchResult.templateVariables);
      const result = await this.operator.sendGreeting(inspectedCandidate, greetingMessage, {
        name: job.name,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
      });

      if (!result.success) {
        this.state.errorCount += 1;
        this.state.errors.push(`${inspectedCandidate.name || inspectedCandidate.id}: ${result.error || "发送失败"}`);

        await withAutoGreetingClient(client =>
          logOperation(client, {
            jobId: this.config.jobId,
            type: "greeting_first",
            action: "send_greeting",
            details: {
              candidateId: inspectedCandidate.id,
              candidateName: inspectedCandidate.name || null,
              attemptedMessage: greetingMessage,
            },
            success: false,
            errorMessage: result.error || "发送失败",
            platform: this.config.platform,
            operatorId: this.config.accountId,
            operatorType: "system",
          })
        );
        continue;
      }

      const persistedCandidate = {
        ...inspectedCandidate,
        id: result.platformUserId || inspectedCandidate.id,
      };
      const persistedGreeting = result.actualMessage || greetingMessage;

      await withAutoGreetingClient(async client => {
        const upserted = await upsertCommunicationForCandidate(client, {
          jobId: this.config.jobId,
          accountId: this.config.accountId,
          platform: this.config.platform,
          candidate: persistedCandidate,
          matchScore: effectiveScore,
          matchReasons: matchResult.reasons,
          initialStatus: "已打招呼",
        });

        const insertedMessage = await insertMessageIfMissing(client, {
          communicationId: upserted.id,
          sender: "hr",
          content: persistedGreeting,
          messageType: "greeting",
          sendMethod: "auto",
          isAuto: true,
          status: "sent",
          sendTime: new Date(),
          platformMessageId: `greet-${persistedCandidate.id}-${Date.now()}`,
        });

        await client.query(
          `
            UPDATE ag_candidate_communications
            SET
              status = '已打招呼',
              current_stage = COALESCE(current_stage, 'ice_breaking'),
              first_greeting_time = COALESCE(first_greeting_time, NOW()),
              first_greeting_message_id = COALESCE(first_greeting_message_id, $1),
              last_hr_message_time = NOW(),
              last_message_time = NOW(),
              communication_stats = jsonb_set(
                COALESCE(communication_stats, '{}'::jsonb),
                '{hrMessageCount}',
                to_jsonb(COALESCE((communication_stats->>'hrMessageCount')::int, 0) + $2)
              ),
              updated_at = NOW()
            WHERE id = $3
          `,
          [
            insertedMessage.id || null,
            upserted.created ? 0 : 1,
            upserted.id,
          ]
        );

        await updateJobStats(client, this.config.jobId, { totalGreeted: 1 });

        await logOperation(client, {
          jobId: this.config.jobId,
          communicationId: upserted.id,
          messageId: insertedMessage.id || null,
          type: "greeting_first",
          action: "send_greeting",
          details: {
            candidateId: persistedCandidate.id,
            candidateName: persistedCandidate.name || null,
            matchScore: effectiveScore,
            matchReasons: matchResult.reasons,
            deliveryMode: result.deliveryMode || null,
          },
          success: true,
          platform: this.config.platform,
          operatorId: this.config.accountId,
          operatorType: "system",
        });
      });

      this.state.greetedCount += 1;
      this.state.lastExecutionTime = new Date();
      greetedSomeone = true;

      await randomSleep(1500, 3500);
    }

    return greetedSomeone;
  }

  private async executeReplyRound(): Promise<boolean> {
    if (!this.operator || !this.jobInfo) {
      return false;
    }

    this.state.currentAction = "同步 Boss 聊天消息...";
    await this.persistState();

    const sessions = await this.operator.getChatSessions();
    const activeSessions = sessions.filter(session => session.candidateId && (session.hasNewMessage || session.unreadCount > 0));

    let repliedSomeone = false;
    for (const session of activeSessions) {
      if (this.shouldStop) {
        break;
      }

      const replied = await this.handleChatSession(session);
      repliedSomeone = replied || repliedSomeone;
    }

    return repliedSomeone;
  }

  private async handleChatSession(session: BossChatSession): Promise<boolean> {
    if (!this.operator || !this.jobInfo || !session.candidateId) {
      return false;
    }

    const existingCommunication = await withAutoGreetingClient(client =>
      getCommunicationByPlatformUser(client, this.config.jobId, this.config.platform, session.candidateId)
    );

    if (!existingCommunication) {
      return false;
    }

    const history = await this.operator.getChatHistory(session.candidateId);
    if (history.length === 0) {
      return false;
    }

    const latestMessage = history[history.length - 1];

    let signalStatus: string | null = null;
    let contactAdded = 0;
    let resumeAdded = 0;

    await withAutoGreetingClient(async client => {
      for (const [index, message] of history.entries()) {
        const platformMessageId = buildBossMessagePlatformId(session.candidateId, message, index);
        const inserted = await insertMessageIfMissing(client, {
          communicationId: existingCommunication.id,
          sender: message.sender,
          content: message.content,
          messageType: message.type === "text" ? "text" : "file",
          sendMethod: message.sender === "hr" ? "auto" : undefined,
          isAuto: message.sender === "hr",
          status: "sent",
          sendTime: message.time,
          platformMessageId,
        });

        if (inserted.inserted && message.sender === "candidate") {
          const signalUpdate = await applyCandidateSignals(client, existingCommunication.id, {
            ...extractCandidateSignals(message.content, {
              resumeMessage: message.type === "resume",
            }),
            receivedAt: message.time,
          });
          signalStatus = signalUpdate.status || signalStatus;
          contactAdded += signalUpdate.contactAdded ? 1 : 0;
          resumeAdded += signalUpdate.resumeAdded ? 1 : 0;

          await client.query(
            `
              UPDATE ag_candidate_communications
              SET
                last_candidate_message_time = $1,
                last_message_time = $1,
                last_synced_at = $1,
                communication_stats = jsonb_set(
                  COALESCE(communication_stats, '{}'::jsonb),
                  '{candidateMessageCount}',
                  to_jsonb(COALESCE((communication_stats->>'candidateMessageCount')::int, 0) + 1)
                ),
                updated_at = $1
              WHERE id = $2
            `,
            [message.time, existingCommunication.id]
          );
        }
      }

      await client.query(
        `
          UPDATE ag_candidate_communications
          SET last_synced_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [existingCommunication.id]
      );
    });

    if (latestMessage.sender !== "candidate") {
      return false;
    }

    const historyFromDb = await withAutoGreetingClient(client =>
      getConversationHistory(client, existingCommunication.id)
    );

    const lastDbMessage = historyFromDb[historyFromDb.length - 1];
    if (!lastDbMessage || lastDbMessage.sender !== "candidate") {
      return false;
    }

    const analysis = await analyzeCandidateMessage(lastDbMessage.content, {
      job: mapJobRowToJobPosition(this.jobInfo),
      conversationHistory: historyFromDb,
      platform: this.config.platform,
    });

    let conversationState = initConversationState();
    conversationState.roundCount = typeof existingCommunication.reply_count === "number" ? existingCommunication.reply_count : 0;
    conversationState.candidateResponseCount =
      Number(existingCommunication.communication_stats?.candidateMessageCount || 0);
    if (existingCommunication.current_stage) {
      conversationState.stage = existingCommunication.current_stage;
    }

    conversationState = updateConversationState(conversationState, lastDbMessage.content, {
      intent: analysis.intent,
      sentiment: analysis.sentiment,
      interestLevel: analysis.intentLevel,
      keywords: analysis.keywords,
    });

    const strategy = generateStrategy(
      conversationState,
      mapJobRowToJobPosition(this.jobInfo),
      this.config.platform
    );
    const matchedQa = await withAutoGreetingClient(client =>
      findBestQaAnswer(client, {
        jobId: this.config.jobId,
        platform: this.config.platform,
        message: lastDbMessage.content,
      })
    );

    if (analysis.shouldIntervene || strategy.nextAction === "escalate") {
      await withAutoGreetingClient(async client => {
        await client.query(
          `
            UPDATE ag_candidate_communications
            SET
              status = '已转入人工',
              manual_intervene = true,
              manual_intervene_reason = $1,
              manual_intervene_time = NOW(),
              candidate_intent = $2,
              intent_level = $2,
              current_stage = $3,
              updated_at = NOW()
            WHERE id = $4
          `,
          [
            analysis.shouldIntervene ? "LLM 判断需要人工介入" : "策略判断需要人工介入",
            analysis.intentLevel || null,
            conversationState.stage,
            existingCommunication.id,
          ]
        );

        await logOperation(client, {
          jobId: this.config.jobId,
          communicationId: existingCommunication.id,
          type: "manual_intervene",
          action: "escalate_to_human",
          details: {
            candidateId: session.candidateId,
            candidateMessage: lastDbMessage.content,
            intent: analysis.intent,
            intentLevel: analysis.intentLevel,
          },
          success: true,
          platform: this.config.platform,
          operatorId: this.config.accountId,
          operatorType: "system",
        });
      });

      return false;
    }

    if (strategy.nextAction === "wait") {
      return false;
    }

    const replyMessage =
      strategy.nextAction === "request_contact" || strategy.nextAction === "schedule_interview"
        ? (strategy.message?.trim() || "")
        : matchedQa?.answer ||
          strategy.message?.trim() ||
          await generateReply({
            job: mapJobRowToJobPosition(this.jobInfo),
            candidateMessage: lastDbMessage.content,
            conversationHistory: historyFromDb,
            platform: this.config.platform,
            stage: conversationState.stage,
          });

    await randomSleep(
      this.config.replyDelayMin * 1000,
      this.config.replyDelayMax * 1000
    );

    const sendResult = await this.operator.replyMessage(session.candidateId, replyMessage);
    if (!sendResult.success) {
      this.state.errorCount += 1;
      this.state.errors.push(`${session.candidateName}: ${sendResult.error || "自动回复失败"}`);

      await withAutoGreetingClient(client =>
        logOperation(client, {
          jobId: this.config.jobId,
          communicationId: existingCommunication.id,
          type: "reply_auto",
          action: "send_reply",
          details: {
            candidateId: session.candidateId,
            candidateMessage: lastDbMessage.content,
            replyMessage,
          },
          success: false,
          errorMessage: sendResult.error || "自动回复失败",
          platform: this.config.platform,
          operatorId: this.config.accountId,
          operatorType: "system",
        })
      );
      return false;
    }

    await withAutoGreetingClient(async client => {
      const insertedReply = await insertMessageIfMissing(client, {
        communicationId: existingCommunication.id,
        sender: "hr",
        content: replyMessage,
        messageType: strategy.nextAction === "request_contact" ? "request_contact" : "text",
        sendMethod: "auto",
        isAuto: true,
        status: "sent",
        sendTime: new Date(),
        platformMessageId: `reply-${session.candidateId}-${Date.now()}`,
        aiAnalysis: {
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          keywords: analysis.keywords,
          intentLevel: analysis.intentLevel,
          matchedQA: matchedQa?.id,
        },
      });

      await client.query(
        `
          UPDATE ag_candidate_communications
          SET
            status = $1,
            current_stage = $2,
            reply_count = COALESCE(reply_count, 0) + 1,
            candidate_intent = $3,
            intent_level = $3,
            last_reply_time = NOW(),
            last_hr_message_time = NOW(),
            last_message_time = NOW(),
            communication_stats = jsonb_set(
              jsonb_set(
                COALESCE(communication_stats, '{}'::jsonb),
                '{hrMessageCount}',
                to_jsonb(COALESCE((communication_stats->>'hrMessageCount')::int, 0) + 1)
              ),
              '{effectiveRounds}',
              to_jsonb(COALESCE((communication_stats->>'effectiveRounds')::int, 0) + 1)
            ),
            updated_at = NOW()
          WHERE id = $4
        `,
        [
          resolveReplyStatus(
            signalStatus || existingCommunication.status,
            conversationState.stage,
            analysis.intentLevel,
            signalStatus
          ),
          conversationState.stage,
          analysis.intentLevel || null,
          existingCommunication.id,
        ]
      );

      await updateJobStats(client, this.config.jobId, {
        totalReplied: 1,
        totalHighIntent: analysis.intentLevel === "A" ? 1 : 0,
        totalResumeReceived: resumeAdded > 0 ? 1 : 0,
        totalContactReceived: contactAdded > 0 ? 1 : 0,
      });

      await logOperation(client, {
        jobId: this.config.jobId,
        communicationId: existingCommunication.id,
        messageId: insertedReply.id || null,
        type: "reply_auto",
        action: "send_reply",
          details: {
            candidateId: session.candidateId,
            candidateMessage: lastDbMessage.content,
            replyMessage,
            intent: analysis.intent,
            intentLevel: analysis.intentLevel,
            stage: conversationState.stage,
            matchedQaId: matchedQa?.id || null,
            matchedQaKeywords: matchedQa?.matchedKeywords || [],
          },
        success: true,
        platform: this.config.platform,
        operatorId: this.config.accountId,
        operatorType: "system",
      });
    });

    this.state.repliedCount += 1;
    this.state.lastExecutionTime = new Date();
    return true;
  }

  private async generateGreetingMessage(
    candidate: BossCandidate,
    templateVariables: Record<string, string>
  ): Promise<string> {
    const messageVariables = {
      name: candidate.name || "您好",
      position: this.jobInfo?.name || candidate.title || "岗位",
      company: this.jobInfo?.company_intro || candidate.company || "",
      location: this.jobInfo?.location || "",
      salary:
        this.jobInfo?.salary_min && this.jobInfo?.salary_max
          ? `${this.jobInfo.salary_min}-${this.jobInfo.salary_max}K`
          : "",
      skills: (candidate.skills || []).slice(0, 3).join("、"),
      ...templateVariables,
    };

    const sourceTemplate = this.config.greetingTemplate || this.greetingTemplate;
    if (sourceTemplate) {
      return renderGreetingTemplate(sourceTemplate, messageVariables).trim();
    }

    const fallbackTemplates = [
      `您好，看到您的经历和我们的${this.jobInfo?.name || "岗位"}很匹配，方便聊聊吗？`,
      `您好，我们正在招聘${this.jobInfo?.name || "岗位"}，感觉您的背景挺合适，愿意了解一下吗？`,
      `您好，您在${messageVariables.skills || "相关方向"}上的经验和我们的${this.jobInfo?.name || "岗位"}比较匹配，想和您沟通下。`,
    ];

    return fallbackTemplates[randomInt(0, fallbackTemplates.length - 1)];
  }

  private isInWorkingHours(): boolean {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    return currentTime >= this.config.workingHoursStart && currentTime <= this.config.workingHoursEnd;
  }

  private async persistState(lastError?: string): Promise<void> {
    const statePayload = {
      ...this.state,
      lastExecutionTime: this.state.lastExecutionTime?.toISOString() || null,
    };

    await withAutoGreetingClient(client =>
      client.query(
        `
          UPDATE ag_automation_tasks
          SET
            status = $1,
            state = $2,
            last_heartbeat_at = NOW(),
            last_execution_at = $3,
            last_error = $4,
            updated_at = NOW()
          WHERE id = $5
        `,
        [
          this.state.status,
          JSON.stringify(statePayload),
          this.state.lastExecutionTime || null,
          lastError || null,
          this.taskId,
        ]
      )
    );
  }
}

export class TaskManager {
  private static instance: TaskManager;
  private readonly tasks = new Map<string, AutomationTask>();
  private initialized = false;

  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await ensureAutoGreetingRuntimeTables();
    const client = await getClient();

    try {
      const result = await client.query(
        `
          SELECT id, config, state, status
          FROM ag_automation_tasks
          WHERE status = 'running'
          ORDER BY created_at ASC
        `
      );

      for (const row of result.rows) {
        const config = parseTaskConfig(row.config);
        if (!config || this.tasks.has(String(row.id))) {
          continue;
        }

        const task = new AutomationTask(String(row.id), config, parseTaskState(row.state));
        this.tasks.set(String(row.id), task);
        await task.start();
      }
    } finally {
      client.release();
      this.initialized = true;
    }
  }

  async startTask(
    config: TaskConfig,
    owner: TaskOwner
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    await this.ensureInitialized();

    const client = await getClient();
    let taskId = "";

    try {
      const existing = await client.query(
        `
          SELECT id
          FROM ag_automation_tasks
          WHERE job_id = $1
            AND account_id = $2
            AND status IN ('running', 'paused')
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [config.jobId, config.accountId]
      );

      if (existing.rows.length > 0) {
        return { success: false, error: "该岗位与账号已有进行中的任务" };
      }

      const created = await client.query(
        `
          INSERT INTO ag_automation_tasks (
            job_id, account_id, platform, task_type,
            status, config, state,
            created_by_id, tenant_id, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            'pending', $5, $6,
            $7, $8, NOW(), NOW()
          )
          RETURNING id
        `,
        [
          config.jobId,
          config.accountId,
          config.platform,
          config.taskType || "all",
          JSON.stringify(config),
          JSON.stringify({
            status: "idle",
            greetedCount: 0,
            repliedCount: 0,
            matchedCount: 0,
            errorCount: 0,
            lastExecutionTime: null,
            currentAction: "",
            errors: [],
          }),
          owner.createdById,
          owner.tenantId || null,
        ]
      );

      taskId = String(created.rows[0].id);
    } finally {
      client.release();
    }

    const task = new AutomationTask(taskId, config);
    this.tasks.set(taskId, task);
    const result = await task.start();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, taskId };
  }

  async stopTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      await task.stop();
      return;
    }

    await withAutoGreetingClient(client =>
      client.query(
        `
          UPDATE ag_automation_tasks
          SET status = 'paused', updated_at = NOW()
          WHERE id = $1
        `,
        [taskId]
      )
    );
  }

  async getTaskState(taskId: string): Promise<Record<string, any> | null> {
    await this.ensureInitialized();

    const client = await getClient();
    try {
      const result = await client.query(
        `
          SELECT *
          FROM ag_automation_tasks
          WHERE id = $1
          LIMIT 1
        `,
        [taskId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async listTasks(filters: {
    createdById?: string;
    isAdmin?: boolean;
  }): Promise<Record<string, any>[]> {
    await this.ensureInitialized();
    const client = await getClient();

    try {
      const params: string[] = [];
      const whereParts: string[] = [];

      if (!filters.isAdmin && filters.createdById) {
        params.push(filters.createdById);
        whereParts.push(`created_by_id = $${params.length}`);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
      const result = await client.query(
        `
          SELECT *
          FROM ag_automation_tasks
          ${whereClause}
          ORDER BY created_at DESC
        `,
        params
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}

export const taskManager = TaskManager.getInstance();
