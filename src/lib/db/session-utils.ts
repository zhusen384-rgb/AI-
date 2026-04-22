import { getDb, getClient } from 'coze-coding-dev-sdk';
import { interviewSessions } from './schema';
import { eq } from 'drizzle-orm';

// 岗位需求定义
const positionRequirements: Record<string, any> = {
  sales_management: {
    id: "sales_management",
    name: "销售管培生",
    description: "销售方向管理培训生",
    requirements: [
      "沟通表达能力",
      "客户关系管理",
      "销售技巧和谈判能力",
      "目标达成能力",
      "抗压能力",
      "市场洞察力"
    ],
    questionFocus: "侧重考察销售技能、客户开发、业绩达成、客户关系维护等方面"
  },
  store_manager: {
    id: "store_manager",
    name: "储备店长",
    description: "门店储备管理人员",
    requirements: [
      "门店运营管理",
      "团队管理能力",
      "客户服务意识",
      "库存管理",
      "数据分析能力",
      "问题解决能力"
    ],
    questionFocus: "侧重考察门店管理经验、团队协作、客户服务、运营思维等方面"
  },
  hr: {
    id: "hr",
    name: "人事",
    description: "人力资源相关岗位",
    requirements: [
      "计算机/智能体相关知识",
      "沟通协调能力",
      "招聘与配置",
      "学习意愿",
      "执行力"
    ],
    questionFocus: "侧重考察计算机/智能体知识、沟通协调、学习意愿、执行力等方面"
  },
  ai_management: {
    id: "ai_management",
    name: "智能体管培生",
    description: "智能体方向管理培训生",
    requirements: [
      "学习能力",
      "技术理解能力",
      "创新思维",
      "逻辑分析能力",
      "产品理解",
      "跨部门协作"
    ],
    questionFocus: "侧重考察对AI/智能体的理解、学习能力、创新思维、技术潜质等方面"
  }
};

function isAiManagementPosition(value?: string | null) {
  const normalizedValue = value?.trim().toLowerCase() || "";
  return normalizedValue.includes("ai_management") || normalizedValue.includes("智能体管培生");
}

function buildGenericPositionInfo(positionId: string, positionName: string) {
  return {
    id: isAiManagementPosition(positionId) || isAiManagementPosition(positionName)
      ? "ai_management"
      : positionId,
    name: positionName,
    description: `${positionName}相关岗位`,
    requirements: [
      "岗位基础能力",
      "沟通表达能力",
      "学习与适应能力",
      "问题分析与解决能力",
      "岗位经验与实操能力",
    ],
    questionFocus: "围绕岗位职责、过往经验、业务理解、学习能力与岗位匹配度展开追问",
  };
}

function resolvePositionInfo(positionId: string, positionName: string) {
  const matchedById = positionRequirements[positionId];
  if (matchedById) {
    return { ...matchedById };
  }

  const matchedByName = Object.values(positionRequirements).find((position) => position.name === positionName);
  if (matchedByName) {
    return { ...matchedByName };
  }

  return buildGenericPositionInfo(positionId, positionName);
}

// 初始化面试会话表（仅执行一次）
let isTableInitialized = false;

