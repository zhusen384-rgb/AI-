import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/lib/db/schema';
import { eq, and, desc, sql, or } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';
import { ResumeParseResult, resumeParseTasks } from '@/lib/db/schema';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getResumeContentType, readResumeFileByKey } from '@/lib/resume-storage';
import { extractResumeFromBuffer } from '@/lib/resume-extract';
import { parseResumeContent } from '@/lib/resume-parse';
import { ensureResumeParseTasksTable } from '@/lib/db/ensure-resume-parse-tasks-table';
import {
  extractContactInfoFromText,
  extractNameFromResumeFileName,
  normalizeResumeEmail,
  normalizeResumeName,
  normalizeResumePhone,
} from '@/lib/resume-contact-info';

interface ResumeParseApiResponse {
  success: boolean;
  data?: {
    basicInfo?: {
      name?: string;
      phone?: string;
      email?: string;
    };
    [key: string]: unknown;
  };
  error?: string;
}

const normalizeExtractedName = (value?: string) => normalizeResumeName(value);

const normalizeExtractedPhone = (value?: string) => normalizeResumePhone(value);

const normalizeExtractedEmail = (value?: string) => normalizeResumeEmail(value);

const mergeExtractedInfo = (
  fileName: string,
  text: string,
  parsedData?: ResumeParseApiResponse['data']
) => {
  const textContactInfo = extractContactInfoFromText(text, { fileName });
  const basicInfo = parsedData?.basicInfo;

  return {
    name: normalizeExtractedName(basicInfo?.name) || textContactInfo.name || extractNameFromResumeFileName(fileName),
    phone: normalizeExtractedPhone(basicInfo?.phone) || textContactInfo.phone,
    email: normalizeExtractedEmail(basicInfo?.email) || textContactInfo.email,
  };
};

type ResumeParseTaskInput =
  | {
      files: Array<{ fileName: string; fileKey: string; downloadUrl: string }>;
      resumeContent?: never;
      fileName?: never;
      position?: never;
      positionInfo?: never;
    }
  | {
      files?: never;
      resumeContent: string;
      fileName?: string;
      position?: unknown;
      positionInfo?: unknown;
    };

// 处理单个结果的函数。对于单文件任务，可以直接使用已提取的文本内容。
async function processTaskResult(
  result: ResumeParseResult,
  positionInfo?: unknown
): Promise<ResumeParseResult> {
  try {
    let extractedContent = result.extractedContent?.trim() || '';

    if (!extractedContent) {
      if (!result.fileKey) {
        throw new Error('缺少简历文件内容');
      }

      const buffer = await readResumeFileByKey(result.fileKey);
      const contentType = getResumeContentType(result.fileName);

      // 1. 提取简历文本
      const extractResult = await extractResumeFromBuffer({
        buffer,
        fileName: result.fileName,
        fileType: contentType,
        fileSize: buffer.length,
        fileKey: result.fileKey,
      });

      extractedContent = extractResult.content;
    }

    // 2. 结构化解析 basicInfo，优先用于姓名/电话/邮箱识别
    let parsedData: ResumeParseApiResponse['data'] | undefined;
    try {
      const parseResult = await parseResumeContent({
        resumeContent: extractedContent,
        position: positionInfo,
      }) as ResumeParseApiResponse;

      if (parseResult.success && parseResult.data) {
        parsedData = parseResult.data;
      }
    } catch (parseError) {
      console.error(`文件 ${result.fileName} 结构化解析失败，回退到文本识别:`, parseError);
    }

    // 3. 提取联系信息
    const contactInfo = mergeExtractedInfo(result.fileName, extractedContent, parsedData);

    // 注意：不在此处进行重复检测，因为候选人数据存储在前端 localStorage 中
    // 重复检测将在前端导入时进行

    return {
      ...result,
      status: 'success',
      extractedInfo: contactInfo,
      parsedData: parsedData,
      extractedContent,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...result,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '处理失败',
      processedAt: new Date().toISOString(),
    };
  }
}

