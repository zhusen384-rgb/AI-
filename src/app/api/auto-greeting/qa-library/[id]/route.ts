import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { requireAutoGreetingAuth, isAutoGreetingSuperAdmin } from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';

async function canManageQaItem(
  client: Awaited<ReturnType<typeof getClient>>,
  id: string,
  auth: { userId: string; tenantId?: string; role?: string }
) {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT q.id
      FROM ag_qa_library q
      LEFT JOIN ag_job_positions j ON j.id = q.job_id
      WHERE q.id = $1
        AND (
          q.job_id IS NULL
          OR j.created_by_id = $2
        )
      LIMIT 1
    `,
    [id, auth.userId]
  );

  return result.rows.length > 0;
}

export async function PUT(
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
    const body = await request.json();
    const client = await getClient();

    try {
      const canManage = await canManageQaItem(client, id, authResult.auth);
      if (!canManage) {
        return NextResponse.json(
          { success: false, error: '问答库不存在或无权修改' },
          { status: 404 }
        );
      }

      const updateFields: string[] = [];
      const values: Array<unknown> = [];
      let index = 1;

      const fieldMap: Record<string, string> = {
        category: 'category',
        triggerKeywords: 'trigger_keywords',
        questionExamples: 'question_examples',
        answer: 'answer',
        platformAnswers: 'platform_answers',
        priority: 'priority',
        isActive: 'is_active',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (body[key] === undefined) {
          continue;
        }

        updateFields.push(`${dbField} = $${index}`);
        if (['triggerKeywords', 'questionExamples', 'platformAnswers'].includes(key)) {
          values.push(JSON.stringify(body[key]));
        } else {
          values.push(body[key]);
        }
        index += 1;
      }

      if (updateFields.length === 0) {
        return NextResponse.json(
          { success: false, error: '没有需要更新的字段' },
          { status: 400 }
        );
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);

      await client.query(
        `
          UPDATE ag_qa_library
          SET ${updateFields.join(', ')}
          WHERE id = $${index}
        `,
        values
      );

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('更新问答库失败:', error);
    return NextResponse.json(
      { success: false, error: '更新问答库失败' },
      { status: 500 }
    );
  }
}

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

    try {
      const canManage = await canManageQaItem(client, id, authResult.auth);
      if (!canManage) {
        return NextResponse.json(
          { success: false, error: '问答库不存在或无权删除' },
          { status: 404 }
        );
      }

      await client.query(
        `
          DELETE FROM ag_qa_library
          WHERE id = $1
        `,
        [id]
      );

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('删除问答库失败:', error);
    return NextResponse.json(
      { success: false, error: '删除问答库失败' },
      { status: 500 }
    );
  }
}
