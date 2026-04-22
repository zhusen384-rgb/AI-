/**
 * 打招呼处理 API
 * 
 * POST /api/auto-greeting/greeting - 执行打招呼
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { BossOperator, type BossCandidate } from '@/lib/auto-greeting/boss-operator';
import {
  canAccessAutoGreetingAccount,
  canAccessAutoGreetingJob,
  canManageAutoGreetingJob,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import { matchCandidate } from '@/lib/auto-greeting/matching-engine';
import { generateGreetingMessage } from '@/lib/auto-greeting/llm-integration';
import {
  findActiveGreetingTemplate,
  getCommunicationByPlatformUser,
  insertMessageIfMissing,
  logOperation,
  mapBossCandidateToProfile,
  mapJobRowToJobPosition,
  renderGreetingTemplate,
  updateJobStats,
  upsertCommunicationForCandidate,
} from '@/lib/auto-greeting/runtime-service';
import type { BossAutomationOperator } from '@/lib/auto-greeting/operator-interface';
import { createBossAutomationOperator } from '@/lib/auto-greeting/operator-factory';

function normalizeBossCandidate(candidate: Record<string, unknown>): BossCandidate {
  return {
    id: String(candidate.id || candidate.platformUserId || candidate.geekId || ''),
    name: String(candidate.name || candidate.platformNickname || ''),
    avatar: candidate.avatar ? String(candidate.avatar) : undefined,
    title: candidate.title ? String(candidate.title) : undefined,
    company: candidate.company ? String(candidate.company) : undefined,
    education: candidate.education ? String(candidate.education) : undefined,
    experience: candidate.experience ? String(candidate.experience) : undefined,
    age: typeof candidate.age === 'number' ? candidate.age : undefined,
    location: candidate.location ? String(candidate.location) : undefined,
    salary: candidate.salary ? String(candidate.salary) : undefined,
    skills: Array.isArray(candidate.skills)
      ? candidate.skills.map(item => String(item)).filter(Boolean)
      : undefined,
    activeTime: candidate.activeTime ? String(candidate.activeTime) : undefined,
    matchScore: typeof candidate.matchScore === 'number' ? candidate.matchScore : undefined,
    hasGreeted: Boolean(candidate.hasGreeted),
    hasReplied: Boolean(candidate.hasReplied),
  };
}

function buildTemplateVariables(
  job: ReturnType<typeof mapJobRowToJobPosition>,
  candidate: BossCandidate,
  templateVariables: Record<string, string>
) {
  return {
    name: candidate.name || '您好',
    candidateName: candidate.name || '候选人',
    position: job.name,
    jobTitle: job.name,
    company: job.companyIntro || '',
    location: job.location,
    salary: job.salaryMin || job.salaryMax ? `${job.salaryMin || 0}-${job.salaryMax || 0}K` : '',
    skills: (candidate.skills || []).slice(0, 3).join('、'),
    ...templateVariables,
  };
}

/**
 * 执行打招呼
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await request.json();
    const {
      jobId,
      accountId,
      candidate,
      platform,
      dryRun = false, // 是否为预览模式
      performSend: rawPerformSend,
      externalDelivery = false,
      actualMessage,
      executionMode,
    } = body;
    const performSend = rawPerformSend ?? !dryRun;
    const { auth } = authResult;

    // 验证必填字段
    if (!jobId || !candidate || !platform) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    if (!dryRun && !performSend && !externalDelivery) {
      return NextResponse.json(
        { success: false, error: '非预览模式必须执行真实发送，或声明为外部已发送模式' },
        { status: 400 }
      );
    }

    const client = await getClient();
    let operator: BossAutomationOperator | null = null;

    try {
      const canAccessJob = await canAccessAutoGreetingJob(client, jobId, auth);
      if (!canAccessJob) {
        return NextResponse.json(
          { success: false, error: '岗位不存在或无权访问' },
          { status: 404 }
        );
      }

      const canManageJob = await canManageAutoGreetingJob(client, jobId, auth);
      if (!canManageJob) {
        return NextResponse.json(
          { success: false, error: '你没有权限执行该岗位的打招呼任务' },
          { status: 403 }
        );
      }

      if (performSend) {
        if (platform !== 'boss') {
          return NextResponse.json(
            { success: false, error: '当前仅支持 Boss 平台真实发送' },
            { status: 400 }
          );
        }

        if (!accountId) {
          return NextResponse.json(
            { success: false, error: '真实发送需要提供账号 ID' },
            { status: 400 }
          );
        }

        const canAccessAccount = await canAccessAutoGreetingAccount(client, accountId, auth);
        if (!canAccessAccount) {
          return NextResponse.json(
            { success: false, error: '账号不存在或无权使用该账号' },
            { status: 403 }
          );
        }
      }

      // 获取岗位信息
      const jobResult = await client.query(
        `
          SELECT * FROM ag_job_positions WHERE id = $1
        `,
        [jobId]
      );

      if (jobResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '岗位不存在' },
          { status: 404 }
        );
      }

      const job = mapJobRowToJobPosition(jobResult.rows[0]);
      const bossCandidate = normalizeBossCandidate(candidate as Record<string, unknown>);

      if (!bossCandidate.id) {
        return NextResponse.json(
          { success: false, error: '候选人缺少平台用户 ID，无法继续' },
          { status: 400 }
        );
      }

      const existingCommunication = await getCommunicationByPlatformUser(
        client,
        jobId,
        platform,
        bossCandidate.id
      );
      if (existingCommunication) {
        return NextResponse.json(
          { success: false, error: '该候选人已存在沟通记录，避免重复触达' },
          { status: 409 }
        );
      }

      // 执行匹配
      const matchResult = matchCandidate(mapBossCandidateToProfile(bossCandidate), job);

      if (!matchResult.matched) {
        return NextResponse.json({
          success: false,
          error: '匹配度不足',
          matchScore: matchResult.score,
          matchReasons: matchResult.reasons,
        });
      }

      const template = await findActiveGreetingTemplate(client, jobId, platform, 'first');
      const greetingMessage = template
        ? renderGreetingTemplate(
            template,
            buildTemplateVariables(job, bossCandidate, matchResult.templateVariables)
          ).trim()
        : await generateGreetingMessage({
            job,
            candidateName: bossCandidate.name,
            candidateSkills: bossCandidate.skills,
            platform,
          });

      // 预览模式：不保存到数据库
      if (dryRun) {
        return NextResponse.json({
          success: true,
          data: {
            matchScore: matchResult.score,
            matchReasons: matchResult.reasons,
            greetingMessage,
            templateVariables: matchResult.templateVariables,
            canSend: true,
          },
        });
      }

      let persistedCandidate = bossCandidate;
      let persistedGreeting = actualMessage ? String(actualMessage) : greetingMessage;
      let deliveryMode: string | null = externalDelivery ? 'boss_extension_external' : null;

      if (performSend) {
        const desiredMode = executionMode || (platform === 'boss' ? 'computer-user-playwright-mcp' : 'legacy-puppeteer');
        const factoryResult = await createBossAutomationOperator(desiredMode);
        operator = factoryResult.operator;
        let initResult = await operator.init(accountId);
        let effectiveExecutionMode = factoryResult.executionMode;

        if (!initResult.success && desiredMode === 'computer-user-playwright-mcp') {
          await operator.close().catch(() => undefined);
          operator = new BossOperator();
          initResult = await operator.init(accountId);
          effectiveExecutionMode = 'legacy-puppeteer';
        }

        if (!initResult.success) {
          await logOperation(client, {
            jobId,
            type: 'greeting_first',
            action: 'init_operator',
            details: {
              candidateId: bossCandidate.id,
              candidateName: bossCandidate.name || null,
            },
            success: false,
            errorMessage: initResult.error || 'Boss 初始化失败',
            platform,
            operatorId: accountId,
            operatorType: 'system',
          });
          return NextResponse.json(
            { success: false, error: initResult.error || 'Boss 初始化失败' },
            { status: 500 }
          );
        }

        const inspectedCandidate = await operator.inspectCandidateResume(bossCandidate);
        const sendResult = await operator.sendGreeting(inspectedCandidate, greetingMessage, {
          name: job.name,
          location: job.location,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
        });
        if (!sendResult.success) {
          await logOperation(client, {
            jobId,
            type: 'greeting_first',
            action: 'send_greeting',
            details: {
              candidateId: inspectedCandidate.id,
              candidateName: inspectedCandidate.name || null,
              attemptedMessage: greetingMessage,
            },
            success: false,
            errorMessage: sendResult.error || '发送失败',
            platform,
            operatorId: accountId,
            operatorType: 'system',
          });
          return NextResponse.json(
            { success: false, error: sendResult.error || 'Boss 打招呼发送失败' },
            { status: 500 }
          );
        }

        persistedCandidate = {
          ...inspectedCandidate,
          id: sendResult.platformUserId || inspectedCandidate.id,
        };
        persistedGreeting = sendResult.actualMessage || greetingMessage;
        deliveryMode = sendResult.deliveryMode || null;
        if (sendResult.diagnostics) {
          deliveryMode = `${deliveryMode || 'unknown'}:${sendResult.diagnostics.executionMode || effectiveExecutionMode}`;
        }
      }

      const upserted = await upsertCommunicationForCandidate(client, {
        jobId,
        accountId,
        platform,
        candidate: persistedCandidate,
        matchScore: matchResult.score,
        matchReasons: matchResult.reasons,
        initialStatus: '已打招呼',
      });

      const insertedMessage = await insertMessageIfMissing(client, {
        communicationId: upserted.id,
        sender: 'hr',
        content: persistedGreeting,
        messageType: 'greeting',
        sendMethod: 'auto',
        isAuto: true,
        status: 'sent',
        sendTime: new Date(),
        platformMessageId: `greet-${persistedCandidate.id}-${Date.now()}`,
      });

      await client.query(
        `
          UPDATE ag_candidate_communications
          SET
            status = '已打招呼',
            current_stage = COALESCE(current_stage, 'ice_breaking'),
            first_greeting_time = COALESCE(first_greeting_time, NOW()),
            first_greeting_message_id = COALESCE(first_greeting_message_id, $1),
            last_hr_message_time = NOW(),
            last_message_time = NOW(),
            updated_at = NOW()
          WHERE id = $2
        `,
        [insertedMessage.id || null, upserted.id]
      );

      await updateJobStats(client, jobId, { totalGreeted: 1 });

      await logOperation(client, {
        jobId,
        communicationId: upserted.id,
        messageId: insertedMessage.id || null,
        type: 'greeting_first',
        action: 'send_greeting',
        details: {
          candidateId: persistedCandidate.id,
          candidateName: persistedCandidate.name || null,
          matchScore: matchResult.score,
          matchReasons: matchResult.reasons,
          deliveryMode,
        },
        success: true,
        platform,
        operatorId: accountId,
        operatorType: 'system',
      });

      return NextResponse.json({
        success: true,
        data: {
          communicationId: upserted.id,
          matchScore: matchResult.score,
          greetingMessage,
          matchReasons: matchResult.reasons,
        },
      });
    } finally {
      if (operator) {
        await operator.close();
      }
      client.release();
    }

  } catch (error) {
    console.error('打招呼失败:', error);
    return NextResponse.json(
      { success: false, error: '打招呼失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取打招呼预览
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const platform = searchParams.get('platform');

    if (!jobId || !platform) {
      return NextResponse.json(
        { success: false, error: '缺少必填参数' },
        { status: 400 }
      );
    }

    const client = await getClient();

    try {
      const canAccessJob = await canAccessAutoGreetingJob(client, jobId, authResult.auth);
      if (!canAccessJob) {
        return NextResponse.json(
          { success: false, error: '岗位不存在或无权访问' },
          { status: 404 }
        );
      }

      // 获取岗位信息
      const jobResult = await client.query(`
        SELECT * FROM ag_job_positions WHERE id = $1
      `, [jobId]);

      if (jobResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: '岗位不存在' },
          { status: 404 }
        );
      }

      const job = jobResult.rows[0];

      // 获取话术模板
      const templateResult = await client.query(`
        SELECT * FROM ag_greeting_templates 
        WHERE job_id = $1 AND type = 'first' AND is_active = true AND (platform = $2 OR platform = 'all')
        ORDER BY use_count ASC
        LIMIT 1
      `, [jobId, platform]);

      return NextResponse.json({
        success: true,
        data: {
          job: {
            id: job.id,
            name: job.name,
            location: job.location,
            highlights: job.highlights || [],
          },
          template: templateResult.rows[0] || null,
          platform,
          timeSlots: [
            { start: '09:00', end: '10:30', priority: 90 },
            { start: '14:00', end: '15:30', priority: 80 },
            { start: '19:00', end: '20:30', priority: 70 },
          ],
        },
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('获取打招呼预览失败:', error);
    return NextResponse.json(
      { success: false, error: '获取打招呼预览失败' },
      { status: 500 }
    );
  }
}
