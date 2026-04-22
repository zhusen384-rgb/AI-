import { getClient } from "coze-coding-dev-sdk";
import type {
  CandidateCommunication,
  CandidateProfile,
  JobPosition,
  Message,
} from "@/lib/auto-greeting/types";
import type { BossCandidate, BossMessage } from "@/lib/auto-greeting/boss-operator";

interface QueryableClient {
  query: (query: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface CommunicationUpsertInput {
  jobId: string;
  accountId?: string | null;
  platform: string;
  candidate: BossCandidate;
  matchScore?: number;
  matchReasons?: string[];
  initialStatus?: string;
}

interface MessageInsertInput {
  communicationId: string;
  sender: "hr" | "candidate" | "system";
  content: string;
  messageType: string;
  sendMethod?: "auto" | "manual";
  isAuto: boolean;
  status: string;
  sendTime?: Date;
  platformMessageId?: string | null;
  aiAnalysis?: Record<string, unknown> | null;
}

interface CandidateSignalInput {
  phone?: string;
  email?: string;
  wechat?: string;
  resumeFileUrl?: string;
  receivedAt?: Date;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function textToNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => String(item || "").trim())
    .filter(Boolean);
}

export function mapJobRowToJobPosition(row: Record<string, any>): JobPosition {
  return {
    id: row.id,
    name: row.name,
    department: row.department || undefined,
    location: row.location || "待补充",
    salaryMin: row.salary_min || 0,
    salaryMax: row.salary_max || 0,
    requirements: row.requirements || {
      skills: [],
      experience: { min: 0 },
      education: [],
      keywords: [],
    },
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    companyIntro: row.company_intro || undefined,
    companySize: row.company_size || undefined,
    companyIndustry: row.company_industry || undefined,
    targetPlatforms: Array.isArray(row.target_platforms) ? row.target_platforms : [],
    matchThreshold: row.match_threshold || 60,
    secondGreetingEnabled: Boolean(row.second_greeting_enabled),
    secondGreetingDelayHours: row.second_greeting_delay_hours || 24,
    humanSimulation: row.human_simulation || {
      batchPauseCount: 10,
      batchPauseSeconds: 60,
      minDelaySeconds: 8,
      maxDelaySeconds: 25,
      nightMinDelaySeconds: 30,
      nightMaxDelaySeconds: 60,
      nightStartTime: "22:00",
      nightEndTime: "08:00",
    },
    autoReplyConfig: row.auto_reply_config || {
      maxReplyLength: 120,
      maxRoundsNoResponse: 3,
      enableIntentDetection: true,
      requestContactAfterRounds: 3,
    },
    status: (row.status || "active") as JobPosition["status"],
    pausedReason: row.paused_reason || undefined,
    stats: row.stats || {
      totalGreeted: 0,
      totalReplied: 0,
      totalHighIntent: 0,
      totalResumeReceived: 0,
      totalContactReceived: 0,
      lastStatUpdate: new Date().toISOString(),
    },
    createdById: row.created_by_id || undefined,
    createdByName: row.created_by_name || undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

export function mapBossCandidateToProfile(candidate: BossCandidate): CandidateProfile {
  return {
    name: candidate.name,
    title: candidate.title,
    skills: normalizeStringArray(candidate.skills),
    education: candidate.education,
    experience: textToNumber(candidate.experience),
    currentCompany: candidate.company,
    location: candidate.location,
    expectedSalary: candidate.salary || undefined,
    intentLevel: candidate.hasReplied ? "high" : "unknown",
  };
}

function hashString(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

export function buildBossMessagePlatformId(
  candidateId: string,
  message: BossMessage,
  index: number
): string {
  if (message.id && !message.id.startsWith("msg-")) {
    return message.id;
  }

  const stableTime = message.rawTime || message.time.toISOString();
  const raw = `${candidateId}|${message.sender}|${message.content}|${stableTime}|${index}`;
  return `boss-${hashString(raw)}`;
}

export function renderGreetingTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let content = template;

  const aliasMap: Record<string, string[]> = {
    name: ["name", "candidateName", "候选人姓名", "候选人"],
    position: ["position", "jobTitle", "岗位名称", "岗位"],
    company: ["company", "candidateCompany", "公司", "当前公司"],
    location: ["location", "jobLocation", "工作地点"],
    salary: ["salary", "jobSalaryRange", "薪资范围"],
    skills: ["skills", "candidateSkills", "技能"],
  };

  for (const [key, value] of Object.entries(variables)) {
    const placeholders = new Set<string>([
      `{${key}}`,
      `{{${key}}}`,
    ]);

    const aliases = aliasMap[key] || [];
    aliases.forEach(alias => {
      placeholders.add(`{${alias}}`);
      placeholders.add(`{{${alias}}}`);
    });

    placeholders.forEach(placeholder => {
      content = content.split(placeholder).join(value);
    });
  }

  return content;
}

function buildCandidateInfo(candidate: BossCandidate): Record<string, unknown> {
  return {
    education: candidate.education,
    currentCompany: candidate.company,
    currentPosition: candidate.title,
    experience: textToNumber(candidate.experience),
    skills: normalizeStringArray(candidate.skills),
    expectedSalary: candidate.salary,
    currentCity: candidate.location,
    resumeKeywords: normalizeStringArray(candidate.skills),
  };
}

export async function findActiveGreetingTemplate(
  client: QueryableClient,
  jobId: string,
  platform: string,
  type: "first" | "second"
): Promise<string | null> {
  const result = await client.query(
    `
      SELECT template
      FROM ag_greeting_templates
      WHERE job_id = $1
        AND type = $2
        AND is_active = true
        AND (platform = $3 OR platform = 'all')
      ORDER BY CASE WHEN platform = $3 THEN 0 ELSE 1 END, use_count ASC, created_at DESC
      LIMIT 1
    `,
    [jobId, type, platform]
  );

  return typeof result.rows[0]?.template === "string" ? result.rows[0].template : null;
}

export async function upsertCommunicationForCandidate(
  client: QueryableClient,
  input: CommunicationUpsertInput
): Promise<{ id: string; created: boolean }> {
  const existing = await client.query(
    `
      SELECT id
      FROM ag_candidate_communications
      WHERE job_id = $1
        AND platform = $2
        AND platform_user_id = $3
      LIMIT 1
    `,
    [input.jobId, input.platform, input.candidate.id]
  );

  const candidateInfo = buildCandidateInfo(input.candidate);
  const tags = normalizeStringArray(input.matchReasons);
  const now = new Date();

  if (existing.rows.length > 0) {
    const id = String(existing.rows[0].id);
    await client.query(
      `
        UPDATE ag_candidate_communications
        SET
          account_id = $1,
          name = $2,
          platform_nickname = $3,
          platform_avatar_url = $4,
          candidate_info = $5,
          match_score = COALESCE($6, match_score),
          match_reasons = COALESCE($7, match_reasons),
          tags = CASE
            WHEN jsonb_array_length(COALESCE(tags, '[]'::jsonb)) = 0 THEN $8
            ELSE tags
          END,
          last_synced_at = $9,
          updated_at = $9
        WHERE id = $10
      `,
      [
        input.accountId,
        input.candidate.name || null,
        input.candidate.name || null,
        input.candidate.avatar || null,
        toJson(candidateInfo),
        input.matchScore ?? null,
        input.matchReasons ? toJson({
          matched: input.matchReasons,
          unmatched: [],
          highlights: [],
        }) : null,
        toJson(tags),
        now,
        id,
      ]
    );

    return { id, created: false };
  }

  const inserted = await client.query(
    `
      INSERT INTO ag_candidate_communications (
        job_id, account_id, name, platform, platform_user_id,
        platform_nickname, platform_avatar_url,
        candidate_info, match_score, match_reasons,
        status, current_stage, first_greeting_time,
        last_hr_message_time, last_message_time, last_synced_at,
        communication_stats, tags,
        manual_intervene, is_blacklisted, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18,
        false, false, $19, $19
      )
      RETURNING id
    `,
    [
      input.jobId,
      input.accountId,
      input.candidate.name || null,
      input.platform,
      input.candidate.id,
      input.candidate.name || null,
      input.candidate.avatar || null,
      toJson(candidateInfo),
      input.matchScore ?? null,
      input.matchReasons ? toJson({
        matched: input.matchReasons,
        unmatched: [],
        highlights: [],
      }) : null,
      input.initialStatus || "已打招呼",
      "ice_breaking",
      now,
      now,
      now,
      now,
      toJson({
        hrMessageCount: input.initialStatus === "已打招呼" ? 1 : 0,
        candidateMessageCount: 0,
        effectiveRounds: 0,
        lastEffectiveRoundTime: null,
      }),
      toJson(tags),
      now,
    ]
  );

  return { id: String(inserted.rows[0].id), created: true };
}

export async function insertMessageIfMissing(
  client: QueryableClient,
  input: MessageInsertInput
): Promise<{ inserted: boolean; id?: string }> {
  if (input.platformMessageId) {
    const existing = await client.query(
      `
        SELECT id
        FROM ag_messages
        WHERE platform_message_id = $1
        LIMIT 1
      `,
      [input.platformMessageId]
    );

    if (existing.rows.length > 0) {
      return { inserted: false, id: String(existing.rows[0].id) };
    }
  }

  const result = await client.query(
    `
      INSERT INTO ag_messages (
        communication_id, sender, content,
        message_type, send_method, is_auto, status,
        send_time, platform_message_id, ai_analysis, created_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, NOW()
      )
      RETURNING id
    `,
    [
      input.communicationId,
      input.sender,
      input.content,
      input.messageType,
      input.sendMethod || null,
      input.isAuto,
      input.status,
      input.sendTime || new Date(),
      input.platformMessageId || null,
      input.aiAnalysis ? toJson(input.aiAnalysis) : null,
    ]
  );

  return { inserted: true, id: String(result.rows[0].id) };
}

export async function getCommunicationByPlatformUser(
  client: QueryableClient,
  jobId: string,
  platform: string,
  platformUserId: string
): Promise<Record<string, any> | null> {
  const result = await client.query(
    `
      SELECT *
      FROM ag_candidate_communications
      WHERE job_id = $1
        AND platform = $2
        AND platform_user_id = $3
      LIMIT 1
    `,
    [jobId, platform, platformUserId]
  );

  return result.rows[0] || null;
}

export async function getConversationHistory(
  client: QueryableClient,
  communicationId: string
): Promise<Message[]> {
  const result = await client.query(
    `
      SELECT *
      FROM ag_messages
      WHERE communication_id = $1
      ORDER BY send_time ASC, created_at ASC
    `,
    [communicationId]
  );

  return result.rows.map(row => ({
    id: row.id,
    communicationId: row.communication_id,
    sender: row.sender,
    content: row.content,
    messageType: row.message_type,
    sendMethod: row.send_method || undefined,
    isAuto: Boolean(row.is_auto),
    templateId: row.template_id || undefined,
    status: row.status,
    sendTime: row.send_time ? new Date(row.send_time) : undefined,
    platformMessageId: row.platform_message_id || undefined,
    attachments: row.attachments || undefined,
    aiAnalysis: row.ai_analysis || undefined,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  })) as Message[];
}

export async function updateCommunicationAfterOutgoing(
  client: QueryableClient,
  communicationId: string,
  options: {
    status?: string;
    stage?: string;
    incrementHrMessages?: number;
    secondGreetingSent?: boolean;
  } = {}
): Promise<void> {
  const now = new Date();

  await client.query(
    `
      UPDATE ag_candidate_communications
      SET
        status = COALESCE($1, status),
        current_stage = COALESCE($2, current_stage),
        second_greeting_sent = COALESCE($3, second_greeting_sent),
        second_greeting_time = CASE WHEN $3 = true THEN COALESCE(second_greeting_time, $4) ELSE second_greeting_time END,
        last_hr_message_time = $4,
        last_message_time = $4,
        communication_stats = jsonb_set(
          COALESCE(communication_stats, '{}'::jsonb),
          '{hrMessageCount}',
          to_jsonb(COALESCE((communication_stats->>'hrMessageCount')::int, 0) + $5)
        ),
        updated_at = $4
      WHERE id = $6
    `,
    [
      options.status || null,
      options.stage || null,
      options.secondGreetingSent ?? null,
      now,
      options.incrementHrMessages ?? 1,
      communicationId,
    ]
  );
}

export async function updateCommunicationAfterIncoming(
  client: QueryableClient,
  communicationId: string,
  options: {
    status?: string;
    stage?: string;
    intentLevel?: string | null;
    incrementCandidateMessages?: number;
  } = {}
): Promise<void> {
  const now = new Date();

  await client.query(
    `
      UPDATE ag_candidate_communications
      SET
        status = COALESCE($1, status),
        current_stage = COALESCE($2, current_stage),
        candidate_intent = COALESCE($3, candidate_intent),
        intent_level = COALESCE($3, intent_level),
        last_candidate_message_time = $4,
        last_message_time = $4,
        communication_stats = jsonb_set(
          COALESCE(communication_stats, '{}'::jsonb),
          '{candidateMessageCount}',
          to_jsonb(COALESCE((communication_stats->>'candidateMessageCount')::int, 0) + $5)
        ),
        updated_at = $4
      WHERE id = $6
    `,
    [
      options.status || null,
      options.stage || null,
      options.intentLevel || null,
      now,
      options.incrementCandidateMessages ?? 1,
      communicationId,
    ]
  );
}

export async function applyCandidateSignals(
  client: QueryableClient,
  communicationId: string,
  signals: CandidateSignalInput
): Promise<{
  contactAdded: boolean;
  resumeAdded: boolean;
  status: string | null;
}> {
  const hasContactSignal = Boolean(signals.phone || signals.email || signals.wechat);
  const hasResumeSignal = Boolean(signals.resumeFileUrl);

  if (!hasContactSignal && !hasResumeSignal) {
    return {
      contactAdded: false,
      resumeAdded: false,
      status: null,
    };
  }

  const existingResult = await client.query(
    `
      SELECT received_info, status
      FROM ag_candidate_communications
      WHERE id = $1
      LIMIT 1
    `,
    [communicationId]
  );

  const current = existingResult.rows[0] || {};
  const receivedInfo =
    current.received_info && typeof current.received_info === "object" && !Array.isArray(current.received_info)
      ? { ...(current.received_info as Record<string, unknown>) }
      : {};

  const contactAdded =
    (signals.phone && !receivedInfo.phone) ||
    (signals.email && !receivedInfo.email) ||
    (signals.wechat && !receivedInfo.wechat)
      ? true
      : false;
  const resumeAdded = Boolean(signals.resumeFileUrl && !receivedInfo.resumeFileUrl);

  if (signals.phone) {
    receivedInfo.phone = signals.phone;
  }
  if (signals.email) {
    receivedInfo.email = signals.email;
  }
  if (signals.wechat) {
    receivedInfo.wechat = signals.wechat;
  }
  if (signals.resumeFileUrl) {
    receivedInfo.resumeFileUrl = signals.resumeFileUrl;
  }

  if (contactAdded || resumeAdded) {
    receivedInfo.receivedAt = (signals.receivedAt || new Date()).toISOString();
  }

  const status = contactAdded
    ? "已获取联系方式"
    : resumeAdded
      ? "已获取简历"
      : (typeof current.status === "string" ? current.status : null);

  await client.query(
    `
      UPDATE ag_candidate_communications
      SET
        received_info = $1,
        status = COALESCE($2, status),
        updated_at = NOW()
      WHERE id = $3
    `,
    [toJson(receivedInfo), status, communicationId]
  );

  return {
    contactAdded,
    resumeAdded,
    status,
  };
}

export async function updateJobStats(
  client: QueryableClient,
  jobId: string,
  updates: Partial<{
    totalGreeted: number;
    totalReplied: number;
    totalHighIntent: number;
    totalResumeReceived: number;
    totalContactReceived: number;
  }>
): Promise<void> {
  const patch = {
    totalGreeted: updates.totalGreeted ?? 0,
    totalReplied: updates.totalReplied ?? 0,
    totalHighIntent: updates.totalHighIntent ?? 0,
    totalResumeReceived: updates.totalResumeReceived ?? 0,
    totalContactReceived: updates.totalContactReceived ?? 0,
    lastStatUpdate: new Date().toISOString(),
  };

  await client.query(
    `
      UPDATE ag_job_positions
      SET
        stats = jsonb_build_object(
          'totalGreeted', COALESCE((stats->>'totalGreeted')::int, 0) + $1,
          'totalReplied', COALESCE((stats->>'totalReplied')::int, 0) + $2,
          'totalHighIntent', COALESCE((stats->>'totalHighIntent')::int, 0) + $3,
          'totalResumeReceived', COALESCE((stats->>'totalResumeReceived')::int, 0) + $4,
          'totalContactReceived', COALESCE((stats->>'totalContactReceived')::int, 0) + $5,
          'lastStatUpdate', $6
        ),
        updated_at = NOW()
      WHERE id = $7
    `,
    [
      patch.totalGreeted,
      patch.totalReplied,
      patch.totalHighIntent,
      patch.totalResumeReceived,
      patch.totalContactReceived,
      patch.lastStatUpdate,
      jobId,
    ]
  );
}

export async function logOperation(
  client: QueryableClient,
  input: {
    jobId?: string | null;
    communicationId?: string | null;
    messageId?: string | null;
    type: string;
    action?: string | null;
    details?: Record<string, unknown> | null;
    success: boolean;
    errorMessage?: string | null;
    platform?: string | null;
    operatorId?: string | null;
    operatorType?: string | null;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO ag_operation_logs (
        job_id, communication_id, message_id,
        type, action, details,
        success, error_message,
        platform, operator_id, operator_type, created_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8,
        $9, $10, $11, NOW()
      )
    `,
    [
      input.jobId || null,
      input.communicationId || null,
      input.messageId || null,
      input.type,
      input.action || null,
      input.details ? toJson(input.details) : null,
      input.success,
      input.errorMessage || null,
      input.platform || null,
      input.operatorId || null,
      input.operatorType || null,
    ]
  );
}

export async function withAutoGreetingClient<T>(
  fn: (client: QueryableClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
