import { NextRequest, NextResponse } from 'next/server';
import { performOptimization, deployOptimization, rollbackOptimization } from '@/lib/optimization/optimize';
import { getOptimizationData } from '@/lib/optimization/collect-data';
import { OPTIMIZATION_CONFIG } from '@/lib/optimization/config';

/**
 * 执行模型优化
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    console.log('优化 API 调用, action:', action);

    switch (action) {
      case 'perform': {
        // 执行优化
        const { currentPrompt, currentWeights, evaluationStage } = body;

        if (!currentPrompt || !currentWeights) {
          return NextResponse.json(
            {
              success: false,
              error: '缺少必要参数: currentPrompt, currentWeights'
            },
            { status: 400 }
          );
        }

        if (evaluationStage && !['resume_screening', 'final_evaluation'].includes(evaluationStage)) {
          return NextResponse.json(
            {
              success: false,
              error: 'evaluationStage 必须是 resume_screening 或 final_evaluation'
            },
            { status: 400 }
          );
        }

        // 获取训练数据
        const testData = await getOptimizationData();

        if (testData.length < OPTIMIZATION_CONFIG.SAMPLING.MIN_SAMPLE_SIZE) {
          return NextResponse.json(
            {
              success: false,
              error: `样本量不足，至少需要 ${OPTIMIZATION_CONFIG.SAMPLING.MIN_SAMPLE_SIZE} 条记录，当前仅有 ${testData.length} 条`
            },
            { status: 400 }
          );
        }

        console.log('开始执行模型优化...');
        console.log('  样本量:', testData.length);
        console.log('  当前 Prompt 长度:', currentPrompt.length);
        console.log('  评估阶段:', evaluationStage || 'resume_screening');

        const result = await performOptimization(
          currentPrompt,
          currentWeights,
          testData,
          evaluationStage || 'resume_screening'
        );

        return NextResponse.json({
          success: result.success,
          data: result,
        });
      }

      case 'deploy': {
        // 部署优化结果
        const { optimizationId } = body;

        if (!optimizationId) {
          return NextResponse.json(
            {
              success: false,
              error: '缺少 optimizationId 参数'
            },
            { status: 400 }
          );
        }

        console.log('部署优化结果, ID:', optimizationId);

        const result = await deployOptimization(optimizationId);

        return NextResponse.json({
          success: result.success,
          data: result,
        });
      }

      case 'rollback': {
        // 回滚优化
        const { optimizationId } = body;

        if (!optimizationId) {
          return NextResponse.json(
            {
              success: false,
              error: '缺少 optimizationId 参数'
            },
            { status: 400 }
          );
        }

        console.log('回滚优化, ID:', optimizationId);

        const result = await rollbackOptimization(optimizationId);

        return NextResponse.json({
          success: result.success,
          data: result,
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: '不支持的操作，请指定 action 为 perform、deploy 或 rollback'
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('优化操作失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '优化操作失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取优化历史
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const { getDb } = await import('coze-coding-dev-sdk');
    const { modelOptimizationHistory } = await import('@/storage/database/shared/schema');
    const { desc } = await import('drizzle-orm');

    const db = await getDb();

    const records = await db
      .select()
      .from(modelOptimizationHistory)
      .orderBy(desc(modelOptimizationHistory.createdAt))
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error('获取优化历史失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取优化历史失败',
      },
      { status: 500 }
    );
  }
}
