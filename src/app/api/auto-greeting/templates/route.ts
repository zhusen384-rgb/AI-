/**
 * 话术管理 API - 列表和创建
 * 
 * GET /api/auto-greeting/templates - 获取话术列表
 * POST /api/auto-greeting/templates - 创建话术
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { ensureAutoGreetingTemplatesTable } from '@/lib/db/ensure-auto-greeting-templates-table';
import {
  canManageAutoGreetingJob,
  isAutoGreetingSuperAdmin,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';

// 获取话术列表
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingTemplatesTable();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const jobId = searchParams.get('jobId');
    const platform = searchParams.get('platform');
    const type = searchParams.get('type');
    const keyword = searchParams.get('keyword');
    const { auth } = authResult;

    const client = await getClient();

    // 构建查询条件
    const conditions: string[] = [];
    const params: Array<string | number | null> = [];
    let paramIndex = 1;

    if (!isAutoGreetingSuperAdmin(auth.role)) {
      conditions.push(`j.created_by_id = $${paramIndex}`);
      params.push(auth.userId);
      paramIndex += 1;
    }

    if (jobId) {
      conditions.push(`t.job_id = $${paramIndex}`);
      params.push(jobId);
      paramIndex++;
    }
    if (platform && platform !== 'all') {
      conditions.push(`t.platform = $${paramIndex}`);
      params.push(platform);
      paramIndex++;
    }
    if (type && type !== 'all') {
      conditions.push(`t.type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }
    if (keyword) {
      conditions.push(`t.template ILIKE $${paramIndex}`);
      params.push(`%${keyword}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM ag_greeting_templates t INNER JOIN ag_job_positions j ON j.id = t.job_id ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // 查询列表
    const offset = (page - 1) * pageSize;
    const result = await client.query(
      `SELECT t.* FROM ag_greeting_templates t INNER JOIN ag_job_positions j ON j.id = t.job_id ${whereClause} ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    // 格式化返回数据
    const templates = result.rows.map(row => ({
      id: row.id,
      jobId: row.job_id,
      type: row.type,
      platform: row.platform,
      template: row.template,
      variables: row.variables || [],
      isActive: row.is_active,
      useCount: row.use_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    client.release();

    return NextResponse.json({
      success: true,
      data: {
        templates,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });

  } catch (error) {
    console.error('获取话术列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取话术列表失败' },
      { status: 500 }
    );
  }
}

// 创建话术
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingTemplatesTable();
    const body = await request.json();
    const {
      jobId,
      type,
      platform,
      template,
      variables = [],
    } = body;
    const { auth } = authResult;

    // 验证必填字段
    if (!jobId || !type || !platform || !template) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段：jobId, type, platform, template' },
        { status: 400 }
      );
    }

    // 验证话术类型
    const validTypes = ['first', 'second'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: '无效的话术类型，可选值：first, second' },
        { status: 400 }
      );
    }

    // 验证平台
    const validPlatforms = ['boss', 'zhilian', 'liepin', 'all'];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { success: false, error: '无效的平台，可选值：boss, zhilian, liepin, all' },
        { status: 400 }
      );
    }

    const client = await getClient();

    const canManageJob = await canManageAutoGreetingJob(client, jobId, auth);
    if (!canManageJob) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在或你没有权限为其创建话术' },
        { status: 403 }
      );
    }

    // 插入数据
    const result = await client.query(`
      INSERT INTO ag_greeting_templates (
        job_id, type, platform, template, variables, is_active, use_count, created_by_id, tenant_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      ) RETURNING id
    `, [
      jobId,
      type,
      platform,
      template,
      JSON.stringify(variables),
      true,
      0,
      auth.userId,
      auth.tenantId || null,
    ]);

    const templateId = result.rows[0]?.id;

    client.release();

    return NextResponse.json({
      success: true,
      data: {
        id: templateId,
        type,
        platform,
        message: '话术创建成功',
      },
    });

  } catch (error) {
    console.error('创建话术失败:', error);
    return NextResponse.json(
      { success: false, error: '创建话术失败' },
      { status: 500 }
    );
  }
}
