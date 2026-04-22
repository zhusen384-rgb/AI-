import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as sharedSchema from '@/storage/database/shared/schema';
import * as localSchema from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import {
  tenants,
  users,
  positions,
  loginLogs,
  invitationCodes,
  fullAiInterviewConfigs,
  interviewSessions,
  fullAiInterviewResults,
  resumeEvaluationRecords,
  modelOptimizationHistory,
} from '@/storage/database/shared/schema';
import { candidates, resumes } from '@/lib/db/schema';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';
import { ensureResumesTable } from '@/lib/db/ensure-resumes-table';

type TableScope = 'shared' | 'local';
type SupportedTableSchema =
  | typeof tenants
  | typeof users
  | typeof positions
  | typeof loginLogs
  | typeof invitationCodes
  | typeof fullAiInterviewConfigs
  | typeof interviewSessions
  | typeof fullAiInterviewResults
  | typeof resumeEvaluationRecords
  | typeof modelOptimizationHistory
  | typeof candidates
  | typeof resumes;
type SharedDb = Awaited<ReturnType<typeof getDb<typeof sharedSchema>>>;
type LocalDb = Awaited<ReturnType<typeof getDb<typeof localSchema>>>;
type SyncDb = SharedDb | LocalDb;

const TABLE_SCHEMA_MAP: Record<string, {
  schema: SupportedTableSchema;
  scope: TableScope;
  tableName: string;
  resetSequence?: boolean;
}> = {
  tenants: { schema: tenants, scope: 'shared', tableName: 'tenants' },
  users: { schema: users, scope: 'shared', tableName: 'users' },
  positions: { schema: positions, scope: 'shared', tableName: 'positions', resetSequence: true },
  loginLogs: { schema: loginLogs, scope: 'shared', tableName: 'login_logs', resetSequence: true },
  invitationCodes: { schema: invitationCodes, scope: 'shared', tableName: 'invitation_codes' },
  fullAiInterviewConfigs: { schema: fullAiInterviewConfigs, scope: 'shared', tableName: 'full_ai_interview_configs', resetSequence: true },
  interviewSessions: { schema: interviewSessions, scope: 'shared', tableName: 'interview_sessions', resetSequence: true },
  fullAiInterviewResults: { schema: fullAiInterviewResults, scope: 'shared', tableName: 'full_ai_interview_results', resetSequence: true },
  resumeEvaluationRecords: { schema: resumeEvaluationRecords, scope: 'shared', tableName: 'resume_evaluation_records', resetSequence: true },
  modelOptimizationHistory: { schema: modelOptimizationHistory, scope: 'shared', tableName: 'model_optimization_history', resetSequence: true },
  candidates: { schema: candidates, scope: 'local', tableName: 'candidates', resetSequence: true },
  resumes: { schema: resumes, scope: 'local', tableName: 'resumes', resetSequence: true },
};

