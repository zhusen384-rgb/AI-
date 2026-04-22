import { NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as sharedSchema from '@/storage/database/shared/schema';
import * as localSchema from '@/lib/db/schema';
import {
  tenants,
  users,
  loginLogs,
  invitationCodes,
  fullAiInterviewConfigs,
  interviewSessions,
  fullAiInterviewResults,
  resumeEvaluationRecords,
  modelOptimizationHistory,
  positions,
} from '@/storage/database/shared/schema';
import { candidates, resumes } from '@/lib/db/schema';
import { ensureCandidatesTable } from '@/lib/db/ensure-candidates-table';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';
import { ensureResumesTable } from '@/lib/db/ensure-resumes-table';

type TableScope = 'shared' | 'local';

const TABLES_TO_EXPORT = [
  { name: 'tenants', schema: tenants, scope: 'shared' as TableScope },
  { name: 'users', schema: users, scope: 'shared' as TableScope },
  { name: 'positions', schema: positions, scope: 'shared' as TableScope },
  { name: 'loginLogs', schema: loginLogs, scope: 'shared' as TableScope },
  { name: 'invitationCodes', schema: invitationCodes, scope: 'shared' as TableScope },
  { name: 'fullAiInterviewConfigs', schema: fullAiInterviewConfigs, scope: 'shared' as TableScope },
  { name: 'interviewSessions', schema: interviewSessions, scope: 'shared' as TableScope },
  { name: 'fullAiInterviewResults', schema: fullAiInterviewResults, scope: 'shared' as TableScope },
  { name: 'resumeEvaluationRecords', schema: resumeEvaluationRecords, scope: 'shared' as TableScope },
  { name: 'modelOptimizationHistory', schema: modelOptimizationHistory, scope: 'shared' as TableScope },
  { name: 'candidates', schema: candidates, scope: 'local' as TableScope },
  { name: 'resumes', schema: resumes, scope: 'local' as TableScope },
];

export async function GET() {
  try {
    console.log('[数据导出] 开始导出数据...');
    await ensurePositionsTable();
    await ensureCandidatesTable();
    await ensureResumesTable();

    const sharedDb = await getDb(sharedSchema);
    const localDb = await getDb(localSchema);

    const exportData: {
      exportTime: string;
      version: string;
      tables: Record<string, unknown[]>;
    } = {
      exportTime: new Date().toISOString(),
      version: '1.0',
      tables: {},
    };

    let totalRecords = 0;

    // 导出所有表的数据
    for (const table of TABLES_TO_EXPORT) {
      console.log(`[数据导出] 正在导出表: ${table.name}`);

      const db = table.scope === 'shared' ? sharedDb : localDb;
      const data = await db.select().from(table.schema);
      exportData.tables[table.name] = data;
      
      const recordCount = data.length;
      totalRecords += recordCount;
      
      console.log(`[数据导出] 表 ${table.name} 导出完成，共 ${recordCount} 条记录`);
    }

    console.log(`[数据导出] 导出完成，总共 ${totalRecords} 条记录`);

    return NextResponse.json({
      success: true,
      data: exportData,
      summary: {
        exportTime: exportData.exportTime,
        totalTables: TABLES_TO_EXPORT.length,
        totalRecords,
        tables: TABLES_TO_EXPORT.map(table => ({
          name: table.name,
          count: exportData.tables[table.name].length,
        })),
      },
    });
  } catch (error) {
    console.error('[数据导出] 导出失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '导出失败',
      },
      { status: 500 }
    );
  }
}
