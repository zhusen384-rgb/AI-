import { NextRequest, NextResponse } from 'next/server';
import { recordResumeEvaluation } from '@/lib/optimization/collect-data';

/**
 * 记录简历评估结果
 * 在简历解析完成后调用，记录 AI 评估结果
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      candidateId,
      resumeId,
      positionId,
      aiMatchScore,
      aiEvaluation,
    } = body;

    // 验证必要参数
    if (!candidateId || !resumeId || !positionId) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必要参数: candidateId, resumeId, positionId'
        },
        { status: 400 }
      );
    }

    if (aiMatchScore === undefined || aiMatchScore === null) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少 aiMatchScore 参数'
        },
        { status: 400 }
      );
    }

    console.log('开始记录简历评估结果...');
    console.log('  candidateId:', candidateId);
    console.log('  resumeId:', resumeId);
    console.log('  positionId:', positionId);
    console.log('  aiMatchScore:', aiMatchScore);

    // 记录评估结果
    const evaluationRecordId = await recordResumeEvaluation({
      candidateId,
      resumeId,
      positionId,
      aiMatchScore,
      aiEvaluation: aiEvaluation || {},
    });

    return NextResponse.json({
      success: true,
      data: {
        evaluationRecordId,
      },
    });
  } catch (error) {
    console.error('记录评估结果失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '记录评估结果失败',
      },
      { status: 500 }
    );
  }
}
