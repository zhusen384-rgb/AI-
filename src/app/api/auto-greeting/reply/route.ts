/**
 * 回复处理 API
 * 
 * POST /api/auto-greeting/reply - 处理候选人消息并生成回复
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { BossOperator } from '@/lib/auto-greeting/boss-operator';
import { 
  initConversationState, 
  updateConversationState, 
  generateStrategy 
} from '@/lib/auto-greeting/conversation-engine';
import { 
  analyzeCandidateMessage, 
  generateReply
} from '@/lib/auto-greeting/llm-integration';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import {
  canManageAutoGreetingCommunication,
  requireAutoGreetingAuth,
} from '@/lib/auto-greeting/auth';
import {
  applyCandidateSignals,
  insertMessageIfMissing,
  logOperation,
  updateJobStats,
} from '@/lib/auto-greeting/runtime-service';
import { findBestQaAnswer } from '@/lib/auto-greeting/qa-service';
import { extractCandidateSignals } from '@/lib/auto-greeting/contact-extractor';

/**
 * 处理候选人消息并生成回复
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
      communicationId,
      message,
      platformMessageId,
      performSend: rawPerformSend,
      dryRun = false, // 是否为预览模式
      externalDelivery = false,
      replyOverride,
    } = body;
    const performSend = rawPerformSend ?? !dryRun;

    // 验证必填字段
    if (!communicationId || !message) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    const client = await getClient();
    const canManageCommunication = await canManageAutoGreetingCommunication(
      client,
      communicationId,
      authResult.auth
    );
    if (!canManageCommunication) {
      client.release();
      return NextResponse.json(
        { success: false, error: '沟通记录不存在或无权操作' },
        { status: 404 }
      );
    }

    // 获取沟通记录
    const commResult = await client.query(`
      SELECT c.*, j.name as job_name, j.location, j.salary_min, j.salary_max, 
             j.requirements, j.highlights, j.company_intro
      FROM ag_candidate_communications c
      LEFT JOIN ag_job_positions j ON c.job_id = j.id
      WHERE c.id = $1
    `, [communicationId]);

    if (commResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '沟通记录不存在' },
        { status: 404 }
      );
    }

    const comm = commResult.rows[0];

    // 检查是否黑名单
    if (comm.is_blacklisted) {
      client.release();
      return NextResponse.json(
        { success: false, error: '候选人已被拉黑' },
        { status: 403 }
      );
    }

    // 获取消息历史
    const messagesResult = await client.query(`
      SELECT sender, content, send_time as sendTime, is_auto as isAuto
      FROM ag_messages 
      WHERE communication_id = $1 
      ORDER BY send_time ASC
    `, [communicationId]);

    const messages = messagesResult.rows;

    // 构建岗位数据
    const jobData = {
      id: comm.job_id,
      name: comm.job_name,
      location: comm.location,
      salaryMin: comm.salary_min,
      salaryMax: comm.salary_max,
      requirements: comm.requirements,
      highlights: comm.highlights || [],
      companyIntro: comm.company_intro,
    };

    // 分析候选人消息
    const analysis = await analyzeCandidateMessage(message, {
      job: jobData as any,
      conversationHistory: messages as any,
      platform: comm.platform,
    });

    // 初始化或更新对话状态
    let conversationState = initConversationState();
    if (comm.current_stage) {
      // 如果已有对话状态，尝试恢复
      conversationState = {
        ...conversationState,
        stage: comm.current_stage,
      };
    }
    
    // 更新对话状态
    conversationState = updateConversationState(conversationState, message, {
      intent: analysis.intent,
      sentiment: analysis.sentiment,
      interestLevel: analysis.intentLevel,
      keywords: analysis.keywords,
    });

    // 生成策略
    const strategy = generateStrategy(conversationState, jobData as any, comm.platform);
    const matchedQa = await findBestQaAnswer(client, {
      jobId: comm.job_id,
      platform: comm.platform,
      message,
    });

    // 生成回复
    const replyMessage = await generateReply({
      job: jobData as any,
      candidateMessage: message,
      conversationHistory: messages as any,
      platform: comm.platform,
      stage: conversationState.stage,
    });

    // 预览模式：不保存到数据库
    if (dryRun) {
      client.release();
      return NextResponse.json({
        success: true,
        data: {
          analysis: {
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            intentLevel: analysis.intentLevel,
            keywords: analysis.keywords,
          },
          strategy: {
            stage: conversationState.stage,
            nextAction: strategy.nextAction,
            reasoning: strategy.reasoning,
          },
          reply: strategy.nextAction === 'wait' ? null : (strategy.message?.trim() || replyMessage),
        },
      });
    }

    const insertedCandidateMessage = await insertMessageIfMissing(client, {
      communicationId,
      sender: 'candidate',
      content: message,
      messageType: 'text',
      isAuto: false,
      status: 'sent',
      sendTime: new Date(),
      platformMessageId: platformMessageId || null,
      aiAnalysis: {
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        keywords: analysis.keywords,
        intentLevel: analysis.intentLevel,
        shouldIntervene: analysis.shouldIntervene,
      },
    });
    const signals = extractCandidateSignals(message);
    const signalUpdate = await applyCandidateSignals(client, communicationId, {
      ...signals,
      receivedAt: new Date(),
    });

    await client.query(`
      UPDATE ag_candidate_communications 
      SET
        current_stage = $1,
        candidate_intent = $2,
        intent_level = $2,
        last_candidate_message_time = NOW(),
        last_message_time = NOW(),
        communication_stats = jsonb_set(
          COALESCE(communication_stats, '{}'::jsonb),
          '{candidateMessageCount}',
          (COALESCE((communication_stats->>'candidateMessageCount')::int, 0) + $3)::text::jsonb
        ),
        updated_at = NOW()
      WHERE id = $4
    `, [
      conversationState.stage,
      analysis.intentLevel,
      insertedCandidateMessage.inserted ? 1 : 0,
      communicationId,
    ]);

    if (analysis.shouldIntervene || strategy.nextAction === 'escalate') {
      await client.query(`
        UPDATE ag_candidate_communications 
        SET 
          status = '已转入人工',
          current_stage = $1,
          manual_intervene = true,
          manual_intervene_reason = $2,
          manual_intervene_time = NOW(),
          candidate_intent = $3,
          intent_level = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [
        conversationState.stage,
        analysis.shouldIntervene ? 'LLM 判断需要人工介入' : '策略判断需要人工介入',
        analysis.intentLevel,
        communicationId,
      ]);

      await logOperation(client, {
        jobId: comm.job_id,
        communicationId,
        messageId: insertedCandidateMessage.id,
        type: 'manual_intervene',
        action: 'escalate_to_human',
        details: {
          candidateMessage: message.substring(0, 100),
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          stage: conversationState.stage,
        },
        success: true,
        platform: comm.platform,
        operatorType: 'system',
      });

      client.release();
      return NextResponse.json({
        success: true,
        data: {
          analysis: {
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            intentLevel: analysis.intentLevel,
          },
          strategy: {
            stage: conversationState.stage,
            nextAction: strategy.nextAction,
          },
          reply: null,
          sent: false,
        },
      });
    }

    if (strategy.nextAction === 'wait') {
      await client.query(`
        UPDATE ag_candidate_communications 
        SET 
          current_stage = $1,
          candidate_intent = $2,
          intent_level = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [
        conversationState.stage,
        analysis.intentLevel,
        communicationId,
      ]);

      await logOperation(client, {
        jobId: comm.job_id,
        communicationId,
        messageId: insertedCandidateMessage.id,
        type: 'reply_auto',
        action: 'wait',
        details: {
          candidateMessage: message.substring(0, 100),
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          stage: conversationState.stage,
        },
        success: true,
        platform: comm.platform,
        operatorType: 'system',
      });

      client.release();
      return NextResponse.json({
        success: true,
        data: {
          analysis: {
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            intentLevel: analysis.intentLevel,
          },
          strategy: {
            stage: conversationState.stage,
            nextAction: strategy.nextAction,
          },
          reply: null,
          sent: false,
        },
      });
    }

    if (!performSend && !externalDelivery) {
      client.release();
      return NextResponse.json(
        { success: false, error: '非预览模式必须执行真实发送，或声明为外部已发送模式' },
        { status: 400 }
      );
    }

    let outgoingMessage: string;
    if (typeof replyOverride === 'string' && replyOverride.trim()) {
      outgoingMessage = replyOverride.trim();
    } else if (strategy.nextAction === 'request_contact' || strategy.nextAction === 'schedule_interview') {
      outgoingMessage = strategy.message?.trim() || replyMessage;
    } else if (matchedQa?.answer) {
      outgoingMessage = matchedQa.answer;
    } else if (strategy.message?.trim()) {
      outgoingMessage = strategy.message.trim();
    } else {
      outgoingMessage = replyMessage;
    }

    let sendError: string | null = null;
    if (!dryRun && performSend && comm.platform === 'boss' && comm.account_id && comm.platform_user_id) {
      const operator = new BossOperator();
      const initResult = await operator.init(comm.account_id);

      if (!initResult.success) {
        sendError = initResult.error || 'Boss 回复初始化失败';
      } else {
        const sendResult = await operator.replyMessage(comm.platform_user_id, outgoingMessage);
        if (!sendResult.success) {
          sendError = sendResult.error || 'Boss 回复发送失败';
        }
      }

      await operator.close();

      if (sendError) {
        await logOperation(client, {
          jobId: comm.job_id,
          communicationId,
          messageId: insertedCandidateMessage.id,
          type: 'reply_auto',
          action: 'send_reply',
          details: {
            candidateMessage: message.substring(0, 100),
            replyMessage: outgoingMessage,
            stage: conversationState.stage,
          },
          success: false,
          errorMessage: sendError,
          platform: comm.platform,
          operatorId: comm.account_id || null,
          operatorType: 'system',
        });
        client.release();
        return NextResponse.json(
          { success: false, error: sendError },
          { status: 500 }
        );
      }
    } else if (performSend) {
      client.release();
      return NextResponse.json(
        { success: false, error: '当前仅支持 Boss 平台真实回复' },
        { status: 400 }
      );
    }

    // 保存HR回复
    const insertedReply = await insertMessageIfMissing(client, {
      communicationId,
      sender: 'hr',
      content: outgoingMessage,
      messageType: strategy.nextAction === 'request_contact' ? 'request_contact' : 'text',
      sendMethod: 'auto',
      isAuto: true,
      status: 'sent',
      sendTime: new Date(),
      platformMessageId: `reply-${comm.platform_user_id || communicationId}-${Date.now()}`,
      aiAnalysis: {
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        keywords: analysis.keywords,
        intentLevel: analysis.intentLevel,
        matchedQA: matchedQa?.id,
      },
    });

    // 更新沟通记录
    const newStage = conversationState.stage;
    const statusMap: Record<string, string> = {
      'ice_breaking': '已打招呼',
      'interest_building': '沟通中',
      'screening': '沟通中',
      'conversion': analysis.intentLevel === 'A' ? '高意向' : '沟通中',
    };
    const finalStatus = signalUpdate.status || statusMap[newStage] || comm.status;

    await client.query(`
      UPDATE ag_candidate_communications 
      SET 
        status = $1,
      current_stage = $2,
        reply_count = reply_count + 1,
        last_reply_time = NOW(),
        last_hr_message_time = NOW(),
        last_message_time = NOW(),
        candidate_intent = $3,
        intent_level = $3,
        communication_stats = jsonb_set(
          jsonb_set(
            communication_stats,
            '{hrMessageCount}',
            (COALESCE((communication_stats->>'hrMessageCount')::int, 0) + 1)::text::jsonb
          ),
          '{effectiveRounds}',
          (COALESCE((communication_stats->>'effectiveRounds')::int, 0) + 1)::text::jsonb
        ),
        updated_at = NOW()
      WHERE id = $4
    `, [
      finalStatus,
      newStage,
      analysis.intentLevel,
      communicationId,
    ]);

    await updateJobStats(client, comm.job_id, {
      totalReplied: 1,
      totalHighIntent: analysis.intentLevel === 'A' ? 1 : 0,
      totalResumeReceived: signalUpdate.resumeAdded ? 1 : 0,
      totalContactReceived: signalUpdate.contactAdded ? 1 : 0,
    });

    // 记录操作日志
    await logOperation(client, {
      jobId: comm.job_id,
      communicationId,
      messageId: insertedReply.id || null,
      type: 'reply_auto',
      action: 'auto_reply',
      details: {
        candidateMessage: message.substring(0, 100),
        replyLength: outgoingMessage.length,
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        stage: newStage,
        matchedQaId: matchedQa?.id || null,
        matchedQaKeywords: matchedQa?.matchedKeywords || [],
        sentToBoss: (performSend && comm.platform === 'boss') || externalDelivery,
      },
      success: true,
      platform: comm.platform,
      operatorId: comm.account_id || null,
      operatorType: 'system',
    });

    client.release();

    return NextResponse.json({
      success: true,
      data: {
        reply: outgoingMessage,
        analysis: {
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          intentLevel: analysis.intentLevel,
        },
        strategy: {
          stage: newStage,
          nextAction: strategy.nextAction,
        },
      },
    });

  } catch (error) {
    console.error('回复处理失败:', error);
    return NextResponse.json(
      { success: false, error: '回复处理失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取回复预览
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = request.nextUrl.searchParams;
    const communicationId = searchParams.get('communicationId');

    if (!communicationId) {
      return NextResponse.json(
        { success: false, error: '缺少communicationId参数' },
        { status: 400 }
      );
    }

    const client = await getClient();
    const canManageCommunication = await canManageAutoGreetingCommunication(
      client,
      communicationId,
      authResult.auth
    );
    if (!canManageCommunication) {
      client.release();
      return NextResponse.json(
        { success: false, error: '沟通记录不存在或无权访问' },
        { status: 404 }
      );
    }

    // 获取沟通记录和消息历史
    const commResult = await client.query(`
      SELECT c.*, j.name as job_name
      FROM ag_candidate_communications c
      LEFT JOIN ag_job_positions j ON c.job_id = j.id
      WHERE c.id = $1
    `, [communicationId]);

    if (commResult.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: '沟通记录不存在' },
        { status: 404 }
      );
    }

    const messagesResult = await client.query(`
      SELECT sender, content, send_time 
      FROM ag_messages 
      WHERE communication_id = $1 
      ORDER BY send_time DESC
      LIMIT 10
    `, [communicationId]);

    client.release();

    const comm = commResult.rows[0];

    return NextResponse.json({
      success: true,
      data: {
        communication: {
          id: comm.id,
          name: comm.name,
          status: comm.status,
          currentStage: comm.current_stage,
          replyCount: comm.reply_count,
          candidateIntent: comm.candidate_intent,
        },
        job: {
          name: comm.job_name,
        },
        messages: messagesResult.rows.reverse(),
      },
    });

  } catch (error) {
    console.error('获取回复预览失败:', error);
    return NextResponse.json(
      { success: false, error: '获取回复预览失败' },
      { status: 500 }
    );
  }
}
