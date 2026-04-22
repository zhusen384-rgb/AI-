/**
 * 自动化任务执行 API
 * 
 * POST   - 启动自动化任务
 * GET    - 获取任务状态
 * DELETE - 停止任务
 */

import { NextRequest, NextResponse } from 'next/server';
import { taskManager, TaskConfig } from '@/lib/auto-greeting/automation-task';
import { getClient } from 'coze-coding-dev-sdk';
import {
  canAccessAutoGreetingAccount,
  canAccessAutoGreetingTask,
  canManageAutoGreetingJob,
  requireAutoGreetingAuth,
  isAutoGreetingAdmin,
} from '@/lib/auto-greeting/auth';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import { findActiveGreetingTemplate } from '@/lib/auto-greeting/runtime-service';
import {
  loadAutoGreetingSettings,
  mergeJobExecutionSettings,
} from '@/lib/auto-greeting/config';

/**
 * 获取任务状态
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = req.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');
    const { auth } = authResult;

    if (taskId) {
      const client = await getClient();
      const canAccess = await canAccessAutoGreetingTask(client, taskId, auth);
      if (!canAccess) {
        client.release();
        return NextResponse.json(
          { success: false, error: '任务不存在或无权访问' },
          { status: 404 }
        );
      }
      client.release();

      const state = await taskManager.getTaskState(taskId);
      if (!state) {
        return NextResponse.json(
          { success: false, error: '任务不存在' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          taskId: state.id,
          jobId: state.job_id,
          accountId: state.account_id,
          platform: state.platform,
          taskType: state.task_type,
          status: state.status,
          config: state.config,
          state: state.state,
          lastHeartbeatAt: state.last_heartbeat_at,
          lastExecutionAt: state.last_execution_at,
          lastError: state.last_error,
          createdAt: state.created_at,
          updatedAt: state.updated_at,
        },
      });
    }

    const tasks = await taskManager.listTasks({
      createdById: auth.userId,
      isAdmin: auth.role === 'super_admin',
    });

    return NextResponse.json({
      success: true,
      data: tasks.map(task => ({
        taskId: task.id,
        jobId: task.job_id,
        accountId: task.account_id,
        platform: task.platform,
        taskType: task.task_type,
        status: task.status,
        config: task.config,
        state: task.state,
        lastHeartbeatAt: task.last_heartbeat_at,
        lastExecutionAt: task.last_execution_at,
        lastError: task.last_error,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      })),
    });

  } catch (error) {
    console.error('获取任务状态失败:', error);
    return NextResponse.json(
      { success: false, error: '获取任务状态失败' },
      { status: 500 }
    );
  }
}

/**
 * 启动自动化任务
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await req.json();
    const { jobPositionId, jobId, accountId, platform, taskType, executionMode } = body;
    const { auth } = authResult;

    // 兼容两种参数名
    const actualJobId = jobPositionId || jobId;

    if (!actualJobId || !accountId || !platform) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 获取岗位配置
    const client = await getClient();
    const canManageJob = await canManageAutoGreetingJob(client, actualJobId, auth);
    if (!canManageJob) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在或你没有权限启动该岗位任务' },
        { status: 403 }
      );
    }

    const canAccessAccount = await canAccessAutoGreetingAccount(client, accountId, auth);
    if (!canAccessAccount) {
      client.release();
      return NextResponse.json(
        { success: false, error: '账号不存在或你没有权限使用该账号' },
        { status: 403 }
      );
    }

    const jobResult = await client.query(`
      SELECT * FROM ag_job_positions WHERE id = $1
    `, [actualJobId]);

    if (jobResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '岗位不存在' },
        { status: 404 }
      );
    }

    const job = jobResult.rows[0];
    const settings = await loadAutoGreetingSettings();
    const greetingTemplate = await findActiveGreetingTemplate(
      client,
      actualJobId,
      platform,
      'first'
    );
    const executionSettings = mergeJobExecutionSettings(job, settings);
    client.release();

    if (taskType !== 'reply' && settings.general.autoGreetingEnabled === false) {
      return NextResponse.json(
        { success: false, error: '系统已关闭自动打招呼，请先在系统配置中开启' },
        { status: 400 }
      );
    }

    // 构建任务配置
    const config: TaskConfig = {
      jobId: actualJobId,
      accountId,
      platform,
      executionMode: executionMode || (platform === 'boss' ? 'computer-user-playwright-mcp' : undefined),
      taskType: taskType || 'all',
      maxGreetings: executionSettings.maxGreetings,
      matchThreshold: job.match_threshold || 60,
      greetingIntervalMin: executionSettings.greetingIntervalMin,
      greetingIntervalMax: executionSettings.greetingIntervalMax,
      replyDelayMin: executionSettings.replyDelayMin,
      replyDelayMax: executionSettings.replyDelayMax,
      workingHoursStart: executionSettings.workingHoursStart,
      workingHoursEnd: executionSettings.workingHoursEnd,
      greetingTemplate: greetingTemplate || undefined,
    };

    // 启动任务
    const result = await taskManager.startTask(config, {
      createdById: auth.userId,
      tenantId: auth.tenantId,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: { taskId: result.taskId },
        message: '任务启动成功',
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error,
    });

  } catch (error) {
    console.error('启动任务失败:', error);
    return NextResponse.json(
      { success: false, error: '启动任务失败' },
      { status: 500 }
    );
  }
}

/**
 * 停止任务
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(req);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = req.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少任务 ID' },
        { status: 400 }
      );
    }

    const client = await getClient();
    const canAccess = await canAccessAutoGreetingTask(client, taskId, authResult.auth);
    client.release();
    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: '任务不存在或无权停止' },
        { status: 404 }
      );
    }

    await taskManager.stopTask(taskId);

    return NextResponse.json({
      success: true,
      message: '任务已停止',
    });

  } catch (error) {
    console.error('停止任务失败:', error);
    return NextResponse.json(
      { success: false, error: '停止任务失败' },
      { status: 500 }
    );
  }
}
