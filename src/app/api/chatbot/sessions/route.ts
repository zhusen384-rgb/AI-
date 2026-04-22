import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import { chatSessions } from '@/storage/database/shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { ensureChatbotTables } from '@/lib/db/ensure-chatbot-tables';

/**
 * GET /api/chatbot/sessions - 获取用户的对话历史列表
 * POST /api/chatbot/sessions - 创建新对话
 */
export async function GET(req: NextRequest) {
  try {
    // 从请求头获取用户信息
    const userId = req.headers.get('x-user-id');
    const tenantId = req.headers.get('x-tenant-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 获取用户的对话会话列表
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(20);

    return NextResponse.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error('获取对话历史失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取对话历史失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chatbot/sessions - 创建新对话会话
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    const tenantId = req.headers.get('x-tenant-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await req.json();
    const { title, currentPage, userAgent } = body;

    await ensureChatbotTables();
    const db = await getDb();

    // 创建新的对话会话
    const [session] = await db
      .insert(chatSessions)
      .values({
        userId,
        tenantId: tenantId || null,
        title: title || null,
        currentPage: currentPage || null,
        userAgent: userAgent || null,
        metadata: null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('创建对话会话失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建对话会话失败',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/chatbot/sessions - 更新对话会话
 */
export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, title, currentPage } = body;

    if (!sessionId) {
      return NextResponse.json({ error: '缺少会话ID' }, { status: 400 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 更新对话会话
    const [session] = await db
      .update(chatSessions)
      .set({
        title,
        currentPage,
        updatedAt: new Date(),
      })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .returning();

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('更新对话会话失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新对话会话失败',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chatbot/sessions - 删除对话会话
 */
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '缺少会话ID' }, { status: 400 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 删除对话会话（会级联删除所有消息）
    await db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));

    return NextResponse.json({
      success: true,
      message: '对话会话已删除',
    });
  } catch (error) {
    console.error('删除对话会话失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除对话会话失败',
      },
      { status: 500 }
    );
  }
}
