/**
 * 同步面试统计数据
 * 从 full_ai_interview_results 表中读取历史面试记录，同步到 full_ai_interview_statistics 表
 */

import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

async function syncInterviewStatistics() {
  console.log('[同步统计] 开始同步面试统计数据...');

  try {
    const db = await getDb(schema);

    // 获取所有面试结果
    const results = await db
      .select()
      .from(schema.fullAiInterviewResults)
      .orderBy(desc(schema.fullAiInterviewResults.completedAt));

    console.log(`[同步统计] 找到 ${results.length} 条面试记录`);

    // 初始化统计表
    const client = await getDb();
    await client.$client.query(`
      CREATE TABLE IF NOT EXISTS full_ai_interview_statistics (
        id SERIAL PRIMARY KEY,
        link_id TEXT NOT NULL,
        interview_id TEXT NOT NULL,
        candidate_name TEXT NOT NULL,
        position TEXT NOT NULL,
        mode TEXT NOT NULL,
        interview_time TIMESTAMP NOT NULL,
        meeting_link TEXT NOT NULL,
        meeting_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const result of results) {
      const interviewId = result.interviewId;
      const candidateName = result.candidateName;
      const position = result.position;
      const linkId = result.linkId;
      const completedAt = result.completedAt;

      console.log(`[同步统计] 处理面试: ${interviewId}, 候选人: ${candidateName}, 岗位: ${position}`);

      // 检查统计记录是否已存在
      const existingStats = await client.$client.query(
        `SELECT id FROM full_ai_interview_statistics WHERE interview_id = $1`,
        [interviewId]
      );

      if (existingStats.rows.length > 0) {
        console.log(`[同步统计] 面试 ${interviewId} 已存在统计记录，跳过`);
        skippedCount++;
        continue;
      }

      // 从面试会话中获取 mode 和 meeting_link
      const session = await client.$client.query(
        `SELECT mode FROM interview_sessions WHERE interview_id = $1 LIMIT 1`,
        [interviewId]
      );

      const mode = session.rows.length > 0 ? session.rows[0].mode : 'junior';
      const meetingLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/full-ai-interview?linkId=${linkId}`;

      // 插入统计记录
      await client.$client.query(`
        INSERT INTO full_ai_interview_statistics 
        (link_id, interview_id, candidate_name, position, mode, interview_time, meeting_link, meeting_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        linkId,
        interviewId,
        candidateName,
        position,
        mode,
        completedAt,
        meetingLink,
        interviewId,
        'completed'
      ]);

      console.log(`[同步统计] 面试 ${interviewId} 统计记录已创建`);
      syncedCount++;
    }

    console.log(`[同步统计] 同步完成！`);
    console.log(`[同步统计] - 新增记录: ${syncedCount} 条`);
    console.log(`[同步统计] - 跳过记录: ${skippedCount} 条`);
    console.log(`[同步统计] - 总处理: ${results.length} 条`);

    process.exit(0);
  } catch (error) {
    console.error('[同步统计] 同步失败:', error);
    process.exit(1);
  }
}

// 执行同步
syncInterviewStatistics();
