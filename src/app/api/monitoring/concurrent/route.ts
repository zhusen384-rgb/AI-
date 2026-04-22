import { NextRequest, NextResponse } from "next/server";
import { getConcurrentStats, resetConcurrentStats, logConcurrentStats } from "@/lib/llm-client";

/**
 * 获取并发监控统计信息
 * GET /api/monitoring/concurrent
 */
export async function GET(request: NextRequest) {
  const stats = getConcurrentStats();

  return NextResponse.json({
    success: true,
    data: {
      activeRequests: stats.activeRequests,
      totalRequests: stats.totalRequests,
      rateLimitErrors: stats.rateLimitErrors,
      otherErrors: stats.otherErrors,
      errorRate: stats.totalRequests > 0 
        ? ((stats.rateLimitErrors + stats.otherErrors) / stats.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    },
  });
}

/**
 * 重置并发监控统计信息
 * POST /api/monitoring/concurrent/reset
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "reset") {
    resetConcurrentStats();
    logConcurrentStats('stats reset');
    return NextResponse.json({
      success: true,
      message: "并发监控统计已重置",
    });
  }

  return NextResponse.json({
    success: false,
    error: "未知的操作",
  }, { status: 400 });
}