export async function initInterviewSessionsTable() {
  if (isTableInitialized) {
    console.log('[会话表] 表已初始化，跳过');
    return true;
  }

  console.log('[会话表] 开始初始化表...');

  try {
    const client = await getClient();

    // 创建表
    console.log('[会话表] 创建表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id SERIAL PRIMARY KEY,
        interview_id TEXT NOT NULL UNIQUE,
        link_id TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        mode TEXT NOT NULL,
        position TEXT NOT NULL,
        position_id TEXT NOT NULL,
        resume TEXT NOT NULL,
        resume_parsed_data JSONB,
        candidate_status JSONB,
        messages JSONB NOT NULL,
        interview_stage INTEGER NOT NULL DEFAULT 1,
        follow_up_count INTEGER NOT NULL DEFAULT 0,
        current_question_count INTEGER NOT NULL DEFAULT 0,
        score_rule_snapshot JSONB,
        dimension_coverage JSONB,
        required_question_state JSONB,
        current_question_meta JSONB,
        asked_question_keys JSONB,
        technical_question_ids JSONB,
        technical_questions_asked INTEGER NOT NULL DEFAULT 0,
        is_current_question_technical BOOLEAN NOT NULL DEFAULT FALSE,
        start_time TIMESTAMP NOT NULL,
        tenant_id TEXT,
        user_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[会话表] 表创建成功');

    // 对旧表结构做兼容补列，避免历史环境缺字段导致开始面试失败
    console.log('[会话表] 检查并补齐缺失列...');
    await client.query(`
      ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS resume_parsed_data JSONB,
      ADD COLUMN IF NOT EXISTS candidate_status JSONB,
      ADD COLUMN IF NOT EXISTS score_rule_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS dimension_coverage JSONB,
      ADD COLUMN IF NOT EXISTS required_question_state JSONB,
      ADD COLUMN IF NOT EXISTS current_question_meta JSONB,
      ADD COLUMN IF NOT EXISTS asked_question_keys JSONB,
      ADD COLUMN IF NOT EXISTS technical_question_ids JSONB,
      ADD COLUMN IF NOT EXISTS technical_questions_asked INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_current_question_technical BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS rule_question_bank JSONB,
      ADD COLUMN IF NOT EXISTS rule_question_bank_asked INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_current_question_from_bank BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS tenant_id TEXT,
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);
    console.log('[会话表] 缺失列补齐完成');

    // 创建索引
    console.log('[会话表] 创建索引...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_interview_id ON interview_sessions(interview_id)
      `);
    } catch (e) {
      console.log('[会话表] 索引1创建失败（可能已存在，忽略）');
    }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_link_id ON interview_sessions(link_id)
      `);
    } catch (e) {
      console.log('[会话表] 索引2创建失败（可能已存在，忽略）');
    }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_tenant_id ON interview_sessions(tenant_id)
      `);
    } catch (e) {
      console.log('[会话表] 租户索引创建失败（可能已存在，忽略）');
    }

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id ON interview_sessions(user_id)
      `);
    } catch (e) {
      console.log('[会话表] 用户索引创建失败（可能已存在，忽略）');
    }

    // 创建更新时间函数
    console.log('[会话表] 创建触发器函数...');
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION update_interview_sessions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      console.log('[会话表] 触发器函数创建成功');
    } catch (e) {
      console.log('[会话表] 触发器函数创建失败（忽略）');
    }

    // 创建触发器（PostgreSQL 不支持 IF NOT EXISTS，需要先删除）
    console.log('[会话表] 创建触发器...');
    try {
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_update_interview_sessions_updated_at ON interview_sessions
      `);
    } catch (e) {
      // 触发器可能不存在，忽略错误
    }

    try {
      await client.query(`
        CREATE TRIGGER trigger_update_interview_sessions_updated_at
          BEFORE UPDATE ON interview_sessions
          FOR EACH ROW
          EXECUTE FUNCTION update_interview_sessions_updated_at()
      `);
      console.log('[会话表] 触发器创建成功');
    } catch (e) {
      console.log('[会话表] 触发器创建失败（可能已存在，忽略）');
    }

    isTableInitialized = true;
    console.log('[会话表] 表初始化完成');
    return true;
  } catch (error) {
    console.error('[会话表] 初始化面试会话表失败:', error);
    return false;
  }
}

