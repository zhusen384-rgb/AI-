import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";
import { getInterviewSession } from "@/lib/db/session-utils";
import { invokeWithRetry, logConcurrentStats } from "@/lib/llm-client";
import { getModelId } from "@/lib/db/model-config-utils";
import { getAiScoreRule, type ScoreRuleConfig, type ScoreRuleDimension, type QuestionBankItem } from "@/lib/ai-score-rules";
import { getQuestionById } from "@/lib/data/technical-questions";

type DimensionEvaluation = {
  score100: number;
  basis: string;
  evidence: string[];
  risk?: string;
};

type EvaluationResult = {
  isEliminated: boolean;
  eliminationReason: string | null;
  overallScore5: number;
  overallScore100: number;
  categoryScores: Record<string, { score: number; basis: string }>;
  categoryLabels: Record<string, string>;
  summary: string;
  strengths: string[];
  improvements: string[];
  observations: Array<{ category: string; observation: string; time: string }>;
  recommendation: "hire" | "consider" | "reject";
  ruleInfo?: {
    positionKey: string;
    positionName: string;
    ruleName: string;
    ruleVersion: string;
  };
  dimensionResults?: Array<{
    code: string;
    name: string;
    weight: number;
    score100: number;
    score5: number;
    weightedScore: number;
    basis: string;
    evidence: string[];
    risk?: string;
  }>;
};

