import { NextRequest, NextResponse } from "next/server";
import { authenticateApi, isAuthError } from "@/lib/api-auth";
import { listAiScoreRules, upsertAiScoreRule, type ScoreRuleConfig } from "@/lib/ai-score-rules";

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    if (payload.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "仅超级管理员可访问" }, { status: 403 });
    }

    let rules: ScoreRuleConfig[];
    try {
      rules = await listAiScoreRules();
    } catch (dbError) {
      console.error("[ai-score-rules GET] 数据库查询失败，返回空列表:", dbError);
      // 数据库不可用时返回空列表（内置规则会在详情页回退使用）
      rules = [];
    }

    return NextResponse.json({ success: true, data: rules });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[ai-score-rules GET] 获取规则失败:", error);
    return NextResponse.json({ success: false, error: "获取评分规则失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    if (payload.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "仅超级管理员可访问" }, { status: 403 });
    }

    const body = await request.json();
    const { positionKey, positionName } = body;

    if (!positionKey || !positionName) {
      return NextResponse.json({ success: false, error: "请提供岗位标识和岗位名称" }, { status: 400 });
    }

    const rule = await upsertAiScoreRule(body, payload.userId);
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[ai-score-rules POST] 保存规则失败:", error);
    return NextResponse.json({ success: false, error: "保存评分规则失败" }, { status: 500 });
  }
}