// 保存会话
export async function saveInterviewSession(session: any) {
  try {
    console.log('[会话表] 开始保存会话:', {
      interviewId: session.interviewId,
      candidateName: session.candidateName,
      mode: session.mode,
      position: session.position?.name
    });

    const db = await getDb();

    // 先查询是否已存在
    const [existing] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.interviewId, session.interviewId));

    console.log('[会话表] 查询结果，是否已存在:', !!existing);

    if (existing) {
      // 更新
      console.log('[会话表] 更新已存在的会话');
      const [updated] = await db
        .update(interviewSessions)
        .set({
          messages: session.messages,
          interviewStage: session.interviewStage,
          followUpCount: session.followUpCount,
          currentQuestionCount: session.currentQuestionCount,
          scoreRuleSnapshot: session.scoreRuleSnapshot || null,
          dimensionCoverage: session.dimensionCoverage || null,
          requiredQuestionState: session.requiredQuestionState || null,
          currentQuestionMeta: session.currentQuestionMeta || null,
          askedQuestionKeys: session.askedQuestionKeys || [],
          // 技术题目相关字段
          technicalQuestionIds: session.technicalQuestionIds,
          technicalQuestionsAsked: session.technicalQuestionsAsked,
          isCurrentQuestionTechnical: session.isCurrentQuestionTechnical,
          // 规则题库相关字段
          ruleQuestionBank: session.ruleQuestionBank || null,
          ruleQuestionBankAsked: session.ruleQuestionBankAsked || 0,
          isCurrentQuestionFromBank: session.isCurrentQuestionFromBank || false,
          tenantId: session.tenantId || null,
          userId: session.userId || null,
          updatedAt: new Date(),
        })
        .where(eq(interviewSessions.interviewId, session.interviewId))
        .returning();

      console.log('[会话表] 会话更新成功');
      return updated;
    } else {
      // 插入
      console.log('[会话表] 插入新会话');
      const [inserted] = await db
        .insert(interviewSessions)
        .values({
          interviewId: session.interviewId,
          linkId: session.linkId,
          candidateName: session.candidateName,
          mode: session.mode,
          position: session.position.name,
          positionId: session.positionId,
          resume: session.resume,
          resumeParsedData: session.resumeParsedData || null,
          messages: session.messages,
          interviewStage: session.interviewStage,
          followUpCount: session.followUpCount,
          currentQuestionCount: session.currentQuestionCount,
          scoreRuleSnapshot: session.scoreRuleSnapshot || null,
          dimensionCoverage: session.dimensionCoverage || null,
          requiredQuestionState: session.requiredQuestionState || null,
          currentQuestionMeta: session.currentQuestionMeta || null,
          askedQuestionKeys: session.askedQuestionKeys || [],
          // 技术题目相关字段
          technicalQuestionIds: session.technicalQuestionIds,
          technicalQuestionsAsked: session.technicalQuestionsAsked,
          isCurrentQuestionTechnical: session.isCurrentQuestionTechnical,
          // 规则题库相关字段
          ruleQuestionBank: session.ruleQuestionBank || null,
          ruleQuestionBankAsked: session.ruleQuestionBankAsked || 0,
          isCurrentQuestionFromBank: session.isCurrentQuestionFromBank || false,
          tenantId: session.tenantId || null,
          userId: session.userId || null,
          startTime: session.startTime,
        })
        .returning();

      console.log('[会话表] 会话插入成功:', inserted?.id);
      return inserted;
    }
  } catch (error) {
    console.error('[会话表] 保存会话失败:', error);
    throw error;
  }
}

// 获取会话
export async function getInterviewSession(interviewId: string) {
  try {
    console.log('[会话表] 查询会话:', interviewId);

    const db = await getDb();

    const [row] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.interviewId, interviewId));

    if (!row) {
      console.log('[会话表] 会话不存在:', interviewId);
      return null;
    }

    console.log('[会话表] 找到会话:', interviewId, 'candidate:', row.candidateName);

    const positionInfo = resolvePositionInfo(row.positionId, row.position);

    return {
      interviewId: row.interviewId,
      linkId: row.linkId,
      candidateName: row.candidateName,
      mode: row.mode,
      position: positionInfo,
      positionId: row.positionId,
      resume: row.resume,
      messages: Array.isArray(row.messages) ? row.messages : [],
      interviewStage: row.interviewStage,
      followUpCount: row.followUpCount,
      currentQuestionCount: row.currentQuestionCount,
      scoreRuleSnapshot: row.scoreRuleSnapshot || null,
      dimensionCoverage: row.dimensionCoverage || null,
      requiredQuestionState: row.requiredQuestionState || null,
      currentQuestionMeta: row.currentQuestionMeta || null,
      askedQuestionKeys: row.askedQuestionKeys || [],
      startTime: row.startTime instanceof Date ? row.startTime : new Date(row.startTime),
      createdAt: row.createdAt instanceof Date ? row.createdAt : (row.createdAt ? new Date(row.createdAt) : row.startTime instanceof Date ? row.startTime : new Date(row.startTime)),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : (row.updatedAt ? new Date(row.updatedAt) : new Date()),
      // 技术题目相关字段
      technicalQuestionIds: row.technicalQuestionIds || null,
      technicalQuestionsAsked: row.technicalQuestionsAsked || 0,
      isCurrentQuestionTechnical: row.isCurrentQuestionTechnical || false,
      // 规则题库相关字段
      ruleQuestionBank: Array.isArray(row.ruleQuestionBank) ? row.ruleQuestionBank : null,
      ruleQuestionBankAsked: row.ruleQuestionBankAsked || 0,
      isCurrentQuestionFromBank: row.isCurrentQuestionFromBank || false,
      tenantId: row.tenantId || null,
      userId: row.userId || null,
    };
  } catch (error) {
    console.error('[会话表] 获取会话失败:', error);
    return null;
  }
}

