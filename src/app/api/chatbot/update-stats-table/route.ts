import { NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import { sql } from 'drizzle-orm';

/**
 * 更新聊天机器人表结构 - 添加新字段
 */
export async function POST() {
  try {
    console.log('开始更新数据库表结构...');

    const db = await getDb();

    // 添加 is_difficult 字段
    console.log('添加 is_difficult 字段...');
    await db.execute(sql`
      ALTER TABLE chat_question_stats 
      ADD COLUMN IF NOT EXISTS is_difficult BOOLEAN DEFAULT FALSE NOT NULL
    `);

    // 添加 answer_length 字段
    console.log('添加 answer_length 字段...');
    await db.execute(sql`
      ALTER TABLE chat_question_stats 
      ADD COLUMN IF NOT EXISTS answer_length INTEGER
    `);

    // 创建索引（如果不存在）
    console.log('创建索引...');
    try {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_chat_question_stats_is_difficult 
        ON chat_question_stats(is_difficult)
      `);
    } catch (e) {
      console.log('索引可能已存在，跳过');
    }

    console.log('✅ 数据库更新成功！');

    return NextResponse.json({
      success: true,
      message: '数据库表结构更新成功',
      addedFields: ['is_difficult', 'answer_length'],
    });
  } catch (error) {
    console.error('❌ 数据库更新失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '数据库更新失败',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
