/**
 * 岗位管理 API - 详情、更新、删除
 * 
 * GET /api/auto-greeting/jobs/[id] - 获取岗位详情
 * PUT /api/auto-greeting/jobs/[id] - 更新岗位
 * DELETE /api/auto-greeting/jobs/[id] - 删除岗位
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { ensureAutoGreetingJobPositionsTable } from '@/lib/db/ensure-auto-greeting-job-positions-table';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import {
  canAccessAutoGreetingJob,
  canManageAutoGreetingJob,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';

// 获取岗位详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingJobPositionsTable();
    const { id } = await params;
    const client = await getClient();

    const canAccess = await canAccessAutoGreetingJob(client, id, authResult.auth);
    if (!canAccess) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在或无权访问' },
        { status: 404 }
      );
    }

    const result = await client.query(`
      SELECT * FROM ag_job_positions WHERE id = $1
    `, [id]);

    client.release();

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '岗位不存在' },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        department: row.department,
        location: row.location,
        salaryMin: row.salary_min,
        salaryMax: row.salary_max,
        requirements: row.requirements,
        highlights: row.highlights || [],
        companyIntro: row.company_intro,
        companySize: row.company_size,
        companyIndustry: row.company_industry,
        targetPlatforms: row.target_platforms,
        matchThreshold: row.match_threshold,
        secondGreetingEnabled: row.second_greeting_enabled,
        secondGreetingDelayHours: row.second_greeting_delay_hours,
        humanSimulation: row.human_simulation,
        autoReplyConfig: row.auto_reply_config,
        status: row.status,
        stats: row.stats,
        isGlobal: Boolean(row.is_global),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });

  } catch (error) {
    console.error('获取岗位详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取岗位详情失败' },
      { status: 500 }
    );
  }
}

// 更新岗位
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingJobPositionsTable();
    const { id } = await params;
    const body = await request.json();

    const client = await getClient();

    const canManage = await canManageAutoGreetingJob(client, id, authResult.auth);
    if (!canManage) {
      client.release();
      return NextResponse.json(
        { success: false, error: '你没有权限修改该岗位' },
        { status: 403 }
      );
    }

    // 先检查岗位是否存在
    const checkResult = await client.query(`
      SELECT id, position_id, status FROM ag_job_positions WHERE id = $1
    `, [id]);

    if (checkResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在' },
        { status: 404 }
      );
    }

    // 构建更新字段
    const updateFields: string[] = [];
    const updateValues: Array<string | number | boolean | Date | null> = [];
    let paramIndex = 1;

    const fieldMapping: Record<string, string> = {
      name: 'name',
      department: 'department',
      location: 'location',
      salaryMin: 'salary_min',
      salaryMax: 'salary_max',
      requirements: 'requirements',
      highlights: 'highlights',
      companyIntro: 'company_intro',
      companySize: 'company_size',
      companyIndustry: 'company_industry',
      targetPlatforms: 'target_platforms',
      matchThreshold: 'match_threshold',
      secondGreetingEnabled: 'second_greeting_enabled',
      secondGreetingDelayHours: 'second_greeting_delay_hours',
      humanSimulation: 'human_simulation',
      autoReplyConfig: 'auto_reply_config',
      status: 'status',
    };

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (body[key] !== undefined) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        
        // JSON 字段处理
        if (['requirements', 'highlights', 'targetPlatforms', 'humanSimulation', 'autoReplyConfig', 'stats'].includes(key)) {
          updateValues.push(JSON.stringify(body[key]));
        } else {
          updateValues.push(body[key]);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '没有需要更新的字段' },
        { status: 400 }
      );
    }

    // 添加 updated_at
    updateFields.push(`updated_at = $${paramIndex}`);
    updateValues.push(new Date());
    paramIndex++;

    // 添加 id 作为 WHERE 条件
    updateValues.push(id);

    await client.query(`
      UPDATE ag_job_positions 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    client.release();

    return NextResponse.json({
      success: true,
      message: '岗位更新成功',
    });

  } catch (error) {
    console.error('更新岗位失败:', error);
    return NextResponse.json(
      { success: false, error: '更新岗位失败' },
      { status: 500 }
    );
  }
}

// 删除岗位
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const { id } = await params;
    const client = await getClient();

    const canManage = await canManageAutoGreetingJob(client, id, authResult.auth);
    if (!canManage) {
      client.release();
      return NextResponse.json(
        { success: false, error: '你没有权限删除该岗位' },
        { status: 403 }
      );
    }

    // 先检查岗位是否存在
    const checkResult = await client.query(`
      SELECT id FROM ag_job_positions WHERE id = $1
    `, [id]);

    if (checkResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在' },
        { status: 404 }
      );
    }
    // 统一归档隐藏，避免同步源岗位被再次同步回来，也避免手动岗位误删后无法追溯。
    await client.query(`
      UPDATE ag_job_positions
      SET status = 'archived', updated_at = NOW()
      WHERE id = $1
    `, [id]);

    client.release();

    return NextResponse.json({
      success: true,
      message: '岗位已归档并从默认列表中隐藏',
    });

  } catch (error) {
    console.error('删除岗位失败:', error);
    return NextResponse.json(
      { success: false, error: '删除岗位失败' },
      { status: 500 }
    );
  }
}
