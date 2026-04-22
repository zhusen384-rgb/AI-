import { NextRequest, NextResponse } from 'next/server';
import { updateInterviewDecision } from '@/lib/optimization/collect-data';

/**
 * 更新面试官评价
 * 在面试决策后调用，记录实际面试决策
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      evaluationRecordId,
      finalDecision,
      decisionReason,
      decisionMadeBy,
      interviewScores,
    } = body;

    // 验证必要参数
    if (!evaluationRecordId) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少 evaluationRecordId 参数'
        },
        { status: 400 }
      );
    }

    if (!finalDecision || !['hired', 'rejected', 'pending'].includes(finalDecision)) {
      return NextResponse.json(
        {
          success: false,
          error: 'finalDecision 必须是 hired、rejected 或 pending 之一'
        },
        { status: 400 }
      );
    }

    console.log('开始更新面试决策...');
    console.log('  evaluationRecordId:', evaluationRecordId);
    console.log('  finalDecision:', finalDecision);
    console.log('  decisionReason:', decisionReason);

    // 更新面试决策
    const updatedRecord = await updateInterviewDecision({
      evaluationRecordId,
      finalDecision,
      decisionReason,
      decisionMadeBy,
      interviewScores,
    });

    return NextResponse.json({
      success: true,
      data: {
        recordId: updatedRecord.id,
        predictionError: updatedRecord.predictionError,
        isMisclassified: updatedRecord.isMisclassified,
        misclassificationType: updatedRecord.misclassificationType,
      },
    });
  } catch (error) {
    console.error('更新面试决策失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新面试决策失败',
      },
      { status: 500 }
    );
  }
}