// 通过 linkId 获取面试会话（查找该链接下进行中的面试）
export async function getInterviewSessionByLinkId(linkId: string) {
  try {
    console.log('[会话表] 通过 linkId 查询会话:', linkId);

    const db = await getDb();

    // 1. 先从统计表查找进行中的面试
    const statsResult = await db.$client.query(`
      SELECT interview_id FROM full_ai_interview_statistics 
      WHERE link_id = $1 AND status = 'in_progress'
      ORDER BY created_at DESC
      LIMIT 1
    `, [linkId]);

    if (!statsResult.rows || statsResult.rows.length === 0) {
      console.log('[会话表] 没有找到进行中的面试统计记录');
      return null;
    }

    const interviewId = statsResult.rows[0].interview_id;
    console.log('[会话表] 找到进行中的面试 interviewId:', interviewId);

    // 2. 从会话表获取会话详情
    const [row] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.interviewId, interviewId));

    if (!row) {
      console.log('[会话表] 会话不存在:', interviewId);
      return null;
    }

    console.log('[会话表] 找到会话:', interviewId, 'candidate:', row.candidateName);

    const positionInfo = resolvePositionInfo(row.positionId, row.position);

    return {
      interviewId: row.interviewId,
      linkId: row.linkId,
      candidateName: row.candidateName,
      mode: row.mode,
      position: positionInfo,
      positionId: row.positionId,
      resume: row.resume,
      messages: Array.isArray(row.messages) ? row.messages : [],
      interviewStage: row.interviewStage,
      followUpCount: row.followUpCount,
      currentQuestionCount: row.currentQuestionCount,
      scoreRuleSnapshot: row.scoreRuleSnapshot || null,
      dimensionCoverage: row.dimensionCoverage || null,
      requiredQuestionState: row.requiredQuestionState || null,
      currentQuestionMeta: row.currentQuestionMeta || null,
      askedQuestionKeys: row.askedQuestionKeys || [],
      startTime: row.startTime instanceof Date ? row.startTime : new Date(row.startTime),
      createdAt: row.createdAt instanceof Date ? row.createdAt : (row.createdAt ? new Date(row.createdAt) : row.startTime instanceof Date ? row.startTime : new Date(row.startTime)),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : (row.updatedAt ? new Date(row.updatedAt) : new Date()),
      // 技术题目相关字段
      technicalQuestionIds: row.technicalQuestionIds || null,
      technicalQuestionsAsked: row.technicalQuestionsAsked || 0,
      isCurrentQuestionTechnical: row.isCurrentQuestionTechnical || false,
      // 规则题库相关字段
      ruleQuestionBank: Array.isArray(row.ruleQuestionBank) ? row.ruleQuestionBank : null,
      ruleQuestionBankAsked: row.ruleQuestionBankAsked || 0,
      isCurrentQuestionFromBank: row.isCurrentQuestionFromBank || false,
      tenantId: row.tenantId || null,
      userId: row.userId || null,
    };
  } catch (error) {
    console.error('[会话表] 通过 linkId 获取会话失败:', error);
    return null;
  }
}