// 后台处理任务的函数
async function processTaskInBackground(
  taskId: number,
  taskResults: ResumeParseResult[],
  positionInfo?: unknown
) {
  try {
    const db = await getDb(schema);
    
    // 更新任务状态为 processing
    await db
      .update(resumeParseTasks)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(resumeParseTasks.id, taskId));

    async function updateTaskResult(index: number, patch: Partial<ResumeParseResult>) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM resume_parse_tasks WHERE id = ${taskId} FOR UPDATE`);

        const currentTask = await tx
          .select()
          .from(resumeParseTasks)
          .where(eq(resumeParseTasks.id, taskId))
          .limit(1);

        if (currentTask.length === 0) {
          throw new Error(`任务 ${taskId} 已被删除`);
        }

        const currentResults = Array.isArray(currentTask[0].results)
          ? [...currentTask[0].results]
          : [];
        currentResults[index] = {
          ...currentResults[index],
          ...patch,
        };

        const processedCount = currentResults.filter((r) => r.status !== 'pending' && r.status !== 'processing').length;
        const successCount = currentResults.filter((r) => r.status === 'success').length;
        const failedCount = currentResults.filter((r) => r.status === 'failed' || r.status === 'duplicate').length;
        const isCompleted = processedCount === currentResults.length;

        await tx
          .update(resumeParseTasks)
          .set({
            results: currentResults,
            processedCount,
            successCount,
            failedCount,
            status: isCompleted ? 'completed' : 'processing',
            updatedAt: new Date(),
          })
          .where(eq(resumeParseTasks.id, taskId));
      });
    }

    const pendingIndices = taskResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === 'pending');

    const concurrency = Math.min(3, pendingIndices.length);
    await mapWithConcurrencyLimit(pendingIndices, concurrency, async ({ result, index }) => {
      await updateTaskResult(index, { status: 'processing' });

      const processedResult = await processTaskResult(result, positionInfo);
      await updateTaskResult(index, processedResult);

      taskResults[index] = processedResult;
      return processedResult;
    });

    console.log(`任务 ${taskId} 处理完成`);
  } catch (error) {
    console.error(`任务 ${taskId} 后台处理失败:`, error);
  }
}

/**
 * 获取当前用户的解析任务
 * GET /api/resume-parse-tasks
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);
    const userId = payload.userId;
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    await ensureResumeParseTasksTable();
    const db = await getDb(schema);

    if (taskId) {
      const numericTaskId = Number(taskId);
      if (!Number.isFinite(numericTaskId)) {
        return NextResponse.json({
          success: true,
          data: null,
          message: '任务不存在',
        });
      }

      const tasks = await db
        .select()
        .from(resumeParseTasks)
        .where(and(
          eq(resumeParseTasks.id, numericTaskId),
          eq(resumeParseTasks.userId, userId as string)
        ))
        .limit(1);

      if (tasks.length === 0) {
        return NextResponse.json({
          success: true,
          data: null,
          message: '任务不存在',
        });
      }

      return NextResponse.json({
        success: true,
        data: tasks[0],
      });
    }

    // 获取用户最新的解析任务
    const tasks = await db
      .select()
      .from(resumeParseTasks)
      .where(eq(resumeParseTasks.userId, userId as string))
      .orderBy(desc(resumeParseTasks.createdAt))
      .limit(1);

    if (tasks.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: '暂无解析任务',
      });
    }

    return NextResponse.json({
      success: true,
      data: tasks[0],
    });
  } catch (error) {
    console.error('获取解析任务失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取解析任务失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建新的解析任务（覆盖旧任务）并启动后台处理
 * POST /api/resume-parse-tasks
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);
    const userId = payload.userId;
    const tenantId = payload.tenantId;
    const body = await req.json();
    const { files, resumeContent, fileName, position, positionInfo } = body as ResumeParseTaskInput & {
      fileName?: string;
      position?: unknown;
      positionInfo?: unknown;
    };

    const taskPosition = position ?? positionInfo;
    const hasFileBatch = Array.isArray(files) && files.length > 0;
    const hasTextContent = typeof resumeContent === 'string' && resumeContent.trim().length > 0;

    if (!hasFileBatch && !hasTextContent) {
      return NextResponse.json(
        { error: '请上传文件或提供简历内容' },
        { status: 400 }
      );
    }

    await ensureResumeParseTasksTable();
    const db = await getDb(schema);

    const activeTask = await db
      .select()
      .from(resumeParseTasks)
      .where(and(
        eq(resumeParseTasks.userId, userId as string),
        or(
          eq(resumeParseTasks.status, 'pending'),
          eq(resumeParseTasks.status, 'processing')
        )
      ))
      .orderBy(desc(resumeParseTasks.createdAt))
      .limit(1);

    if (activeTask.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: '当前已有简历解析任务正在处理中，请稍后再试',
          data: activeTask[0],
        },
        { status: 409 }
      );
    }

    // 创建初始解析结果
    const results: ResumeParseResult[] = hasFileBatch
      ? files.map((file, index) => ({
          id: `file-${Date.now()}-${index}`,
          fileName: file.fileName,
          fileKey: file.fileKey,
          downloadUrl: file.downloadUrl,
          status: 'pending' as const,
          extractedInfo: undefined,
          parsedData: undefined,
          extractedContent: undefined,
          errorMessage: undefined,
          duplicateInfo: undefined,
          processedAt: undefined,
        }))
      : [{
          id: `text-${Date.now()}`,
          fileName: fileName?.trim() || '手动输入简历',
          status: 'pending' as const,
          extractedInfo: undefined,
          parsedData: undefined,
          extractedContent: resumeContent!.trim(),
          errorMessage: undefined,
          duplicateInfo: undefined,
          processedAt: undefined,
        }];

    // 创建新任务
    const [newTask] = await db
      .insert(resumeParseTasks)
      .values({
        userId: userId as string,
        tenantId: tenantId || null,
        status: 'pending',
        totalCount: hasFileBatch ? files.length : 1,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        results: results,
      })
      .returning();

    // 启动后台处理（不等待完成）
    processTaskInBackground(newTask.id, results, taskPosition).catch(err => {
      console.error('后台处理任务失败:', err);
    });

    return NextResponse.json({
      success: true,
      data: newTask,
      message: '解析任务创建成功，正在后台处理',
    });
  } catch (error) {
    console.error('创建解析任务失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建解析任务失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除解析任务
 * DELETE /api/resume-parse-tasks
 */
export async function DELETE(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);
    const userId = payload.userId;
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');

    await ensureResumeParseTasksTable();
    const db = await getDb(schema);

    if (taskId) {
      await db
        .delete(resumeParseTasks)
        .where(and(
          eq(resumeParseTasks.id, parseInt(taskId)),
          eq(resumeParseTasks.userId, userId as string)
        ));
    } else {
      await db
        .delete(resumeParseTasks)
        .where(eq(resumeParseTasks.userId, userId as string));
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除解析任务失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除解析任务失败',
      },
      { status: 500 }
    );
  }
}
