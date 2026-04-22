import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import { chatQuestionStats } from '@/storage/database/shared/schema';
import { eq, and, desc, sql, count, isNotNull } from 'drizzle-orm';
import { ensureChatbotTables } from '@/lib/db/ensure-chatbot-tables';

/**
 * POST /api/chatbot/stats - 记录提问统计
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    const tenantId = req.headers.get('x-tenant-id');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await req.json();
    const {
      question,
      questionCategory,
      currentPage,
      responseTime,
      answerQuality,
      wasHelpful,
      isDifficult,
      answerLength,
    } = body;

    if (!question) {
      return NextResponse.json({ error: '缺少问题内容' }, { status: 400 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 记录提问统计
    const [stat] = await db
      .insert(chatQuestionStats)
      .values({
        userId,
        tenantId: tenantId || null,
        question,
        questionCategory: questionCategory || null,
        currentPage: currentPage || null,
        responseTime: responseTime || null,
        answerQuality: answerQuality || null,
        wasHelpful: wasHelpful || null,
        isDifficult: isDifficult || false,
        answerLength: answerLength || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      stat,
    });
  } catch (error) {
    console.error('记录提问统计失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '记录提问统计失败',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chatbot/stats - 获取提问统计数据（用于分析和优化）
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    const userRole = req.headers.get('x-user-role');

    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    await ensureChatbotTables();
    const db = await getDb();

    // 只有管理员可以查看全局统计
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'tenant_admin';

    // 获取常见问题分类统计
    const categoryStats = await db
      .select({
        category: chatQuestionStats.questionCategory,
        count: count(),
      })
      .from(chatQuestionStats)
      .where(isAdmin ? undefined : eq(chatQuestionStats.userId, userId))
      .groupBy(chatQuestionStats.questionCategory);

    // 获取高频问题（出现次数最多的前10个问题）
    const frequentQuestions = await db
      .select({
        question: chatQuestionStats.question,
        category: chatQuestionStats.questionCategory,
        count: count(),
      })
      .from(chatQuestionStats)
      .where(isAdmin ? undefined : eq(chatQuestionStats.userId, userId))
      .groupBy(chatQuestionStats.question, chatQuestionStats.questionCategory)
      .orderBy(desc(count()))
      .limit(10);

    // 获取疑难问题列表（需要重点关注的问题）
    const difficultQuestions = await db
      .select()
      .from(chatQuestionStats)
      .where(
        and(
          isAdmin ? undefined : eq(chatQuestionStats.userId, userId),
          eq(chatQuestionStats.isDifficult, true)
        )
      )
      .orderBy(desc(chatQuestionStats.createdAt))
      .limit(20);

    // 获取满意度统计
    const satisfactionStats = await db
      .select({
        wasHelpful: chatQuestionStats.wasHelpful,
        count: count(),
      })
      .from(chatQuestionStats)
      .where(
        and(
          isAdmin ? undefined : eq(chatQuestionStats.userId, userId),
          isNotNull(chatQuestionStats.wasHelpful)
        )
      )
      .groupBy(chatQuestionStats.wasHelpful);

    // 计算满意度
    const helpfulCount = satisfactionStats.find(s => s.wasHelpful === true)?.count || 0;
    const notHelpfulCount = satisfactionStats.find(s => s.wasHelpful === false)?.count || 0;
    const totalFeedback = helpfulCount + notHelpfulCount;
    const satisfactionRate = totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 0;

    // 获取平均响应时间
    const avgResponseTime = await db
      .select({
        avg: sql<number>`AVG(response_time)`,
      })
      .from(chatQuestionStats)
      .where(
        and(
          isAdmin ? undefined : eq(chatQuestionStats.userId, userId),
          isNotNull(chatQuestionStats.responseTime)
        )
      );

    // 获取最近问题趋势（按天统计最近7天）
    const recentTrend = await db
      .select({
        date: sql<string>`DATE(created_at)`,
        count: count(),
        difficultCount: sql<number>`SUM(CASE WHEN is_difficult THEN 1 ELSE 0 END)`,
      })
      .from(chatQuestionStats)
      .where(
        and(
          isAdmin ? undefined : eq(chatQuestionStats.userId, userId),
          sql`created_at >= NOW() - INTERVAL '7 days'`
        )
      )
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    return NextResponse.json({
      success: true,
      stats: {
        categoryStats,
        frequentQuestions,
        difficultQuestions,
        satisfaction: {
          helpfulCount,
          notHelpfulCount,
          satisfactionRate,
        },
        avgResponseTime: avgResponseTime[0]?.avg || 0,
        recentTrend,
      },
    });
  } catch (error) {
    console.error('获取提问统计失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取提问统计失败',
      },
      { status: 500 }
    );
  }
}
