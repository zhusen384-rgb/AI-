/**
 * 统计数据 API
 *
 * GET /api/auto-greeting/stats - 获取统计数据
 * POST /api/auto-greeting/stats - 预留，当前不开放手动写入
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import {
  getAccessibleAutoGreetingJobIds,
  isAutoGreetingSuperAdmin,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

type StatsType = 'overview' | 'job' | 'trend' | 'platform' | 'candidate' | 'performance';
type StatsPeriod = 'day' | 'week' | 'month';

type QueryResultRow = Record<string, unknown>;

interface QueryableClient {
  query: (query: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }>;
  release: () => void;
}

interface StatsScope {
  jobIds: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  period: StatsPeriod;
}

async function getOwnedAutoGreetingJobIds(
  client: QueryableClient,
  ownerUserId: string
): Promise<string[]> {
  const result = await client.query(
    `
      SELECT id
      FROM ag_job_positions
      WHERE created_by_id = $1
    `,
    [ownerUserId]
  );

  return result.rows.map((row) => String(row.id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_FORMAT: Record<StatsPeriod, string> = {
  day: 'YYYY-MM-DD',
  week: 'IYYY-IW',
  month: 'YYYY-MM',
};

function parseInteger(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function parseDecimal(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isValidJobId(jobId?: string | null): boolean {
  return !jobId || UUID_RE.test(jobId);
}

function isValidDate(value?: string | null): boolean {
  return !value || DATE_RE.test(value);
}

function buildJobScopeClause(column: string, jobIds: string[] | null, startIndex = 1) {
  if (jobIds === null) {
    return {
      clause: '1=1',
      params: [] as unknown[],
      nextIndex: startIndex,
    };
  }

  return {
    clause: `${column} = ANY($${startIndex}::uuid[])`,
    params: [jobIds] as unknown[],
    nextIndex: startIndex + 1,
  };
}

function buildDateScopeClause(column: string, startDate?: string | null, endDate?: string | null, startIndex = 1) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let nextIndex = startIndex;

  if (startDate) {
    clauses.push(`${column} >= $${nextIndex}::date`);
    params.push(startDate);
    nextIndex += 1;
  }

  if (endDate) {
    clauses.push(`${column} < ($${nextIndex}::date + INTERVAL '1 day')`);
    params.push(endDate);
    nextIndex += 1;
  }

  return {
    clause: clauses.length > 0 ? clauses.join(' AND ') : '1=1',
    params,
    nextIndex,
  };
}

function combineClauses(...clauses: string[]): string {
  const filtered = clauses.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' AND ') : '1=1';
}

async function getOverviewStats(client: QueryableClient, scope: StatsScope) {
  const jobsScope = buildJobScopeClause('id', scope.jobIds);
  const jobsResult = await client.query(
    `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active
      FROM ag_job_positions
      WHERE ${jobsScope.clause}
    `,
    jobsScope.params
  );

  const commJobScope = buildJobScopeClause('job_id', scope.jobIds);
  const commDateScope = buildDateScopeClause('created_at', scope.startDate, scope.endDate, commJobScope.nextIndex);
  const commResult = await client.query(
    `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = '已打招呼' THEN 1 END) as greeted,
        COUNT(CASE WHEN status = '沟通中' THEN 1 END) as communicating,
        COUNT(CASE WHEN status IN ('沟通中', '高意向', '已回复') THEN 1 END) as replied,
        COUNT(CASE WHEN status = '已约面' THEN 1 END) as interviewed,
        COUNT(CASE WHEN status = '已拒绝' THEN 1 END) as rejected
      FROM ag_candidate_communications
      WHERE ${combineClauses(commJobScope.clause, commDateScope.clause)}
    `,
    [...commJobScope.params, ...commDateScope.params]
  );

  const msgJobScope = buildJobScopeClause('c.job_id', scope.jobIds);
  const msgDateScope = buildDateScopeClause('m.created_at', scope.startDate, scope.endDate, msgJobScope.nextIndex);
  const msgResult = await client.query(
    `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN m.sender = 'hr' THEN 1 END) as hr_messages,
        COUNT(CASE WHEN m.sender = 'candidate' THEN 1 END) as candidate_messages,
        COUNT(CASE WHEN m.is_auto = true THEN 1 END) as auto_messages
      FROM ag_messages m
      LEFT JOIN ag_candidate_communications c ON m.communication_id = c.id
      WHERE ${combineClauses(msgJobScope.clause, msgDateScope.clause)}
    `,
    [...msgJobScope.params, ...msgDateScope.params]
  );

  const conversionJobScope = buildJobScopeClause('job_id', scope.jobIds);
  const conversionDateScope = buildDateScopeClause(
    'created_at',
    scope.startDate,
    scope.endDate,
    conversionJobScope.nextIndex
  );
  const conversionResult = await client.query(
    `
      SELECT
        COUNT(*) as total_greeted,
        COUNT(CASE WHEN COALESCE((communication_stats->>'candidateMessageCount')::int, 0) > 0 THEN 1 END) as has_reply,
        COUNT(CASE WHEN status IN ('高意向', '已获取联系方式', '已获取简历', '已约面') THEN 1 END) as has_interview
      FROM ag_candidate_communications
      WHERE ${combineClauses(conversionJobScope.clause, conversionDateScope.clause)}
    `,
    [...conversionJobScope.params, ...conversionDateScope.params]
  );

  const jobs = jobsResult.rows[0] || {};
  const comm = commResult.rows[0] || {};
  const msg = msgResult.rows[0] || {};
  const conv = conversionResult.rows[0] || {};

  const totalGreeted = parseInteger(conv.total_greeted);
  const hasReply = parseInteger(conv.has_reply);
  const hasInterview = parseInteger(conv.has_interview);

  return {
    jobs: {
      total: parseInteger(jobs.total),
      active: parseInteger(jobs.active),
    },
    communications: {
      total: parseInteger(comm.total),
      greeted: parseInteger(comm.greeted),
      communicating: parseInteger(comm.communicating),
      replied: parseInteger(comm.replied),
      interviewed: parseInteger(comm.interviewed),
      rejected: parseInteger(comm.rejected),
    },
    messages: {
      total: parseInteger(msg.total),
      hrMessages: parseInteger(msg.hr_messages),
      candidateMessages: parseInteger(msg.candidate_messages),
      autoMessages: parseInteger(msg.auto_messages),
    },
    conversion: {
      totalGreeted,
      replyRate: totalGreeted > 0 ? `${((hasReply / totalGreeted) * 100).toFixed(2)}%` : '0%',
      interviewRate: totalGreeted > 0 ? `${((hasInterview / totalGreeted) * 100).toFixed(2)}%` : '0%',
    },
  };
}

async function getJobStats(client: QueryableClient, scope: StatsScope, requestedJobId?: string | null) {
  if (!requestedJobId) {
    const jobsScope = buildJobScopeClause('j.id', scope.jobIds);
    const result = await client.query(
      `
        SELECT
          j.id,
          j.name,
          j.status,
          j.stats,
          COUNT(c.id) as total_candidates,
          COUNT(CASE WHEN c.status = '已打招呼' THEN 1 END) as greeted,
          COUNT(CASE WHEN c.status = '沟通中' THEN 1 END) as communicating,
          COUNT(CASE WHEN c.status = '已约面' THEN 1 END) as interviewed
        FROM ag_job_positions j
        LEFT JOIN ag_candidate_communications c ON j.id = c.job_id
        WHERE ${jobsScope.clause}
        GROUP BY j.id
        ORDER BY j.created_at DESC
      `,
      jobsScope.params
    );

    return {
      jobs: result.rows.map(row => ({
        id: String(row.id),
        name: String(row.name || ''),
        status: String(row.status || ''),
        stats: row.stats ?? {},
        candidates: {
          total: parseInteger(row.total_candidates),
          greeted: parseInteger(row.greeted),
          communicating: parseInteger(row.communicating),
          interviewed: parseInteger(row.interviewed),
        },
      })),
    };
  }

  const jobResult = await client.query(
    `SELECT * FROM ag_job_positions WHERE id = $1 LIMIT 1`,
    [requestedJobId]
  );

  const commResult = await client.query(
    `
      SELECT
        status,
        COUNT(*) as count
      FROM ag_candidate_communications
      WHERE job_id = $1
      GROUP BY status
    `,
    [requestedJobId]
  );

  const stageResult = await client.query(
    `
      SELECT
        current_stage,
        COUNT(*) as count
      FROM ag_candidate_communications
      WHERE job_id = $1
      GROUP BY current_stage
    `,
    [requestedJobId]
  );

  const templateResult = await client.query(
    `
      SELECT
        type,
        COUNT(*) as count,
        AVG(use_count) as avg_use_count
      FROM ag_greeting_templates
      WHERE job_id = $1
      GROUP BY type
    `,
    [requestedJobId]
  );

  return {
    job: jobResult.rows[0] || null,
    statusDistribution: commResult.rows.reduce<Record<string, number>>((acc, row) => {
      acc[String(row.status || '未知')] = parseInteger(row.count);
      return acc;
    }, {}),
    stageDistribution: stageResult.rows.reduce<Record<string, number>>((acc, row) => {
      acc[String(row.current_stage || 'unknown')] = parseInteger(row.count);
      return acc;
    }, {}),
    templateStats: templateResult.rows.map(row => ({
      type: String(row.type || ''),
      count: parseInteger(row.count),
      avgUseCount: parseDecimal(row.avg_use_count).toFixed(1),
    })),
  };
}

async function getTrendStats(client: QueryableClient, scope: StatsScope) {
  const periodFormat = PERIOD_FORMAT[scope.period];
  const commJobScope = buildJobScopeClause('job_id', scope.jobIds);
  const commDateScope =
    scope.startDate || scope.endDate
      ? buildDateScopeClause('created_at', scope.startDate, scope.endDate, commJobScope.nextIndex)
      : { clause: `created_at >= NOW() - INTERVAL '30 days'`, params: [] as unknown[], nextIndex: commJobScope.nextIndex };

  const commTrend = await client.query(
    `
      SELECT
        TO_CHAR(created_at, '${periodFormat}') as period,
        COUNT(*) as total,
        COUNT(CASE WHEN status = '已打招呼' THEN 1 END) as greeted
      FROM ag_candidate_communications
      WHERE ${combineClauses(commJobScope.clause, commDateScope.clause)}
      GROUP BY TO_CHAR(created_at, '${periodFormat}')
      ORDER BY period
    `,
    [...commJobScope.params, ...commDateScope.params]
  );

  const msgJobScope = buildJobScopeClause('c.job_id', scope.jobIds);
  const msgDateScope =
    scope.startDate || scope.endDate
      ? buildDateScopeClause('m.created_at', scope.startDate, scope.endDate, msgJobScope.nextIndex)
      : { clause: `m.created_at >= NOW() - INTERVAL '30 days'`, params: [] as unknown[], nextIndex: msgJobScope.nextIndex };

  const msgTrend = await client.query(
    `
      SELECT
        TO_CHAR(m.created_at, '${periodFormat}') as period,
        COUNT(*) as total,
        COUNT(CASE WHEN m.sender = 'candidate' THEN 1 END) as candidate_messages
      FROM ag_messages m
      LEFT JOIN ag_candidate_communications c ON m.communication_id = c.id
      WHERE ${combineClauses(msgJobScope.clause, msgDateScope.clause)}
      GROUP BY TO_CHAR(m.created_at, '${periodFormat}')
      ORDER BY period
    `,
    [...msgJobScope.params, ...msgDateScope.params]
  );

  return {
    period: scope.period,
    communicationTrend: commTrend.rows.map(row => ({
      period: String(row.period || ''),
      total: parseInteger(row.total),
      greeted: parseInteger(row.greeted),
    })),
    messageTrend: msgTrend.rows.map(row => ({
      period: String(row.period || ''),
      total: parseInteger(row.total),
      candidateMessages: parseInteger(row.candidate_messages),
    })),
  };
}

async function getPlatformStats(client: QueryableClient, scope: StatsScope, platform?: string | null) {
  const jobScope = buildJobScopeClause('job_id', scope.jobIds);
  const params = [...jobScope.params];
  const clauses = [jobScope.clause];

  if (platform) {
    clauses.push(`platform = $${params.length + 1}`);
    params.push(platform);
  }

  const result = await client.query(
    `
      SELECT
        platform,
        COUNT(*) as total,
        COUNT(CASE WHEN status = '已打招呼' THEN 1 END) as greeted,
        COUNT(CASE WHEN status = '沟通中' THEN 1 END) as communicating,
        COUNT(CASE WHEN status = '已约面' THEN 1 END) as interviewed,
        AVG(match_score) as avg_match_score
      FROM ag_candidate_communications
      WHERE ${combineClauses(...clauses)}
      GROUP BY platform
      ORDER BY total DESC
    `,
    params
  );

  return {
    platforms: result.rows.map(row => ({
      platform: String(row.platform || ''),
      total: parseInteger(row.total),
      greeted: parseInteger(row.greeted),
      communicating: parseInteger(row.communicating),
      interviewed: parseInteger(row.interviewed),
      avgMatchScore: parseDecimal(row.avg_match_score).toFixed(1),
    })),
  };
}

async function getCandidateStats(client: QueryableClient, scope: StatsScope) {
  const jobScope = buildJobScopeClause('job_id', scope.jobIds);
  const dateScope = buildDateScopeClause('created_at', scope.startDate, scope.endDate, jobScope.nextIndex);
  const whereClause = combineClauses(jobScope.clause, dateScope.clause);
  const params = [...jobScope.params, ...dateScope.params];

  const intentResult = await client.query(
    `
      SELECT
        intent_level,
        COUNT(*) as count
      FROM ag_candidate_communications
      WHERE ${whereClause}
        AND intent_level IS NOT NULL
      GROUP BY intent_level
      ORDER BY count DESC
    `,
    params
  );

  const tagResult = await client.query(
    `
      SELECT
        tag,
        COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(tags) as tag
        FROM ag_candidate_communications
        WHERE ${whereClause}
          AND jsonb_array_length(COALESCE(tags, '[]'::jsonb)) > 0
      ) sub
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 20
    `,
    params
  );

  const matchScoreResult = await client.query(
    `
      SELECT
        CASE
          WHEN match_score >= 80 THEN '80-100'
          WHEN match_score >= 60 THEN '60-80'
          WHEN match_score >= 40 THEN '40-60'
          ELSE '0-40'
        END as score_range,
        COUNT(*) as count
      FROM ag_candidate_communications
      WHERE ${whereClause}
      GROUP BY score_range
      ORDER BY score_range DESC
    `,
    params
  );

  return {
    intentDistribution: intentResult.rows.map(row => ({
      intent: String(row.intent_level || ''),
      count: parseInteger(row.count),
    })),
    tagDistribution: tagResult.rows.map(row => ({
      tag: String(row.tag || ''),
      count: parseInteger(row.count),
    })),
    matchScoreDistribution: matchScoreResult.rows.map(row => ({
      range: String(row.score_range || ''),
      count: parseInteger(row.count),
    })),
  };
}

async function getPerformanceStats(client: QueryableClient, scope: StatsScope) {
  const jobScope = buildJobScopeClause('c.job_id', scope.jobIds);

  const responseTimeResult = await client.query(
    `
      SELECT
        AVG(EXTRACT(EPOCH FROM (last_hr_message_time - first_greeting_time))) as avg_first_response,
        AVG(EXTRACT(EPOCH FROM (last_candidate_message_time - last_hr_message_time))) as avg_candidate_response
      FROM ag_candidate_communications c
      WHERE ${combineClauses(jobScope.clause, 'last_hr_message_time IS NOT NULL')}
    `,
    jobScope.params
  );

  const effectiveResult = await client.query(
    `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN COALESCE((communication_stats->>'effectiveRounds')::int, 0) > 0 THEN 1 END) as effective
      FROM ag_candidate_communications c
      WHERE ${jobScope.clause}
    `,
    jobScope.params
  );

  const autoResult = await client.query(
    `
      SELECT
        COUNT(CASE WHEN m.is_auto = true THEN 1 END) as auto_count,
        COUNT(CASE WHEN m.is_auto = false THEN 1 END) as manual_count
      FROM ag_messages m
      LEFT JOIN ag_candidate_communications c ON m.communication_id = c.id
      WHERE ${combineClauses(jobScope.clause, `m.sender = 'hr'`)}
    `,
    jobScope.params
  );

  const responseTime = responseTimeResult.rows[0] || {};
  const effective = effectiveResult.rows[0] || {};
  const auto = autoResult.rows[0] || {};
  const totalMessages = parseInteger(auto.auto_count) + parseInteger(auto.manual_count);

  return {
    averageResponseTime: {
      firstResponse: parseDecimal(responseTime.avg_first_response) > 0
        ? `${Math.round(parseDecimal(responseTime.avg_first_response) / 60)}分钟`
        : 'N/A',
      candidateResponse: parseDecimal(responseTime.avg_candidate_response) > 0
        ? `${Math.round(parseDecimal(responseTime.avg_candidate_response) / 60)}分钟`
        : 'N/A',
    },
    effectiveCommunicationRate: parseInteger(effective.total) > 0
      ? `${((parseInteger(effective.effective) / parseInteger(effective.total)) * 100).toFixed(2)}%`
      : '0%',
    automationRate: totalMessages > 0
      ? `${((parseInteger(auto.auto_count) / totalMessages) * 100).toFixed(2)}%`
      : '0%',
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'overview') as StatsType;
    const jobId = searchParams.get('jobId');
    const ownerUserId = searchParams.get('ownerUserId');
    const platform = searchParams.get('platform');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = (searchParams.get('period') || 'day') as StatsPeriod;

    const validTypes: StatsType[] = ['overview', 'job', 'trend', 'platform', 'candidate', 'performance'];
    const validPeriods: StatsPeriod[] = ['day', 'week', 'month'];
    const validPlatforms = ['boss', 'zhilian', 'liepin', '51job'];

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: '不支持的统计类型' },
        { status: 400 }
      );
    }

    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { success: false, error: '不支持的统计周期' },
        { status: 400 }
      );
    }

    if (!isValidJobId(jobId) || !isValidDate(startDate) || !isValidDate(endDate)) {
      return NextResponse.json(
        { success: false, error: '请求参数格式不正确' },
        { status: 400 }
      );
    }

    if (platform && !validPlatforms.includes(platform)) {
      return NextResponse.json(
        { success: false, error: '不支持的平台类型' },
        { status: 400 }
      );
    }

    const client = (await getClient()) as QueryableClient;

    try {
      let accessibleJobIds = await getAccessibleAutoGreetingJobIds(client, authResult.auth);

      if (ownerUserId && isAutoGreetingSuperAdmin(authResult.auth.role)) {
        accessibleJobIds = await getOwnedAutoGreetingJobIds(client, ownerUserId);
      }

      if (jobId && accessibleJobIds !== null && !accessibleJobIds.includes(jobId)) {
        return NextResponse.json(
          { success: false, error: '岗位不存在或无权访问' },
          { status: 404 }
        );
      }

      const scope: StatsScope = {
        jobIds: jobId ? [jobId] : accessibleJobIds,
        startDate,
        endDate,
        period,
      };

      let data: unknown;
      switch (type) {
        case 'overview':
          data = await getOverviewStats(client, scope);
          break;
        case 'job':
          data = await getJobStats(client, scope, jobId);
          break;
        case 'trend':
          data = await getTrendStats(client, scope);
          break;
        case 'platform':
          data = await getPlatformStats(client, scope, platform);
          break;
        case 'candidate':
          data = await getCandidateStats(client, scope);
          break;
        case 'performance':
          data = await getPerformanceStats(client, scope);
          break;
      }

      return NextResponse.json({
        success: true,
        data,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: '当前版本不支持手动写入统计数据' },
    { status: 405 }
  );
}
