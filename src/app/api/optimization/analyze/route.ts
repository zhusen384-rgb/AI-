import { NextRequest, NextResponse } from 'next/server';
import {
  calculateModelMetrics,
  analyzeMisclassificationPatterns,
  shouldOptimize,
} from '@/lib/optimization/analyze';
import { getRecentEvaluationRecords, getMisclassifiedRecords } from '@/lib/optimization/collect-data';

/**
 * 获取模型分析数据
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type') || 'overview';

    console.log('获取模型分析数据, type:', type);

    switch (type) {
      case 'metrics':
        // 获取模型性能指标
        const metrics = await calculateModelMetrics();
        return NextResponse.json({
          success: true,
          data: metrics,
        });

      case 'patterns':
        // 获取误判模式
        const patterns = await analyzeMisclassificationPatterns();
        return NextResponse.json({
          success: true,
          data: patterns,
        });

      case 'should-optimize':
        // 判断是否需要优化
        const should = await shouldOptimize();
        return NextResponse.json({
          success: true,
          data: should,
        });

      case 'records':
        // 获取最近的评估记录
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const records = await getRecentEvaluationRecords(limit);
        return NextResponse.json({
          success: true,
          data: records,
        });

      case 'misclassified':
        // 获取误判案例
        const misclassified = await getMisclassifiedRecords();
        return NextResponse.json({
          success: true,
          data: misclassified,
        });

      case 'overview':
      default:
        // 获取概览数据
        const [metricsData, patternsData, recentRecords] = await Promise.all([
          calculateModelMetrics(),
          analyzeMisclassificationPatterns(),
          getRecentEvaluationRecords(10),
        ]);

        return NextResponse.json({
          success: true,
          data: {
            metrics: metricsData,
            patterns: patternsData,
            recentRecords: recentRecords,
          },
        });
    }
  } catch (error) {
    console.error('获取分析数据失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取分析数据失败',
      },
      { status: 500 }
    );
  }
}
