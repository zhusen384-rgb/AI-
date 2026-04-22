import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import {
  canManageAutoGreetingJob,
  isAutoGreetingSuperAdmin,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

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
    const jobId = searchParams.get('jobId');
    const category = searchParams.get('category');
    const keyword = searchParams.get('keyword');
    const { auth } = authResult;

    const client = await getClient();

    try {
      const params: Array<string | number | null> = [];
      const conditions: string[] = [];
      let paramIndex = 1;

      if (!isAutoGreetingSuperAdmin(auth.role)) {
        conditions.push(
          `(
            q.job_id IS NULL
            OR EXISTS (
              SELECT 1 FROM ag_job_positions j
              WHERE j.id = q.job_id
                AND j.created_by_id = $${paramIndex}
            )
          )`
        );
        params.push(auth.userId);
        paramIndex += 1;
      }

      if (jobId) {
        conditions.push(`q.job_id = $${paramIndex}`);
        params.push(jobId);
        paramIndex += 1;
      }

      if (category && category !== 'all') {
        conditions.push(`q.category = $${paramIndex}`);
        params.push(category);
        paramIndex += 1;
      }

      if (keyword) {
        conditions.push(
          `(q.answer ILIKE $${paramIndex} OR CAST(q.trigger_keywords AS TEXT) ILIKE $${paramIndex})`
        );
        params.push(`%${keyword}%`);
        paramIndex += 1;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countResult = await client.query(
        `
          SELECT COUNT(*) AS total
          FROM ag_qa_library q
          ${whereClause}
        `,
        params
      );

      const offset = (page - 1) * pageSize;
      const result = await client.query(
        `
          SELECT q.*
          FROM ag_qa_library q
          ${whereClause}
          ORDER BY q.priority ASC, q.created_at DESC
          LIMIT $${paramIndex}
          OFFSET $${paramIndex + 1}
        `,
        [...params, pageSize, offset]
      );

      return NextResponse.json({
        success: true,
        data: {
          items: result.rows.map(row => ({
            id: row.id,
            jobId: row.job_id,
            category: row.category,
            triggerKeywords: row.trigger_keywords,
            questionExamples: row.question_examples || [],
            answer: row.answer,
            platformAnswers: row.platform_answers || [],
            priority: row.priority || 100,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
          total: Number.parseInt(String(countResult.rows[0]?.total || 0), 10),
          page,
          pageSize,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('获取问答库失败:', error);
    return NextResponse.json(
      { success: false, error: '获取问答库失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await request.json();
    const {
      jobId = null,
      category,
      triggerKeywords,
      questionExamples = [],
      answer,
      platformAnswers = [],
      priority = 100,
      isActive = true,
    } = body;

    if (!category || !triggerKeywords || !answer) {
      return NextResponse.json(
        { success: false, error: '缺少必要字段：category, triggerKeywords, answer' },
        { status: 400 }
      );
    }

    const client = await getClient();

    try {
      if (jobId) {
        const canManageJob = await canManageAutoGreetingJob(client, jobId, authResult.auth);
        if (!canManageJob) {
          return NextResponse.json(
            { success: false, error: '岗位不存在或无权操作该岗位问答库' },
            { status: 403 }
          );
        }
      }

      const result = await client.query(
        `
          INSERT INTO ag_qa_library (
            job_id, category, trigger_keywords, question_examples,
            answer, platform_answers, priority, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, NOW(), NOW()
          )
          RETURNING id
        `,
        [
          jobId,
          category,
          JSON.stringify(triggerKeywords),
          JSON.stringify(questionExamples),
          answer,
          JSON.stringify(platformAnswers),
          priority,
          isActive,
        ]
      );

      return NextResponse.json({
        success: true,
        data: {
          id: result.rows[0]?.id,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('创建问答库失败:', error);
    return NextResponse.json(
      { success: false, error: '创建问答库失败' },
      { status: 500 }
    );
  }
}
