/**
 * 话术管理 API - 详情、更新、删除
 * 
 * GET /api/auto-greeting/templates/[id] - 获取话术详情
 * PUT /api/auto-greeting/templates/[id] - 更新话术
 * DELETE /api/auto-greeting/templates/[id] - 删除话术
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { ensureAutoGreetingTemplatesTable } from '@/lib/db/ensure-auto-greeting-templates-table';
import {
  canAccessAutoGreetingTemplate,
  canManageAutoGreetingJob,
  canManageAutoGreetingTemplate,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';

// 获取话术详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingTemplatesTable();
    const { id } = await params;
    const client = await getClient();

    const canAccess = await canAccessAutoGreetingTemplate(client, id, authResult.auth);
    if (!canAccess) {
      client.release();
      return NextResponse.json(
        { success: false, error: '话术不存在或无权访问' },
        { status: 404 }
      );
    }

    const result = await client.query(`
      SELECT * FROM ag_greeting_templates WHERE id = $1
    `, [id]);

    client.release();

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '话术不存在' },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });

  } catch (error) {
    console.error('获取话术详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取话术详情失败' },
      { status: 500 }
    );
  }
}

// 更新话术
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingTemplatesTable();
    const { id } = await params;
    const body = await request.json();

    const client = await getClient();

    const canManage = await canManageAutoGreetingTemplate(client, id, authResult.auth);
    if (!canManage) {
      client.release();
      return NextResponse.json(
        { success: false, error: '你没有权限修改该话术' },
        { status: 403 }
      );
    }

    if (body.jobId) {
      const canManageTargetJob = await canManageAutoGreetingJob(client, body.jobId, authResult.auth);
      if (!canManageTargetJob) {
        client.release();
        return NextResponse.json(
          { success: false, error: '你没有权限将话术关联到该岗位' },
          { status: 403 }
        );
      }
    }

    // 先检查话术是否存在
    const checkResult = await client.query(`
      SELECT id FROM ag_greeting_templates WHERE id = $1
    `, [id]);

    if (checkResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '话术不存在' },
        { status: 404 }
      );
    }

    // 构建更新字段
    const updateFields: string[] = [];
    const updateValues: Array<string | boolean | Date | null> = [];
    let paramIndex = 1;

    const fieldMapping: Record<string, string> = {
      jobId: 'job_id',
      type: 'type',
      platform: 'platform',
      template: 'template',
      variables: 'variables',
      isActive: 'is_active',
    };

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (body[key] !== undefined) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        
        // JSON 字段处理
        if (key === 'variables') {
          updateValues.push(body[key] ? JSON.stringify(body[key]) : null);
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
      UPDATE ag_greeting_templates 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `, updateValues);

    client.release();

    return NextResponse.json({
      success: true,
      message: '话术更新成功',
    });

  } catch (error) {
    console.error('更新话术失败:', error);
    return NextResponse.json(
      { success: false, error: '更新话术失败' },
      { status: 500 }
    );
  }
}

// 删除话术
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingTemplatesTable();
    const { id } = await params;
    const client = await getClient();

    const canManage = await canManageAutoGreetingTemplate(client, id, authResult.auth);
    if (!canManage) {
      client.release();
      return NextResponse.json(
        { success: false, error: '你没有权限删除该话术' },
        { status: 403 }
      );
    }

    // 先检查话术是否存在
    const checkResult = await client.query(`
      SELECT id, use_count FROM ag_greeting_templates WHERE id = $1
    `, [id]);

    if (checkResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '话术不存在' },
        { status: 404 }
      );
    }

    // 硬删除
    await client.query(`
      DELETE FROM ag_greeting_templates WHERE id = $1
    `, [id]);

    client.release();

    return NextResponse.json({
      success: true,
      message: '话术删除成功',
    });

  } catch (error) {
    console.error('删除话术失败:', error);
    return NextResponse.json(
      { success: false, error: '删除话术失败' },
      { status: 500 }
    );
  }
}
