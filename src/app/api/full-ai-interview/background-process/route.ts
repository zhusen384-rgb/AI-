import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { getServerBaseUrl } from '@/lib/server-base-url';

type InterviewSessionRecord = typeof schema.interviewSessions.$inferSelect;
type FullAiInterviewResultInsert = typeof schema.fullAiInterviewResults.$inferInsert;

interface BackgroundProcessResult {
  interviewId: string;
  candidateName: string;
  status: 'success' | 'error';
  evaluationGenerated?: boolean;
  error?: string;
}

// GET 接口：简单的健康检查
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      message: '后台任务 API 正常运行',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '后台任务 API 检查失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 后台任务 API
 * 检查超过30分钟未完成的面试，自动生成评估报告
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeoutMinutes = parseInt(searchParams.get('timeoutMinutes') || '30');
    const forceAll = searchParams.get('forceAll') === 'true';

    const baseUrl = getServerBaseUrl(req);

    console.log('[后台任务] 开始检查未完成的面试');
    console.log('[后台任务] 超时阈值:', timeoutMinutes, '分钟');
    console.log('[后台任务] 强制处理所有:', forceAll);

    let db;
    try {
      db = await getDb(schema);
    } catch (dbError) {
      console.error('[后台任务] 获取数据库连接失败:', dbError);
      return NextResponse.json(
        {
          success: false,
          error: '数据库连接失败: ' + (dbError instanceof Error ? dbError.message : String(dbError)),
        },
        { status: 500 }
      );
    }

    // 计算超时时间
    const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    console.log('[后台任务] 超时时间点:', timeoutThreshold.toISOString());

    // 简化查询 - 使用 select().from() 而不是带有字段映射的查询
    let allSessions;
    try {
      allSessions = await db
        .select()
        .from(schema.interviewSessions);

      console.log(`[后台任务] 数据库中共有 ${allSessions?.length || 0} 个面试会话`);
    } catch (queryError) {
      console.error('[后台任务] 查询面试会话失败:', queryError);
      return NextResponse.json(
        {
          success: false,
          error: '查询面试会话失败: ' + (queryError instanceof Error ? queryError.message : String(queryError)),
        },
        { status: 500 }
      );
    }

    // 过滤需要处理的会话
    let sessions = allSessions || [];
    if (!forceAll && sessions.length > 0) {
      sessions = sessions.filter(s => {
        if (!s.updatedAt && !s.createdAt) {
          return false;
        }
        const updatedAt = s.updatedAt ? new Date(s.updatedAt) : new Date(s.createdAt);
        return updatedAt < timeoutThreshold;
      });
      console.log(`[后台任务] 过滤后需要处理的会话: ${sessions.length} 个`);
    }

    const results: BackgroundProcessResult[] = [];

    for (const session of sessions as InterviewSessionRecord[]) {
      try {
        console.log(`[后台任务] 处理面试会话 ID: ${session.interviewId}`);

        // 解析 messages 字段（如果是 JSON 字符串）
        let messages = session.messages;
        if (typeof messages === 'string') {
          try {
            messages = JSON.parse(messages);
          } catch (e) {
            console.error(`[后台任务] 解析 messages 失败:`, e);
            messages = [];
          }
        }

        // 检查是否已经有面试结果
        const existingResults = await db
          .select()
          .from(schema.fullAiInterviewResults)
          .where(eq(schema.fullAiInterviewResults.interviewId, session.interviewId));

        if (existingResults && existingResults.length > 0) {
          console.log(`[后台任务] 面试 ${session.interviewId} 已有结果记录，跳过`);
          continue;
        }

        console.log(`[后台任务] 处理面试 ${session.interviewId}: ${session.candidateName}`);

        // 生成评估报告
        let evaluation = null;
        let evaluationError = null;
        try {
          // 调用评估 API
          const evalResponse = await fetch(
            `${baseUrl}/api/full-ai-interview/evaluate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                interviewId: session.interviewId,
              }),
            }
          );

          if (evalResponse.ok) {
            const evalResult = await evalResponse.json();
            if (evalResult.success) {
              evaluation = {
                ...evalResult.evaluation,
                categoryLabels: {
                  communication: "沟通表达与亲和力",
                  learning: "学习意愿与适配能力",
                  execution: "目标感与执行力",
                  resilience: "抗压与抗挫折能力",
                  customerSensitivity: "客户需求敏感度"
                }
              };
              console.log(`[后台任务] 面试 ${session.interviewId} 评估成功`);
            } else {
              console.error(`[后台任务] 面试 ${session.interviewId} 评估失败:`, evalResult.error);
              evaluationError = evalResult.error || "评估API返回失败";
            }
          } else {
            const errorText = await evalResponse.text().catch(() => '无法读取错误信息');
            console.error(`[后台任务] 面试 ${session.interviewId} 评估 API 调用失败，状态码: ${evalResponse.status}, 响应:`, errorText);
            evaluationError = `评估 API 调用失败，状态码: ${evalResponse.status}${errorText ? `，错误: ${errorText.substring(0, 200)}` : ''}`;
          }
        } catch (error) {
          console.error(`[后台任务] 面试 ${session.interviewId} 评估异常:`, error);
          evaluationError = error instanceof Error ? error.message : "评估过程中发生异常";
        }

        // 如果评估失败，创建一个默认的评估报告
        if (!evaluation) {
          console.log(`[后台任务] 为面试 ${session.interviewId} 创建默认评估报告`);
          evaluation = {
            isEliminated: false,
            eliminationReason: null,
            overallScore5: 3,
            overallScore100: 60,
            categoryScores: {
              communication: { score: 60, basis: "面试中途退出，无法完整评估" },
              learning: { score: 60, basis: "面试中途退出，无法完整评估" },
              execution: { score: 60, basis: "面试中途退出，无法完整评估" },
              resilience: { score: 60, basis: "面试中途退出，无法完整评估" },
              customerSensitivity: { score: 60, basis: "面试中途退出，无法完整评估" }
            },
            summary: `候选人 ${session.candidateName} 在面试过程中意外中断。已完成 ${session.currentQuestionCount} 个问题的回答。由于面试未正常完成，本评估基于已回答的问题生成，仅供参考。`,
            strengths: ["面试态度积极"],
            improvements: ["建议完整完成面试以获得更准确的评估"],
            recommendation: "consider",
            categoryLabels: {
              communication: "沟通表达与亲和力",
              learning: "学习意愿与适配能力",
              execution: "目标感与执行力",
              resilience: "抗压与抗挫折能力",
              customerSensitivity: "客户需求敏感度"
            },
            evaluationError: evaluationError // 记录评估失败的原因
          };
        }

        // 保存面试结果
        try {
          const resultPayload: FullAiInterviewResultInsert = {
            linkId: session.linkId,
            interviewId: session.interviewId,
            candidateName: session.candidateName,
            position: session.positionId,
            evaluation: evaluation,
            recordingKey: null,
            recordingUrl: null,
            completedAt: session.updatedAt || new Date().toISOString(),
            createdAt: new Date().toISOString(),
            qaHistory: session.qaHistory || null,
            candidateStatus: session.candidateStatus || { overallStatus: 'normal', summary: '状态监控未启用', events: [], statistics: {} },
          };

          await db.insert(schema.fullAiInterviewResults).values(resultPayload);

          console.log(`[后台任务] 面试 ${session.interviewId} 结果保存成功`);
          results.push({
            interviewId: session.interviewId,
            candidateName: session.candidateName,
            status: 'success',
            evaluationGenerated: true,
          });
        } catch (error) {
          console.error(`[后台任务] 面试 ${session.interviewId} 结果保存失败:`, error);
          results.push({
            interviewId: session.interviewId,
            candidateName: session.candidateName,
            status: 'error',
            error: error instanceof Error ? error.message : '保存失败',
          });
        }
      } catch (sessionError) {
        console.error(`[后台任务] 处理面试 ${session.interviewId} 时发生错误:`, sessionError);
        results.push({
          interviewId: session.interviewId,
          candidateName: session.candidateName || '未知',
          status: 'error',
          error: sessionError instanceof Error ? sessionError.message : '处理失败',
        });
      }
    }

    console.log(`[后台任务] 完成，处理了 ${results.length} 个面试`);

    return NextResponse.json({
      success: true,
      message: `后台任务完成，处理了 ${results.length} 个面试`,
      data: {
        totalChecked: sessions.length,
        processed: results.length,
        results,
      },
    });
  } catch (error) {
    console.error('[后台任务] 执行失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '后台任务执行失败',
      },
      { status: 500 }
    );
  }
}
