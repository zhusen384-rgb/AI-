/**
 * 岗位管理 API - 列表和创建
 * 
 * GET /api/auto-greeting/jobs - 获取岗位列表
 * POST /api/auto-greeting/jobs - 创建岗位
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { DEFAULT_HUMAN_SIMULATION_CONFIG, DEFAULT_AUTO_REPLY_CONFIG } from '@/lib/auto-greeting/constants';
import { ensureAutoGreetingJobPositionsTable } from '@/lib/db/ensure-auto-greeting-job-positions-table';
import { syncAutoGreetingJobsFromInterviewerPositions } from '@/lib/auto-greeting/sync-interviewer-positions';
import {
  canManageAutoGreetingJob,
  isAutoGreetingSuperAdmin,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';

// 获取岗位列表
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingJobPositionsTable();
    let syncWarning: string | null = null;
    try {
      await syncAutoGreetingJobsFromInterviewerPositions();
    } catch (error) {
      console.error('同步面试官岗位到自动打招呼岗位失败:', error);
      syncWarning = '同步源岗位失败，已回退为仅展示现有自动打招呼岗位';
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const status = searchParams.get('status');
    const keyword = searchParams.get('keyword');
    const { auth } = authResult;

    const client = await getClient();

    const whereParts: string[] = [];
    const queryParams: Array<string | number | null> = [];

    if (!isAutoGreetingSuperAdmin(auth.role)) {
      queryParams.push(auth.userId);
      whereParts.push(`created_by_id = $${queryParams.length}`);
    }

    if (status && status !== 'all') {
      queryParams.push(status);
      whereParts.push(`status = $${queryParams.length}`);
    }

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      const index = queryParams.length;
      whereParts.push(`(name ILIKE $${index} OR department ILIKE $${index} OR location ILIKE $${index})`);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // 查询总数
    const countResult = await client.query(
      `
        SELECT COUNT(*) as total
        FROM ag_job_positions
        ${whereClause}
      `,
      queryParams
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // 查询列表
    const offset = (page - 1) * pageSize;
    const listParams = [...queryParams, pageSize, offset];
    const result = await client.query(
      `
        SELECT * FROM ag_job_positions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
      `,
      listParams
    );

    // 格式化返回数据
    const jobs = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      department: row.department,
      location: row.location,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      requirements: row.requirements,
      highlights: row.highlights || [],
      targetPlatforms: row.target_platforms,
      matchThreshold: row.match_threshold,
      status: row.status,
      stats: row.stats,
      positionId: row.position_id, // 关联面试官系统岗位ID
      isGlobal: Boolean(row.is_global),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    client.release();

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        syncWarning,
      },
    });

  } catch (error) {
    console.error('获取岗位列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取岗位列表失败' },
      { status: 500 }
    );
  }
}

// 创建岗位
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingJobPositionsTable();

    const body = await request.json();
    const {
      name,
      department,
      location,
      salaryMin,
      salaryMax,
      requirements,
      highlights = [],
      companyIntro,
      companySize,
      companyIndustry,
      targetPlatforms,
      matchThreshold = 60,
      secondGreetingEnabled = false,
      secondGreetingDelayHours = 24,
      humanSimulation = {},
      autoReplyConfig = {},
      positionId, // 关联面试官系统岗位ID
    } = body;
    const { auth } = authResult;
    const normalizedLocation = typeof location === 'string' && location.trim() ? location.trim() : '待补充';
    const normalizedPlatforms = Array.isArray(targetPlatforms) && targetPlatforms.length > 0
      ? targetPlatforms
      : ['boss'];

    // 验证必填字段
    if (!name || !requirements) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 验证目标平台
    const client = await getClient();

    if (positionId) {
      const existing = await client.query(
        `SELECT id FROM ag_job_positions WHERE position_id = $1 LIMIT 1`,
        [positionId]
      );

      if (existing.rows.length > 0) {
        const existingId = existing.rows[0].id;
        const canManage = await canManageAutoGreetingJob(client, String(existingId), auth);
        if (!canManage) {
          client.release();
          return NextResponse.json(
            { success: false, error: '你没有权限修改该岗位' },
            { status: 403 }
          );
        }

        await client.query(
          `
            UPDATE ag_job_positions
            SET
              name = $1,
              department = $2,
              location = $3,
              salary_min = $4,
              salary_max = $5,
              requirements = $6,
              highlights = $7,
              target_platforms = $8,
              match_threshold = $9,
              updated_at = NOW()
            WHERE id = $10
          `,
          [
            name,
            department || null,
            normalizedLocation,
            salaryMin || null,
            salaryMax || null,
            JSON.stringify(requirements),
            JSON.stringify(highlights),
            JSON.stringify(normalizedPlatforms),
            matchThreshold,
            existingId,
          ]
        );

        client.release();

        return NextResponse.json({
          success: true,
          data: {
            id: existingId,
            name,
            message: '岗位同步更新成功',
          },
        });
      }
    }

    // 合并默认配置
    const finalHumanSimulation = {
      ...DEFAULT_HUMAN_SIMULATION_CONFIG,
      ...humanSimulation,
    };

    const finalAutoReplyConfig = {
      ...DEFAULT_AUTO_REPLY_CONFIG,
      ...autoReplyConfig,
    };

    // 插入数据
    const result = await client.query(`
      INSERT INTO ag_job_positions (
        name, department, location, salary_min, salary_max,
        requirements, highlights, company_intro, company_size, company_industry,
        target_platforms, match_threshold,
        second_greeting_enabled, second_greeting_delay_hours,
        human_simulation, auto_reply_config,
        status, stats, position_id, created_by_id, tenant_id, is_global, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12,
        $13, $14,
        $15, $16,
        $17, $18, $19, $20, $21, $22, NOW(), NOW()
      ) RETURNING id
    `, [
      name,
      department || null,
      normalizedLocation,
      salaryMin || null,
      salaryMax || null,
      JSON.stringify(requirements),
      JSON.stringify(highlights),
      companyIntro || null,
      companySize || null,
      companyIndustry || null,
      JSON.stringify(normalizedPlatforms),
      matchThreshold,
      secondGreetingEnabled,
      secondGreetingDelayHours,
      JSON.stringify(finalHumanSimulation),
      JSON.stringify(finalAutoReplyConfig),
      'active',
      JSON.stringify({
        totalGreeted: 0,
        totalReplied: 0,
        totalHighIntent: 0,
        totalResumeReceived: 0,
        totalContactReceived: 0,
        lastStatUpdate: new Date().toISOString(),
      }),
      positionId || null,
      auth.userId,
      auth.tenantId || null,
      false,
    ]);

    const jobId = result.rows[0]?.id;

    client.release();

    return NextResponse.json({
      success: true,
      data: {
        id: jobId,
        name,
        message: '岗位创建成功',
      },
    });

  } catch (error) {
    console.error('创建岗位失败:', error);
    return NextResponse.json(
      { success: false, error: '创建岗位失败' },
      { status: 500 }
    );
  }
}
