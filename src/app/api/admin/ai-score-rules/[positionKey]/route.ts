import { NextRequest, NextResponse } from "next/server";
import { authenticateApi, isAuthError } from "@/lib/api-auth";
import { getAiScoreRule, getBuiltinRule, upsertAiScoreRule } from "@/lib/ai-score-rules";

type RouteContext = {
  params: Promise<{
    positionKey: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const payload = await authenticateApi(request);
    if (payload.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "仅超级管理员可访问" }, { status: 403 });
    }

    const params = await context.params;
    const positionKey = decodeURIComponent(params.positionKey);
    const positionName = request.nextUrl.searchParams.get("positionName");

    let rule;
    try {
      rule = await getAiScoreRule(positionKey, positionName);
    } catch (dbError) {
      console.error("[ai-score-rules detail GET] 数据库查询失败，回退到内置规则:", dbError);
      // 数据库查询失败时回退到内置规则
      rule = getBuiltinRule(positionKey, positionName);
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[ai-score-rules detail GET] 获取规则失败:", error);
    return NextResponse.json({ success: false, error: "获取评分规则失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const payload = await authenticateApi(request);
    if (payload.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "仅超级管理员可访问" }, { status: 403 });
    }

    const { positionKey } = await context.params;
    const body = await request.json();
    const positionName = body.positionName || request.nextUrl.searchParams.get("positionName");

    if (!positionName) {
      return NextResponse.json({ success: false, error: "请提供岗位名称" }, { status: 400 });
    }

    const rule = await upsertAiScoreRule(
      {
        ...body,
        positionKey,
        positionName,
      },
      payload.userId
    );

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[ai-score-rules detail PUT] 更新规则失败:", error);
    return NextResponse.json({ success: false, error: "更新评分规则失败" }, { status: 500 });
  }
}
