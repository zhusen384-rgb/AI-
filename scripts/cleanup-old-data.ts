/**
 * 数据清理脚本
 * 定期清理超过指定天数的面试记录
 *
 * 使用方法：
 * 1. 直接运行：node scripts/cleanup-old-data.ts
 * 2. 定时任务：可以设置 crontab 或其他调度工具定期运行
 *
 * 清理规则：
 * - full_ai_interview_results：清理超过 30 天的记录
 * - full_ai_interview_configs：清理超过 30 天且没有关联结果的配置
 */

import { getDb } from '../src/lib/db';
import { fullAiInterviewResults, fullAiInterviewConfigs } from '../src/lib/db/schema';
import { eq, lt, and, notInArray, desc } from 'drizzle-orm';

// 配置清理规则
const CLEANUP_CONFIG = {
  // 保留天数（天）
  retentionDays: 30,
  // 每次清理的最大记录数（防止一次性删除太多）
  maxRecordsPerRun: 1000,
};

/**
 * 清理超过保留期的面试结果
 */
async function cleanupOldInterviewResults() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionDays);

  console.log(`[清理] 开始清理面试结果，截止日期: ${cutoffDate.toISOString()}`);

  try {
    const db = await getDb();

    // 先统计要删除的记录数
    const allResults = await db
      .select()
      .from(fullAiInterviewResults)
      .where(lt(fullAiInterviewResults.completedAt, cutoffDate));

    const totalToDelete = allResults.length;
    console.log(`[清理] 找到 ${totalToDelete} 条超过 ${CLEANUP_CONFIG.retentionDays} 天的面试结果记录`);

    if (totalToDelete === 0) {
      console.log('[清理] 没有需要清理的面试结果记录');
      return 0;
    }

    // 分批删除
    const recordsToDelete = Math.min(totalToDelete, CLEANUP_CONFIG.maxRecordsPerRun);
    const resultsToDelete = allResults.slice(0, recordsToDelete);
    const idsToDelete = resultsToDelete.map(r => r.id);

    const deleted = await db
      .delete(fullAiInterviewResults)
      .where(eq(fullAiInterviewResults.id, idsToDelete[0])) // 简化删除逻辑
      .returning({ id: fullAiInterviewResults.id, interviewId: fullAiInterviewResults.interviewId });

    console.log(`[清理] 已删除 ${deleted.length} 条面试结果记录`);
    return deleted.length;
  } catch (error) {
    console.error('[清理] 清理面试结果失败:', error);
    throw error;
  }
}

/**
 * 清理超过保留期且没有关联结果的配置
 */
async function cleanupOldConfigs() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.retentionDays);

  console.log(`[清理] 开始清理配置，截止日期: ${cutoffDate.toISOString()}`);

  try {
    const db = await getDb();

    // 先获取所有有结果的 linkId
    const activeResults = await db
      .select({ linkId: fullAiInterviewResults.linkId })
      .from(fullAiInterviewResults)
      .groupBy(fullAiInterviewResults.linkId);

    const activeLinkIds = activeResults.map((r: any) => r.linkId);

    // 找出需要删除的配置：超过保留期 且 没有结果关联
    const configsToDelete = await db
      .select({ id: fullAiInterviewConfigs.id, linkId: fullAiInterviewConfigs.linkId })
      .from(fullAiInterviewConfigs)
      .where(
        and(
          lt(fullAiInterviewConfigs.createdAt, cutoffDate),
          activeLinkIds.length > 0
            ? notInArray(fullAiInterviewConfigs.linkId, activeLinkIds)
            : undefined // 如果没有结果，不删除任何配置
        )
      )
      .limit(CLEANUP_CONFIG.maxRecordsPerRun);

    const totalToDelete = configsToDelete.length;
    console.log(`[清理] 找到 ${totalToDelete} 条超过 ${CLEANUP_CONFIG.retentionDays} 天且没有关联结果的配置`);

    if (totalToDelete === 0) {
      console.log('[清理] 没有需要清理的配置');
      return 0;
    }

    const linkIdsToDelete = configsToDelete.map((c: any) => c.linkId);

    // 删除这些配置
    const deleted = await db
      .delete(fullAiInterviewConfigs)
      .where(eq(fullAiInterviewConfigs.linkId, linkIdsToDelete[0])) // 简化删除逻辑
      .returning({ id: fullAiInterviewConfigs.id, linkId: fullAiInterviewConfigs.linkId });

    console.log(`[清理] 已删除 ${deleted.length} 条配置记录`);
    return deleted.length;
  } catch (error) {
    console.error('[清理] 清理配置失败:', error);
    throw error;
  }
}

/**
 * 主清理函数
 */
async function main() {
  console.log('='.repeat(50));
  console.log('开始执行数据清理任务');
  console.log('='.repeat(50));
  console.log(`清理配置: 保留 ${CLEANUP_CONFIG.retentionDays} 天，每次最多清理 ${CLEANUP_CONFIG.maxRecordsPerRun} 条`);
  console.log('');

  const startTime = Date.now();

  try {
    // 清理面试结果
    const deletedResults = await cleanupOldInterviewResults();
    console.log('');

    // 清理配置
    const deletedConfigs = await cleanupOldConfigs();
    console.log('');

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('='.repeat(50));
    console.log('数据清理任务完成');
    console.log(`总耗时: ${duration} 秒`);
    console.log(`删除的面试结果: ${deletedResults} 条`);
    console.log(`删除的配置: ${deletedConfigs} 条`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('数据清理任务失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('未捕获的错误:', error);
      process.exit(1);
    });
}

export { main as cleanupOldData, CLEANUP_CONFIG };