async function syncSerialSequence(db: SyncDb, tableName: string): Promise<void> {
  try {
    await db.execute(sql.raw(`
      SELECT setval(
        pg_get_serial_sequence('${tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
        COALESCE((SELECT MAX(id) IS NOT NULL FROM ${tableName}), false)
      )
    `));
  } catch (error) {
    console.warn(`[数据导入] 同步 ${tableName} 序列失败，已跳过:`, error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, options } = body;

    if (!data || !data.tables) {
      return NextResponse.json(
        { error: '无效的数据格式' },
        { status: 400 }
      );
    }

    console.log('[数据导入] 开始导入数据...');
    console.log('[数据导入] 导出时间:', data.exportTime);
    console.log('[数据导入] 版本:', data.version);

    await ensurePositionsTable();
    await ensureCandidatesTable();
    await ensureResumesTable();

    const sharedDb = await getDb(sharedSchema);
    const localDb = await getDb(localSchema);
    
    // 导入选项
    const importOptions = {
      skipExisting: options?.skipExisting ?? false, // 跳过已存在的记录
      overwrite: options?.overwrite ?? false, // 覆盖已存在的记录
      dryRun: options?.dryRun ?? false, // 模拟运行，不实际导入
    };

    const importResults = {
      success: true,
      totalRecords: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      tables: {} as Record<string, unknown>,
      errors: [] as string[],
    };

    if (importOptions.dryRun) {
      console.log('[数据导入] ⚠️  模拟运行模式，不会实际导入数据');
    }

    // 导入所有表的数据
    for (const [tableName, records] of Object.entries(data.tables)) {
      if (!Array.isArray(records) || records.length === 0) {
        console.log(`[数据导入] 表 ${tableName} 为空，跳过`);
        importResults.tables[tableName] = {
          count: 0,
          status: 'skipped',
          reason: '空数据',
        };
        continue;
      }

      console.log(`[数据导入] 正在导入表: ${tableName}, 共 ${records.length} 条记录`);

      const tableConfig = TABLE_SCHEMA_MAP[tableName];
      if (!tableConfig) {
        console.warn(`[数据导入] 表 ${tableName} 不存在，跳过`);
        importResults.tables[tableName] = {
          count: records.length,
          status: 'skipped',
          reason: '表不存在',
        };
        continue;
      }

      const db = tableConfig.scope === 'shared' ? sharedDb : localDb;
      const tableSchema = tableConfig.schema;

      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const tableErrors: string[] = [];

      for (const record of records) {
        importResults.totalRecords++;

        try {
          if (importOptions.dryRun) {
            // 模拟运行，只检查不插入
            imported++;
            continue;
          }

          const normalizedRecord =
            record && typeof record === 'object'
              ? (record as Record<string, unknown>)
              : {};
          const recordId = normalizedRecord.id;

          if (recordId !== undefined && recordId !== null) {
            const existingRecords = await db
              .select()
              .from(tableSchema)
              .where(sql`${tableSchema.id} = ${recordId}`)
              .limit(1);

            if (existingRecords.length > 0) {
              if (importOptions.overwrite) {
                const updateValues = Object.fromEntries(
                  Object.entries(normalizedRecord).filter(([key]) => key !== 'id')
                );
                await db
                  .update(tableSchema)
                  .set(updateValues as never)
                  .where(sql`${tableSchema.id} = ${recordId}`);
                imported++;
              } else if (importOptions.skipExisting) {
                skipped++;
              } else {
                throw new Error(`主键 ${String(recordId)} 已存在`);
              }

              continue;
            }
          }

          // 导入记录
          await db.insert(tableSchema).values(normalizedRecord as never);
          imported++;
        } catch (error: unknown) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : '未知错误';
          const recordId = record && typeof record === 'object' && 'id' in record ? (record as Record<string, unknown>).id : 'unknown';
          tableErrors.push(`记录 ${String(recordId)}: ${errorMsg}`);
        }
      }

      if (!importOptions.dryRun && tableConfig.resetSequence) {
        await syncSerialSequence(db, tableConfig.tableName);
      }

      importResults.tables[tableName] = {
        total: records.length,
        imported,
        skipped,
        failed,
        status: failed === 0 ? 'success' : 'partial',
        errors: tableErrors.length > 0 ? tableErrors.slice(0, 5) : undefined, // 只保留前5个错误
      };

      importResults.imported += imported;
      importResults.skipped += skipped;
      importResults.failed += failed;

      console.log(`[数据导入] 表 ${tableName} 导入完成: 导入 ${imported}, 跳过 ${skipped}, 失败 ${failed}`);
    }

    importResults.success = importResults.failed === 0;

    console.log('[数据导入] 导入完成');
    console.log('[数据导入] 总计:', {
      总记录数: importResults.totalRecords,
      导入: importResults.imported,
      跳过: importResults.skipped,
      失败: importResults.failed,
    });

    return NextResponse.json({
      success: importResults.success,
      results: importResults,
    });
  } catch (error) {
    console.error('[数据导入] 导入失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '导入失败',
      },
      { status: 500 }
    );
  }
}