// ==================== 面试统计相关函数 ====================

// 初始化面试统计表（仅执行一次）
let isStatisticsTableInitialized = false;

export async function initInterviewStatisticsTable() {
  if (isStatisticsTableInitialized) {
    console.log('[统计表] 表已初始化，跳过');
    return true;
  }

  console.log('[统计表] 开始初始化表...');

  try {
    const db = await getDb();

    // 创建表
    console.log('[统计表] 创建表...');
    await db.$client.query(`
      CREATE TABLE IF NOT EXISTS full_ai_interview_statistics (
        id SERIAL PRIMARY KEY,
        link_id TEXT NOT NULL,
        interview_id TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        position TEXT NOT NULL,
        mode TEXT NOT NULL,
        interview_time TIMESTAMP NOT NULL,
        meeting_link TEXT NOT NULL,
        meeting_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress',
        tenant_id TEXT,
        user_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[统计表] 表创建成功');

    // 创建索引
    console.log('[统计表] 创建索引...');
    try {
      await db.$client.query(`CREATE INDEX IF NOT EXISTS idx_interview_statistics_link_id ON full_ai_interview_statistics(link_id)`);
      await db.$client.query(`CREATE INDEX IF NOT EXISTS idx_interview_statistics_candidate_name ON full_ai_interview_statistics(candidate_name)`);
      await db.$client.query(`CREATE INDEX IF NOT EXISTS idx_interview_statistics_interview_time ON full_ai_interview_statistics(interview_time)`);
      await db.$client.query(`CREATE INDEX IF NOT EXISTS idx_interview_statistics_tenant_id ON full_ai_interview_statistics(tenant_id)`);
      await db.$client.query(`CREATE INDEX IF NOT EXISTS idx_interview_statistics_user_id ON full_ai_interview_statistics(user_id)`);
      console.log('[统计表] 索引创建成功');
    } catch (e) {
      console.log('[统计表] 索引创建失败（可能已存在，忽略）');
    }

    isStatisticsTableInitialized = true;
    console.log('[统计表] 表初始化完成');
    return true;
  } catch (error) {
    console.error('[统计表] 初始化面试统计表失败:', error);
    return false;
  }
}

// 保存面试统计记录
export async function saveInterviewStatistics(statistics: {
  linkId: string;
  interviewId: string;
  candidateName: string;
  position: string;
  mode: string;
  meetingLink: string;
  meetingId: string;
  status?: string;
  tenantId?: string | null;
  userId?: string | null;
}) {
  try {
    console.log('[统计表] 开始保存统计记录:', {
      interviewId: statistics.interviewId,
      candidateName: statistics.candidateName,
      position: statistics.position
    });

    const db = await getDb();
    
    // 插入统计记录
    await db.$client.query(`
      INSERT INTO full_ai_interview_statistics 
      (link_id, interview_id, candidate_name, position, mode, interview_time, meeting_link, meeting_id, status, tenant_id, user_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, NOW())
    `, [
      statistics.linkId,
      statistics.interviewId,
      statistics.candidateName,
      statistics.position,
      statistics.mode,
      statistics.meetingLink,
      statistics.meetingId,
      statistics.status || 'in_progress',
      statistics.tenantId || null,
      statistics.userId || null,
    ]);

    console.log('[统计表] 统计记录保存成功');
    return true;
  } catch (error) {
    console.error('[统计表] 保存统计记录失败:', error);
    return false;
  }
}

// 更新面试统计状态
export async function updateInterviewStatisticsStatus(interviewId: string, status: string) {
  try {
    console.log('[统计表] 开始更新统计状态:', {
      interviewId,
      status
    });

    const db = await getDb();
    
    // 更新状态
    await db.$client.query(`
      UPDATE full_ai_interview_statistics
      SET status = $1
      WHERE interview_id = $2
    `, [status, interviewId]);

    console.log('[统计表] 统计状态更新成功');
    return true;
  } catch (error) {
    console.error('[统计表] 更新统计状态失败:', error);
    return false;
  }
}
