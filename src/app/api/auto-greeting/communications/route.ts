/**
 * 沟通记录 API
 *
 * GET /api/auto-greeting/communications - 获取沟通列表或详情
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import {
  getAccessibleAutoGreetingJobIds,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

interface QueryRow extends Record<string, unknown> {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value?: string | null): boolean {
  return !value || UUID_RE.test(value);
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function formatCommunication(row: QueryRow) {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    jobName: row.job_name ? String(row.job_name) : '',
    name: row.name ? String(row.name) : '',
    platform: row.platform ? String(row.platform) : '',
    platformUserId: row.platform_user_id ? String(row.platform_user_id) : '',
    platformNickname: row.platform_nickname ? String(row.platform_nickname) : '',
    candidateInfo: parseObject(row.candidate_info),
    status: row.status ? String(row.status) : '',
    intentLevel: row.intent_level ? String(row.intent_level) : undefined,
    matchScore: typeof row.match_score === 'number' ? row.match_score : Number(row.match_score || 0),
    firstGreetingTime: row.first_greeting_time ? String(row.first_greeting_time) : undefined,
    lastMessageTime: row.last_message_time ? String(row.last_message_time) : undefined,
    communicationStats: parseObject(row.communication_stats),
    tags: parseStringArray(row.tags),
    createdAt: row.created_at ? String(row.created_at) : '',
  };
}

function formatMessage(row: QueryRow) {
  return {
    id: String(row.id),
    sender: row.sender ? String(row.sender) : '',
    content: row.content ? String(row.content) : '',
    sendTime: row.send_time ? String(row.send_time) : undefined,
    platformMessageId: row.platform_message_id ? String(row.platform_message_id) : undefined,
    isAuto: Boolean(row.is_auto),
    status: row.status ? String(row.status) : '',
    messageType: row.message_type ? String(row.message_type) : 'text',
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
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Number.parseInt(searchParams.get('pageSize') || '20', 10);
    const keyword = searchParams.get('keyword');
    const status = searchParams.get('status');
    const intent = searchParams.get('intent');
    const jobId = searchParams.get('jobId');
    const communicationId = searchParams.get('communicationId');
    const platform = searchParams.get('platform');
    const platformUserId = searchParams.get('platformUserId');

    if (!isValidUuid(jobId) || !isValidUuid(communicationId)) {
      return NextResponse.json(
        { success: false, error: '参数格式不正确' },
        { status: 400 }
      );
    }

    const client = await getClient();

    try {
      const accessibleJobIds = await getAccessibleAutoGreetingJobIds(client, authResult.auth);

      if (jobId && accessibleJobIds !== null && !accessibleJobIds.includes(jobId)) {
        return NextResponse.json(
          { success: false, error: '岗位不存在或无权访问' },
          { status: 404 }
        );
      }

      const scopedJobIds = jobId ? [jobId] : accessibleJobIds;

      if (jobId && platform && platformUserId) {
        const detailParams: unknown[] = [jobId, platform, platformUserId];
        const detailConditions = [
          'c.job_id = $1',
          'c.platform = $2',
          'c.platform_user_id = $3',
        ];

        if (scopedJobIds !== null) {
          detailParams.push(scopedJobIds);
          detailConditions.push(`c.job_id = ANY($${detailParams.length}::uuid[])`);
        }

        const detailResult = await client.query(
          `
            SELECT c.*, j.name as job_name
            FROM ag_candidate_communications c
            INNER JOIN ag_job_positions j ON j.id = c.job_id
            WHERE ${detailConditions.join(' AND ')}
            LIMIT 1
          `,
          detailParams
        );

        if (detailResult.rows.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              communication: null,
              messages: [],
            },
          });
        }

        const resolvedCommunicationId = String(detailResult.rows[0].id);
        const messagesResult = await client.query(
          `
            SELECT *
            FROM ag_messages
            WHERE communication_id = $1
            ORDER BY send_time ASC NULLS LAST, created_at ASC
          `,
          [resolvedCommunicationId]
        );

        return NextResponse.json({
          success: true,
          data: {
            communication: formatCommunication(detailResult.rows[0]),
            messages: messagesResult.rows.map(formatMessage),
          },
        });
      }

      if (communicationId) {
        const detailParams: unknown[] = [communicationId];
        const detailConditions = ['c.id = $1'];

        if (scopedJobIds !== null) {
          detailParams.push(scopedJobIds);
          detailConditions.push(`c.job_id = ANY($${detailParams.length}::uuid[])`);
        }

        const detailResult = await client.query(
          `
            SELECT c.*, j.name as job_name
            FROM ag_candidate_communications c
            INNER JOIN ag_job_positions j ON j.id = c.job_id
            WHERE ${detailConditions.join(' AND ')}
            LIMIT 1
          `,
          detailParams
        );

        if (detailResult.rows.length === 0) {
          return NextResponse.json(
            { success: false, error: '沟通记录不存在或无权访问' },
            { status: 404 }
          );
        }

        const messagesResult = await client.query(
          `
            SELECT *
            FROM ag_messages
            WHERE communication_id = $1
            ORDER BY send_time ASC NULLS LAST, created_at ASC
          `,
          [communicationId]
        );

        return NextResponse.json({
          success: true,
          data: {
            communication: formatCommunication(detailResult.rows[0]),
            messages: messagesResult.rows.map(formatMessage),
          },
        });
      }

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (scopedJobIds !== null) {
        params.push(scopedJobIds);
        conditions.push(`c.job_id = ANY($${params.length}::uuid[])`);
      }

      if (status && status !== 'all') {
        params.push(status);
        conditions.push(`c.status = $${params.length}`);
      }

      if (intent && intent !== 'all') {
        params.push(intent);
        conditions.push(`c.intent_level = $${params.length}`);
      }

      if (keyword) {
        params.push(`%${keyword}%`);
        const keywordIndex = params.length;
        conditions.push(
          `(c.name ILIKE $${keywordIndex} OR c.platform_nickname ILIKE $${keywordIndex} OR COALESCE(c.candidate_info->>'currentCompany', '') ILIKE $${keywordIndex})`
        );
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `
          SELECT COUNT(*) as total
          FROM ag_candidate_communications c
          ${whereClause}
        `,
        params
      );

      const offset = (page - 1) * pageSize;
      const listResult = await client.query(
        `
          SELECT c.*, j.name as job_name
          FROM ag_candidate_communications c
          INNER JOIN ag_job_positions j ON j.id = c.job_id
          ${whereClause}
          ORDER BY COALESCE(c.last_message_time, c.created_at) DESC
          LIMIT $${params.length + 1}
          OFFSET $${params.length + 2}
        `,
        [...params, pageSize, offset]
      );

      const total = Number.parseInt(String(countResult.rows[0]?.total || 0), 10);

      return NextResponse.json({
        success: true,
        data: {
          communications: listResult.rows.map(formatCommunication),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('获取沟通记录失败:', error);
    return NextResponse.json(
      { success: false, error: '获取沟通记录失败' },
      { status: 500 }
    );
  }
}
