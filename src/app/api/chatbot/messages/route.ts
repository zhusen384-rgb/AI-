import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import { chatMessages } from '@/storage/database/shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ensureChatbotTables } from '@/lib/db/ensure-chatbot-tables';

/**
 * GET /api/chatbot/messages - 获取对话消息列表
 */
export async function GET(req: NextRequest) {
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

    // 获取对话消息列表
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error('获取对话消息失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取对话消息失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chatbot/messages - 保存对话消息
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, role, content, messageType, attachmentUrl, metadata } = body;

    if (!sessionId || !content) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 保存对话消息
    const [message] = await db
      .insert(chatMessages)
      .values({
        sessionId,
        role,
        content,
        messageType: messageType || 'text',
        attachmentUrl: attachmentUrl || null,
        metadata: metadata || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('保存对话消息失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '保存对话消息失败',
      },
      { status: 500 }
    );
  }
}