async function autoSaveEvaluation(interviewId: string, session: any, evaluation: EvaluationResult) {
  try {
    await ensureFullAiInterviewResultsTable();
    const db = await getDb();
    const existingRecords = await db
      .select()
      .from(fullAiInterviewResults)
      .where(eq(fullAiInterviewResults.interviewId, interviewId))
      .limit(1);

    if (existingRecords.length > 0) {
      await db
        .update(fullAiInterviewResults)
        .set({
          evaluation,
          completedAt: new Date(),
        })
        .where(eq(fullAiInterviewResults.interviewId, interviewId));
      return;
    }

    await db.insert(fullAiInterviewResults).values({
      interviewId,
      linkId: session.linkId || interviewId,
      candidateName: session.candidateName || "",
      position: session.position?.name || session.position?.title || session.position || "",
      evaluation,
      recordingKey: null,
      recordingUrl: null,
      qaHistory: null,
      candidateStatus: {
        overallStatus: "normal",
        summary: "状态监控未启用",
        events: [],
        statistics: {
          totalDuration: 0,
          normalDuration: 0,
          abnormalDuration: 0,
          cheatingDuration: 0,
          faceDetectionRate: 0,
          faceLostCount: 0,
          multipleFaceCount: 0,
          suspiciousActions: 0,
        },
      },
      completedAt: new Date(),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[evaluate] 自动保存失败:", error);
  }
}

function clampScore100(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function score100ToScore5(score100: number): number {
  const score5 = score100 / 20;
  return Math.max(1, Math.min(5, Math.round(score5)));
}

function getRecommendation(overallScore100: number, thresholds: ScoreRuleConfig["thresholds"]): "hire" | "consider" | "reject" {
  if (overallScore100 >= thresholds.hire) {
    return "hire";
  }
  if (overallScore100 >= thresholds.consider) {
    return "consider";
  }
  return "reject";
}

function getSessionPositionInfo(session: any): { positionKey: string; positionName: string } {
  const positionObject = session.position;
  const positionKey = String(session.positionId || positionObject?.id || positionObject?.key || "general");
  const positionName = String(positionObject?.name || positionObject?.title || positionObject || positionKey);
  return { positionKey, positionName };
}

function buildConversationHistory(session: any): string {
  return session.messages
    .filter((message: any) => ["assistant", "candidate", "user"].includes(message.role))
    .map((message: any) => `${message.role === "assistant" ? "面试官" : "候选人"}: ${message.content}`)
    .join("\n");
}

function buildTechnicalQuestionsAppendix(session: any): string {
  const lines: string[] = [];

  // 旧版技术题库（ai_management 专用）
  if (Array.isArray(session.technicalQuestionIds) && session.technicalQuestionIds.length > 0) {
    lines.push("【技术题与标准答案参考】");
    session.technicalQuestionIds.forEach((questionId: number, index: number) => {
      const question = getQuestionById(questionId);
      if (!question) {
        return;
      }
      lines.push(`题目${index + 1}: ${question.question}`);
      lines.push(`标准答案要点: ${question.standardAnswer}`);
      lines.push(`评分标准: ${question.scoringCriteria}`);
    });
  }

  // 规则题库（适用于所有岗位）
  if (Array.isArray(session.ruleQuestionBank) && session.ruleQuestionBank.length > 0) {
    if (lines.length === 0) {
      lines.push("【随机题库题目与标准答案参考】");
    } else {
      lines.push("");
      lines.push("【随机题库补充题目与标准答案参考】");
    }
    (session.ruleQuestionBank as QuestionBankItem[]).forEach((item: QuestionBankItem, index: number) => {
      lines.push(`题目${index + 1}: ${item.question}`);
      lines.push(`标准答案要点: ${item.standardAnswer}`);
      lines.push(`评分标准: ${item.scoringCriteria}`);
      if (item.dimensionCode) {
        lines.push(`所属维度: ${item.dimensionCode}`);
      }
    });
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

async function checkEliminationConditions(session: any, conversationHistory: string) {
  const prompt = `你是一位专业的HR和面试官，负责${session.position?.name || "当前岗位"}岗位的淘汰情形检查。

【候选人信息】
候选人姓名：${session.candidateName}

【面试对话记录】
${conversationHistory}

【淘汰情形列表】
请逐一检查以下淘汰情形，只要满足任意一项，即判定为淘汰：
1. 伪造关键信息
2. 态度恶劣、辱骂、恶意挑衅
3. 明确拒绝岗位核心工作
4. 认同明显违规行为
5. 经提醒后仍持续处理与面试无关事务
6. 由他人代答或明显查阅现成答案
7. 明确表达轻视客户或职业规范
8. 长期沉默、拒绝回答关键问题
9. 连续敷衍回答且缺乏基本求职诚意

【输出格式】
只返回 JSON：
{
  "isEliminated": true,
  "reason": "触发的淘汰原因"
}
或
{
  "isEliminated": false,
  "reason": ""
}`;

  const evaluationModelId = await getModelId("evaluation");
  const response = await invokeWithRetry(
    [
      { role: "system", content: prompt },
      { role: "user", content: "请判断是否触发淘汰情形。" },
    ],
    { model: evaluationModelId, temperature: 0.1 }
  );

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : response.content);
  } catch (error) {
    console.error("[evaluate] 解析淘汰检查失败:", error);
    return { isEliminated: false, reason: "" };
  }
}

function buildRulePrompt(rule: ScoreRuleConfig, session: any, conversationHistory: string): string {
  const dimensionText = rule.dimensions
    .map((dimension, index) => {
      const evidenceText = (dimension.evidenceHints || []).length > 0
        ? `证据提示：${dimension.evidenceHints?.join("、")}`
        : "证据提示：请从真实回答中提炼可验证证据";
      return `${index + 1}. ${dimension.name}（code: ${dimension.code}，weight: ${(dimension.weight * 100).toFixed(0)}%）
维度说明：${dimension.description}
评分规则：${dimension.scoringRule}
${evidenceText}`;
    })
    .join("\n\n");

  return `你是一位严谨的招聘评估官，请根据岗位评分规则，对候选人进行量化评分。

【岗位】
岗位名称：${rule.positionName}
岗位标识：${rule.positionKey}
规则名称：${rule.ruleName}
规则版本：${rule.ruleVersion}

【候选人】
姓名：${session.candidateName}

【面试对话记录】
${conversationHistory}

${buildTechnicalQuestionsAppendix(session)}

【评分维度】
${dimensionText}

【评分要求】
1. 每个维度输出 0-100 分。
2. 分数必须严格依据对话证据，不能臆测。
3. basis 必须说明给分原因。
4. evidence 至少给出 1 条，最多 3 条，必须来自候选人真实表述。
5. risk 填写该维度仍需复核的风险，没有则填空字符串。
6. summary 要总结候选人与岗位的整体匹配度。
7. strengths 和 improvements 各输出 3 条以内。
8. observations 输出 1-3 条关键观察，包含 category、observation、time，其中 time 没有明确时间就填“面试过程”。
${rule.promptTemplate ? `9. 补充要求：${rule.promptTemplate}` : ""}

【输出格式】
只返回 JSON：
{
  "dimensions": {
    "${rule.dimensions[0]?.code || "dimension_code"}": {
      "score100": 0,
      "basis": "给分原因",
      "evidence": ["证据1"],
      "risk": ""
    }
  },
  "summary": "整体总结",
  "strengths": ["优势1"],
  "improvements": ["建议1"],
  "observations": [
    {
      "category": "沟通表达",
      "observation": "候选人在追问时能快速补充细节",
      "time": "面试过程"
    }
  ]
}`;
}

async function evaluateWithRule(
  session: any,
  conversationHistory: string,
  rule: ScoreRuleConfig
): Promise<EvaluationResult> {
  const prompt = buildRulePrompt(rule, session, conversationHistory);
  const evaluationModelId = await getModelId("evaluation");
  const response = await invokeWithRetry(
    [
      { role: "system", content: prompt },
      { role: "user", content: "请给出评分结果。" },
    ],
    { model: evaluationModelId, temperature: 0.2 }
  );

  let parsed: {
    dimensions?: Record<string, DimensionEvaluation>;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    observations?: Array<{ category: string; observation: string; time: string }>;
  } = {};

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response.content);
  } catch (error) {
    console.error("[evaluate] 解析评分结果失败:", error);
  }

  const dimensionResults = rule.dimensions.map((dimension: ScoreRuleDimension) => {
    const raw = parsed.dimensions?.[dimension.code];
    const score100 = clampScore100(raw?.score100 ?? 0);
    const score5 = score100ToScore5(score100);
    const weightedScore = Math.round(score100 * dimension.weight * 100) / 100;
    return {
      code: dimension.code,
      name: dimension.name,
      weight: dimension.weight,
      score100,
      score5,
      weightedScore,
      basis: raw?.basis || "未获取到充分证据，按保守分处理。",
      evidence: Array.isArray(raw?.evidence) ? raw?.evidence.filter(Boolean).slice(0, 3) : [],
      risk: raw?.risk || "",
    };
  });

  const overallScore100 = Math.round(
    dimensionResults.reduce((sum, item) => sum + item.score100 * item.weight, 0)
  );
  const overallScore5 = Math.round((overallScore100 / 20) * 10) / 10;
  const categoryScores = Object.fromEntries(
    dimensionResults.map((item) => [item.code, { score: item.score5, basis: item.basis }])
  );
  const categoryLabels = Object.fromEntries(
    dimensionResults.map((item) => [item.code, item.name])
  );

  return {
    isEliminated: false,
    eliminationReason: null,
    overallScore5,
    overallScore100,
    categoryScores,
    categoryLabels,
    summary: parsed.summary || `候选人与${rule.positionName}岗位存在一定匹配度，建议结合关键维度明细进一步判断。`,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 3) : [],
    observations: Array.isArray(parsed.observations) ? parsed.observations.slice(0, 3) : [],
    recommendation: getRecommendation(overallScore100, rule.thresholds),
    ruleInfo: {
      positionKey: rule.positionKey,
      positionName: rule.positionName,
      ruleName: rule.ruleName,
      ruleVersion: rule.ruleVersion,
    },
    dimensionResults,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { interviewId } = await request.json();
    if (!interviewId) {
      return NextResponse.json({ error: "请提供面试ID" }, { status: 400 });
    }

    const session = await getInterviewSession(interviewId);
    if (!session) {
      return NextResponse.json({ error: "面试会话不存在" }, { status: 404 });
    }

    const candidateMessageCount = session.messages.filter((message: any) => message.role === "user" || message.role === "candidate").length;
    if (candidateMessageCount < 3) {
      const incompleteEvaluation: EvaluationResult = {
        isEliminated: true,
        eliminationReason: "对话轮次不足，候选人未完成面试。",
        overallScore5: 0,
        overallScore100: 0,
        categoryScores: {},
        categoryLabels: {},
        summary: "候选人未完成面试，对话轮次不足，无法进行有效评估。",
        strengths: [],
        improvements: [],
        observations: [],
        recommendation: "reject",
      };
      void autoSaveEvaluation(interviewId, session, incompleteEvaluation);
      return NextResponse.json({ success: true, evaluation: incompleteEvaluation });
    }

    const conversationHistory = buildConversationHistory(session);
    logConcurrentStats(`evaluate - interviewId=${interviewId}`);

    const eliminationCheckResult = await checkEliminationConditions(session, conversationHistory);
    if (eliminationCheckResult.isEliminated) {
      const eliminationEvaluation: EvaluationResult = {
        isEliminated: true,
        eliminationReason: eliminationCheckResult.reason,
        overallScore5: 0,
        overallScore100: 0,
        categoryScores: {},
        categoryLabels: {},
        summary: `候选人被淘汰：${eliminationCheckResult.reason}`,
        strengths: [],
        improvements: [],
        observations: [],
        recommendation: "reject",
      };
      void autoSaveEvaluation(interviewId, session, eliminationEvaluation);
      return NextResponse.json({ success: true, evaluation: eliminationEvaluation });
    }

    const { positionKey, positionName } = getSessionPositionInfo(session);
    const rule = await getAiScoreRule(positionKey, positionName);
    const evaluation = await evaluateWithRule(session, conversationHistory, rule);
    void autoSaveEvaluation(interviewId, session, evaluation);

    return NextResponse.json({ success: true, evaluation });
  } catch (error) {
    console.error("[evaluate] 评估失败:", error);
    return NextResponse.json({ error: "评估失败，请重试" }, { status: 500 });
  }
}
