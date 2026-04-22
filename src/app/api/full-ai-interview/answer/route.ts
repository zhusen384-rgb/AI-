import { NextRequest, NextResponse } from "next/server";
import { invokeWithRetry, isRateLimitErrorMessage, logConcurrentStats } from "@/lib/llm-client";
import { getInterviewSession as getDbInterviewSession, saveInterviewSession as saveDbInterviewSession } from "@/lib/db/session-utils";
import { getModelId } from "@/lib/db/model-config-utils";
import { getRandomTechnicalQuestions, getQuestionById, TECHNICAL_QUESTIONS } from "@/lib/data/technical-questions";
import { getAiScoreRule, getRandomQuestionsFromBank, type ScoreRuleConfig, type ScoreRuleDimension, type ScoreRuleRequiredQuestion, type QuestionBankItem } from "@/lib/ai-score-rules";
import { getServerBaseUrl } from "@/lib/server-base-url";
import {
  createRuleDrivenRuntimeState,
  updateCoverageAfterAnswer,
  markQuestionAsked,
  pickNextRequiredQuestion,
  selectNextDimension,
  shouldMoveToStage3,
  type CurrentQuestionMeta,
  type DimensionCoverageState,
  type RequiredQuestionRuntimeState,
} from "@/lib/full-ai-interview/rule-driven-interview";

// 面试会话消息类型
interface InterviewMessage {
  role: 'user' | 'assistant';
  content: string;
  stage?: number;
}

// 面试会话类型
interface InterviewSession {
  interviewId: string;
  linkId: string;
  candidateName: string;
  mode: string;
  position: any;
  positionId: string;
  resume: string;
  resumeParsedData?: any; // 结构化的简历解析数据
  messages: InterviewMessage[];
  interviewStage: number;
  followUpCount: number;
  currentQuestionCount: number;
  startTime: Date;
  createdAt: Date;
  aiCanMoveToStage3?: boolean; // AI 建议是否可以进入第三阶段
  scoreRuleSnapshot?: ScoreRuleConfig | null;
  dimensionCoverage?: Record<string, DimensionCoverageState> | null;
  requiredQuestionState?: RequiredQuestionRuntimeState[] | null;
  currentQuestionMeta?: CurrentQuestionMeta | null;
  askedQuestionKeys?: string[] | null;
  // 技术基础能力题目相关字段
  technicalQuestionIds?: number[]; // 已抽取的技术题目ID列表
  currentTechnicalQuestionIndex?: number; // 当前技术题目索引
  technicalQuestionsAsked?: number; // 已问的技术题目数量
  isCurrentQuestionTechnical?: boolean; // 当前问题是否是技术题
  // 规则题库相关字段（适用于所有岗位）
  ruleQuestionBank?: QuestionBankItem[]; // 从规则题库中抽取的题目列表
  ruleQuestionBankAsked?: number; // 已问的规则题库题目数量
  isCurrentQuestionFromBank?: boolean; // 当前问题是否来自规则题库
}

type ScoreRuleCacheEntry = {
  expiresAt: number;
  rule: ScoreRuleConfig;
};

const SCORE_RULE_CACHE_TTL_MS = 5 * 60 * 1000;
const scoreRuleCache = new Map<string, ScoreRuleCacheEntry>();

// 获取面试会话数据（仅从数据库获取）
const getInterviewSession = async (interviewId: string): Promise<InterviewSession | null> => {
  const dbSession = await getDbInterviewSession(interviewId);
  if (dbSession) {
    console.log(`[answer] 从数据库获取到会话: ${interviewId}`);
    return dbSession as unknown as InterviewSession;
  }

  return null;
};

function buildScoreRuleCacheKey(positionId: string, positionName: string) {
  return `${positionId.trim().toLowerCase()}::${positionName.trim().toLowerCase()}`;
}

async function getCachedAiScoreRule(positionId: string, positionName: string): Promise<ScoreRuleConfig> {
  const cacheKey = buildScoreRuleCacheKey(positionId, positionName);
  const cachedEntry = scoreRuleCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.rule;
  }

  if (cachedEntry) {
    scoreRuleCache.delete(cacheKey);
  }

  const rule = await getAiScoreRule(positionId, positionName);
  scoreRuleCache.set(cacheKey, {
    rule,
    expiresAt: Date.now() + SCORE_RULE_CACHE_TTL_MS,
  });

  return rule;
}

function cloneSessionSnapshot(session: InterviewSession): InterviewSession {
  if (typeof structuredClone === "function") {
    return structuredClone(session);
  }
  return JSON.parse(JSON.stringify(session)) as InterviewSession;
}

async function persistInterviewSessionSnapshot(session: InterviewSession, context: string): Promise<void> {
  try {
    await saveDbInterviewSession(session);
  } catch (saveError) {
    console.error(`[${context}] 保存会话到数据库失败:`, saveError);
  }
}

// 检测候选人问题是否涉及公司相关信息
const isCompanyRelatedQuestion = (answer: string): boolean => {
  const companyKeywords = [
    "公司", "企业", "集团", "发展史", "企业文化", "公司架构",
    "员工风采", "品牌", "合作", "未来规划", "历史", "荣誉",
    "介绍", "概况", "怎么样", "做什麽", "主营业务", "业务范围",
    "规模", "人数", "成立时间", "创始人", "总部", "分店",
    "员工", "团队", "福利", "培训", "晋升", "发展", "前景"
  ];

  const lowerAnswer = answer.toLowerCase();
  return companyKeywords.some(keyword => lowerAnswer.includes(keyword));
};

// 搜索知识库获取公司相关信息
const searchCompanyInfo = async (request: NextRequest, query: string): Promise<string> => {
  try {
    console.log(`[知识库] 搜索公司信息: "${query}"`);

    const searchResponse = await fetch(`${getServerBaseUrl(request)}/api/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query,
        topK: 5,
        minScore: 0.3
      }),
    });

    const result = await searchResponse.json();
    if (result.success && result.results && result.results.length > 0) {
      console.log(`[知识库] 找到 ${result.results.length} 个相关结果`);
      return result.results
        .map((r: any) => `${r.docName}: ${r.content}`)
        .join('\n\n');
    }

    console.log("[知识库] 未找到相关信息");
    return "";
  } catch (error) {
    console.error("[知识库] 搜索失败:", error);
    return "";
  }
};

// 格式化候选人的结构化简历信息
const formatCandidateStructuredInfo = (session: InterviewSession): string => {
  let structuredInfo = "";

  // 尝试从session中获取结构化信息（如果有candidateId）
  if (session.resumeParsedData && session.resumeParsedData.parsedData) {
    const parsed = session.resumeParsedData.parsedData;

    // 工作经历
    if (parsed.workExperience && parsed.workExperience.length > 0) {
      structuredInfo += "\n【工作经历】\n";
      parsed.workExperience.forEach((exp: any, idx: number) => {
        structuredInfo += `${idx + 1}. ${exp.company} - ${exp.position} (${exp.duration})\n`;
        if (exp.responsibilities && exp.responsibilities.length > 0) {
          structuredInfo += `   职责：${exp.responsibilities.join('、')}\n`;
        }
        if (exp.achievements && exp.achievements.length > 0) {
          structuredInfo += `   成就：${exp.achievements.join('、')}\n`;
        }
      });
    }

    // 教育背景
    if (parsed.education) {
      structuredInfo += "\n【教育背景】\n";
      structuredInfo += `学校：${parsed.education.school || '未填写'}\n`;
      structuredInfo += `专业：${parsed.education.major || '未填写'}\n`;
      structuredInfo += `学历：${parsed.education.degree || '未填写'}\n`;
      if (parsed.education.gpa) {
        structuredInfo += `成绩：${parsed.education.gpa}\n`;
      }
    }

    // 技能
    if (parsed.skills && parsed.skills.length > 0) {
      structuredInfo += "\n【技能】\n";
      parsed.skills.forEach((skill: any) => {
        structuredInfo += `- ${skill.name} (${skill.level || '未标注'})\n`;
      });
    }

    // 证书
    if (parsed.certificates && parsed.certificates.length > 0) {
      structuredInfo += "\n【证书】\n";
      parsed.certificates.forEach((cert: any, idx: number) => {
        structuredInfo += `${idx + 1}. ${cert.name}${cert.level ? ` (${cert.level})` : ''}${cert.date ? ` - ${cert.date}` : ''}\n`;
      });
    }

    // 项目经验
    if (parsed.projects && parsed.projects.length > 0) {
      structuredInfo += "\n【项目经验】\n";
      parsed.projects.forEach((project: any, idx: number) => {
        structuredInfo += `${idx + 1}. ${project.name}\n`;
        if (project.description) {
          structuredInfo += `   描述：${project.description}\n`;
        }
        if (project.role) {
          structuredInfo += `   角色：${project.role}\n`;
        }
        if (project.technologies && project.technologies.length > 0) {
          structuredInfo += `   技术：${project.technologies.join('、')}\n`;
        }
      });
    }

    // 岗位匹配分析
    if (parsed.matchAnalysis) {
      const ma = parsed.matchAnalysis;

      // 匹配项
      if (ma.matchedItems && ma.matchedItems.length > 0) {
        structuredInfo += "\n【✅ 匹配项】\n";
        ma.matchedItems.forEach((item: any, idx: number) => {
          structuredInfo += `${idx + 1}. 要求：${item.requirement}\n`;
          structuredInfo += `   证据：${item.evidence}\n`;
        });
      }

      // 优势
      if (ma.strengths && ma.strengths.length > 0) {
        structuredInfo += "\n【💪 优势】\n";
        ma.strengths.forEach((s: any, idx: number) => {
          if (typeof s === 'string') {
            structuredInfo += `${idx + 1}. ${s}\n`;
          } else {
            structuredInfo += `${idx + 1}. ${s.area || s.description || ''}\n`;
            if (s.evidence) {
              structuredInfo += `   证据：${s.evidence}\n`;
            }
          }
        });
      }

      // 潜在不足
      if (ma.weaknesses && ma.weaknesses.length > 0) {
        structuredInfo += "\n【⚠️ 潜在不足】\n";
        ma.weaknesses.forEach((w: any, idx: number) => {
          if (typeof w === 'string') {
            structuredInfo += `${idx + 1}. ${w}\n`;
          } else {
            structuredInfo += `${idx + 1}. ${w.area || w.description || ''}\n`;
            if (w.gap) {
              structuredInfo += `   缺失：${w.gap}\n`;
            }
          }
        });
      }

      // 待确认项（未匹配项）
      if (ma.unmatchedItems && ma.unmatchedItems.length > 0) {
        structuredInfo += "\n【⚠️ 待确认项】\n";
        ma.unmatchedItems.forEach((item: any, idx: number) => {
          structuredInfo += `${idx + 1}. 要求：${item.requirement}\n`;
          structuredInfo += `   缺失：${item.gap}\n`;
        });
      }
    }

    // 冲突标记（潜在问题）
    if (parsed.conflictMarkers && parsed.conflictMarkers.length > 0) {
      structuredInfo += "\n【⚠️ 潜在问题】\n";
      parsed.conflictMarkers.forEach((conflict: any, idx: number) => {
        structuredInfo += `${idx + 1}. ${conflict.type || '问题'}: ${conflict.description}\n`;
      });
    }
  }

  return structuredInfo || "\n（暂无结构化信息）";
};

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function buildRateLimitFallbackQuestion(
  session: InterviewSession,
  candidateAnswer: string,
  companyInfo: string = ""
): {
  question: string;
  shouldEnd: boolean;
  isFollowUp: boolean;
  canMoveToStage3?: boolean;
  evaluationCompleteness?: string;
  sufficientInfo?: string;
} {
  const positionName = session.position?.name || session.position || "当前岗位";
  const snippet = compactText(candidateAnswer, 48);
  const requirements = Array.isArray(session.position?.requirements)
    ? session.position.requirements.filter(Boolean)
    : [];
  const isAiManagement = session.positionId === "ai_management" || session.position?.id === "ai_management";
  const requiredQuestions = isAiManagement ? 9 : 6;

  if (session.interviewStage === 1) {
    return {
      question: `感谢你的自我介绍。接下来想请你结合一次和${positionName}最相关的经历，具体讲讲你当时负责的事情、采取了哪些做法，以及最后取得了什么结果？`,
      shouldEnd: false,
      isFollowUp: false,
      canMoveToStage3: false,
    };
  }

  if (session.interviewStage === 3) {
    const companySummary = compactText(companyInfo, 180);
    return {
      question: companySummary
        ? `关于你刚才的问题，我先做一个简要说明：${companySummary}。你还有其他想了解的吗？`
        : "关于公司和岗位的细节，后续也可以和 HR 做进一步确认。你还有其他想了解的吗？",
      shouldEnd: false,
      isFollowUp: false,
    };
  }

  if ((session.followUpCount || 0) === 0) {
    return {
      question: `你刚才提到了“${snippet || "这段经历"}”，能具体说说当时你的职责分工、关键动作，以及最终结果或数据表现吗？`,
      shouldEnd: false,
      isFollowUp: true,
      canMoveToStage3: false,
      evaluationCompleteness: "部分",
      sufficientInfo: "否",
    };
  }

  if ((session.followUpCount || 0) === 1) {
    return {
      question: `如果把这段经历再复盘一次，你觉得最大的挑战是什么？你当时是怎么解决的，又从中学到了什么？`,
      shouldEnd: false,
      isFollowUp: true,
      canMoveToStage3: false,
      evaluationCompleteness: "部分",
      sufficientInfo: "否",
    };
  }

  const focus = requirements.length > 0
    ? requirements[(session.currentQuestionCount || 0) % requirements.length]
    : "岗位核心能力";
  const canMoveToStage3 = (session.currentQuestionCount || 0) >= requiredQuestions;

  return {
    question: canMoveToStage3
      ? "好的，核心问题差不多了。接下来我简单介绍一下公司和岗位情况，然后你也可以继续问我关心的问题。"
      : `我们换一个角度，想重点了解你在“${focus}”方面的真实经验。请结合一个具体案例，讲讲当时的目标、做法和结果。`,
    shouldEnd: false,
    isFollowUp: false,
    canMoveToStage3,
    evaluationCompleteness: canMoveToStage3 ? "充分" : "部分",
    sufficientInfo: canMoveToStage3 ? "是" : "否",
  };
}

function getPositionName(session: InterviewSession): string {
  return session.position?.name || session.position || "当前岗位";
}

async function ensureRuleRuntimeState(session: InterviewSession): Promise<InterviewSession> {
  if (session.scoreRuleSnapshot && session.dimensionCoverage && session.requiredQuestionState) {
    return session;
  }

  const rule = await getCachedAiScoreRule(session.positionId, getPositionName(session));
  const runtime = createRuleDrivenRuntimeState(rule);
  return {
    ...session,
    scoreRuleSnapshot: rule,
    dimensionCoverage: runtime.dimensionCoverage,
    requiredQuestionState: runtime.requiredQuestionState,
    currentQuestionMeta: runtime.currentQuestionMeta,
    askedQuestionKeys: runtime.askedQuestionKeys,
  };
}

function buildRecentTranscript(messages: InterviewMessage[], maxItems: number = 8): string {
  return messages
    .slice(-maxItems)
    .map((message) => `${message.role === "assistant" ? "AI面试官" : "候选人"}: ${message.content}`)
    .join("\n");
}

function chooseTemplate(dimension: ScoreRuleDimension, isFollowUp: boolean): string {
  const source = isFollowUp ? dimension.followUpTemplates : dimension.questionTemplates;
  if (Array.isArray(source) && source.length > 0) {
    return source[0];
  }
  if (isFollowUp) {
    return `你刚才提到的内容还可以再展开一些。请围绕${dimension.name}这个维度，补充说明更具体的做法、细节和结果。`;
  }
  return `请围绕${dimension.name}，结合真实经历讲一个最能体现你能力的具体案例。`;
}

function buildCurrentQuestionMeta(params: {
  dimensionCode: string;
  requiredQuestionId?: string;
  isFollowUp: boolean;
  source: "required_question" | "dimension_question" | "technical_question";
  questionText: string;
  targetEvidence: string[];
  maxFollowUps: number;
}): CurrentQuestionMeta {
  return {
    dimensionCode: params.dimensionCode,
    requiredQuestionId: params.requiredQuestionId,
    isFollowUp: params.isFollowUp,
    source: params.source,
    questionText: params.questionText,
    targetEvidence: params.targetEvidence,
    maxFollowUps: params.maxFollowUps,
  };
}

async function generateDynamicQuestion(
  session: InterviewSession,
  payload: {
    dimension: ScoreRuleDimension;
    isFollowUp: boolean;
    baseQuestion: string;
    reason: string;
    requiredQuestion?: RequiredQuestionRuntimeState | null;
  }
): Promise<string> {
  const prompt = `你是一位专业、自然、像真人一样交流的面试官，请为${getPositionName(session)}岗位生成下一句面试问题。

【目标维度】
维度名称：${payload.dimension.name}
维度说明：${payload.dimension.description}
评分规则：${payload.dimension.scoringRule}
证据提示：${(payload.dimension.evidenceHints || []).join("、") || "请获取可验证证据"}

【问题来源】
${payload.requiredQuestion ? `这是岗位必问题，请务必问到，但表达要自然，不要像在念模板。
必问题原文：${payload.requiredQuestion.question}
提问目的：${payload.requiredQuestion.purpose || "关键岗位验证"}
` : ""}
当前动作：${payload.isFollowUp ? "追问" : "新问题"}
生成原因：${payload.reason}
基础提问意图：${payload.baseQuestion}

【候选人信息】
候选人：${session.candidateName}
简历摘要：${compactText(session.resume || "", 500)}

【最近对话】
${buildRecentTranscript(session.messages)}

【要求】
1. 只输出一句自然的问题，不要输出JSON。
2. 更像真人面试，要有衔接感，不要机械切题。
3. 如果是追问，要紧扣候选人刚才的回答缺口。
4. 如果是必问题，要自然融入，不要让人感觉在背题库。
5. 问题尽量控制在 1-2 句。`;

  try {
    const interviewModelId = await getModelId("interview_dialog");
    const response = await invokeWithRetry(
      [
        { role: "system", content: prompt },
        { role: "user", content: "请生成问题。" },
      ],
      {
        model: interviewModelId,
        temperature: 0.6,
      }
    );
    return response.content.trim().replace(/^["']|["']$/g, "");
  } catch (error) {
    console.error("[answer] 动态生成问题失败，使用模板兜底:", error);
    return payload.baseQuestion;
  }
}

function markRequiredQuestionAsked(
  requiredQuestions: RequiredQuestionRuntimeState[] | null | undefined,
  requiredQuestionId?: string,
  currentQuestionCount?: number
): RequiredQuestionRuntimeState[] {
  if (!Array.isArray(requiredQuestions)) {
    return [];
  }
  if (!requiredQuestionId) {
    return requiredQuestions;
  }
  return requiredQuestions.map((item) =>
    item.id === requiredQuestionId
      ? { ...item, asked: true, askedAtQuestionCount: currentQuestionCount }
      : item
  );
}

async function planSecondStageQuestion(
  session: InterviewSession,
  candidateAnswer: string
): Promise<{
  question: string;
  isFollowUp: boolean;
  moveToStage3: boolean;
  nextMeta: CurrentQuestionMeta | null;
  nextCoverage: Record<string, DimensionCoverageState>;
  nextRequiredQuestionState: RequiredQuestionRuntimeState[];
  nextAskedQuestionKeys: string[];
}> {
  const rule = session.scoreRuleSnapshot as ScoreRuleConfig;
  let coverage = { ...(session.dimensionCoverage || {}) };
  let requiredQuestionState = Array.isArray(session.requiredQuestionState) ? [...session.requiredQuestionState] : [];
  const askedQuestionKeys = Array.isArray(session.askedQuestionKeys) ? [...session.askedQuestionKeys] : [];
  const strategy = rule.interviewStrategy;

  coverage = updateCoverageAfterAnswer(
    coverage,
    session.currentQuestionMeta || null,
    candidateAnswer,
    strategy
  );

  const lastMeta = session.currentQuestionMeta;
  if (lastMeta?.requiredQuestionId && lastMeta.source === "required_question") {
    requiredQuestionState = markRequiredQuestionAsked(requiredQuestionState, lastMeta.requiredQuestionId, session.currentQuestionCount);
  }

  const currentDimensionState = lastMeta?.dimensionCode ? coverage[lastMeta.dimensionCode] : null;
  const canFollowUp =
    !!lastMeta &&
    !!currentDimensionState?.needFollowUp &&
    (session.followUpCount || 0) < Math.min(lastMeta.maxFollowUps, strategy.maxFollowUpsPerQuestion);

  if (canFollowUp && lastMeta) {
    const dimension = rule.dimensions.find((item) => item.code === lastMeta.dimensionCode);
    if (dimension) {
      const baseQuestion = chooseTemplate(dimension, true);
      const question = await generateDynamicQuestion(session, {
        dimension,
        isFollowUp: true,
        baseQuestion,
        reason: "上一轮回答证据不足，需要补充细节、行动过程或结果。",
      });

      const nextMeta = buildCurrentQuestionMeta({
        dimensionCode: dimension.code,
        isFollowUp: true,
        source: lastMeta.source,
        requiredQuestionId: lastMeta.requiredQuestionId,
        questionText: question,
        targetEvidence: dimension.evidenceHints || [],
        maxFollowUps: Math.min(dimension.maxFollowUps ?? 2, strategy.maxFollowUpsPerQuestion),
      });

      return {
        question,
        isFollowUp: true,
        moveToStage3: false,
        nextMeta,
        nextCoverage: coverage,
        nextRequiredQuestionState: requiredQuestionState,
        nextAskedQuestionKeys: askedQuestionKeys,
      };
    }
  }

  const moveToStage3 = shouldMoveToStage3(
    rule,
    coverage,
    requiredQuestionState,
    session.currentQuestionCount || 0
  );
  if (moveToStage3) {
    return {
      question: "",
      isFollowUp: false,
      moveToStage3: true,
      nextMeta: null,
      nextCoverage: coverage,
      nextRequiredQuestionState: requiredQuestionState,
      nextAskedQuestionKeys: askedQuestionKeys,
    };
  }

  const pendingRequiredQuestion = pickNextRequiredQuestion(
    requiredQuestionState,
    session.currentQuestionCount || 0,
    strategy
  );

  if (pendingRequiredQuestion) {
    const dimension =
      rule.dimensions.find((item) => item.code === pendingRequiredQuestion.dimensionCode) ||
      selectNextDimension(rule, coverage);

    if (dimension) {
      let question = await generateDynamicQuestion(session, {
        dimension,
        isFollowUp: false,
        baseQuestion: pendingRequiredQuestion.question,
        reason: "当前轮次需要自然融入岗位必问题。",
        requiredQuestion: pendingRequiredQuestion,
      });

      if (askedQuestionKeys.includes(question)) {
        question = pendingRequiredQuestion.question;
      }

      const nextMeta = buildCurrentQuestionMeta({
        dimensionCode: dimension.code,
        isFollowUp: false,
        source: "required_question",
        requiredQuestionId: pendingRequiredQuestion.id,
        questionText: question,
        targetEvidence: dimension.evidenceHints || [],
        maxFollowUps: Math.min(pendingRequiredQuestion.maxFollowUps ?? 1, dimension.maxFollowUps ?? 2, strategy.maxFollowUpsPerQuestion),
      });

      return {
        question,
        isFollowUp: false,
        moveToStage3: false,
        nextMeta,
        nextCoverage: markQuestionAsked(coverage, dimension.code, false),
        nextRequiredQuestionState: markRequiredQuestionAsked(requiredQuestionState, pendingRequiredQuestion.id, (session.currentQuestionCount || 0) + 1),
        nextAskedQuestionKeys: [...askedQuestionKeys, question],
      };
    }
  }

  const nextDimension = selectNextDimension(rule, coverage);
  if (!nextDimension) {
    return {
      question: "",
      isFollowUp: false,
      moveToStage3: true,
      nextMeta: null,
      nextCoverage: coverage,
      nextRequiredQuestionState: requiredQuestionState,
      nextAskedQuestionKeys: askedQuestionKeys,
    };
  }

  let baseQuestion = chooseTemplate(nextDimension, false);
  let source: CurrentQuestionMeta["source"] = "dimension_question";
  // 优先检查旧版技术题库（ai_management 专用）
  if (
    nextDimension.code === "technical_foundation" &&
    Array.isArray(session.technicalQuestionIds) &&
    (session.technicalQuestionsAsked || 0) < session.technicalQuestionIds.length
  ) {
    const questionId = session.technicalQuestionIds[session.technicalQuestionsAsked || 0];
    const technicalQuestion = getQuestionById(questionId);
    if (technicalQuestion) {
      baseQuestion = technicalQuestion.question;
      source = "technical_question";
    }
  }
  // 检查规则题库（适用于所有岗位）
  if (
    source === "dimension_question" &&
    Array.isArray(session.ruleQuestionBank) &&
    session.ruleQuestionBank.length > 0 &&
    (session.ruleQuestionBankAsked || 0) < session.ruleQuestionBank.length
  ) {
    const bankItem = session.ruleQuestionBank[session.ruleQuestionBankAsked || 0];
    // 如果题目有 dimensionCode，只在对应维度时使用；没有 dimensionCode 则任意维度都可使用
    if (!bankItem.dimensionCode || bankItem.dimensionCode === nextDimension.code) {
      baseQuestion = bankItem.question;
      source = "technical_question";
    }
  }
  const question = await generateDynamicQuestion(session, {
    dimension: nextDimension,
    isFollowUp: false,
    baseQuestion,
    reason: `当前优先补齐“${nextDimension.name}”这个维度的证据覆盖。`,
  });

  const nextMeta = buildCurrentQuestionMeta({
    dimensionCode: nextDimension.code,
    isFollowUp: false,
    source,
    questionText: question,
    targetEvidence: nextDimension.evidenceHints || [],
    maxFollowUps: Math.min(nextDimension.maxFollowUps ?? 2, strategy.maxFollowUpsPerQuestion),
  });

  return {
    question,
    isFollowUp: false,
    moveToStage3: false,
    nextMeta,
    nextCoverage: markQuestionAsked(coverage, nextDimension.code, false),
    nextRequiredQuestionState: requiredQuestionState,
    nextAskedQuestionKeys: [...askedQuestionKeys, question],
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log("[answer API v1.0.5] ========== 开始处理回答 ==========");

    const { interviewId, candidateAnswer, currentRound } = await request.json();

    console.log("[answer API] 接收到的参数:");
    console.log("  - interviewId:", interviewId || 'N/A');
    console.log("  - candidateAnswer:", candidateAnswer || 'N/A');
    console.log("  - candidateAnswer 长度:", candidateAnswer?.length || 0);
    console.log("  - currentRound:", currentRound || 'N/A');

    if (!interviewId || !candidateAnswer) {
      console.error("[answer API] 缺少必要参数");
      return NextResponse.json(
        { error: "请提供面试ID和候选人回答" },
        { status: 400 }
      );
    }

    // 获取会话（从数据库或全局存储）
    const rawSession = await getInterviewSession(interviewId);
    if (!rawSession) {
      console.error(`[answer API] 面试会话不存在: interviewId=${interviewId}`);
      return NextResponse.json(
        { error: "面试会话不存在，请重新开始面试" },
        { status: 404 }
      );
    }
    const session = await ensureRuleRuntimeState(rawSession);

    console.log(`[answer API] 面试会话信息:`);
    console.log(`  - candidateName: ${session.candidateName}`);
    console.log(`  - position: ${session.position?.name}`);
    console.log(`  - interviewStage: ${session.interviewStage}`);
    console.log(`  - currentQuestionCount: ${session.currentQuestionCount}`);
    console.log(`  - followUpCount: ${session.followUpCount}`);
    console.log(`[answer API] ========== 面试会话信息结束 ==========`);

    // 将用户回答添加到会话历史
    session.messages.push({
      role: "user" as const,
      content: candidateAnswer,
      stage: session.interviewStage,
    });

    const candidateMessagePersistPromise = persistInterviewSessionSnapshot(
      cloneSessionSnapshot(session),
      "answer"
    );

    let nextQuestionPrompt = "";
    let questionContent = "";
    let shouldEnd: boolean = false;

    // 检测候选人是否表示"没有问题"（第三阶段专用）
    const checkCandidateNoQuestions = (answer: string): boolean => {
      // 只保留明确表示"没有问题"的表述，去掉可能误判的礼貌性回应
      const noQuestionKeywords = [
        // 明确否定类
        "没有", "没有了", "没", "没啥", "没什么", "没什么问题", "没啥问题", "没有问题",
        "暂时没有", "暂时没有问题", "暂时没了",
        "差不多了", "差不多", "可以了", "行了",
        "不用了", "不用", "不需要", "不需要了",
        "没了", "没了谢谢", "没有了谢谢",
        "没问题了", "没问题了谢谢",
        "行", "行吧", "行好的"
      ];
      
      const trimmedAnswer = answer.trim().toLowerCase();
      // 移除标点符号后再匹配
      const cleanAnswer = trimmedAnswer.replace(/[，。！？、；：,.!?;:\s]/g, "");
      
      // 检查是否完全匹配或包含"没有"类关键词
      for (const keyword of noQuestionKeywords) {
        // 精确匹配短回答
        if (cleanAnswer === keyword.toLowerCase() || trimmedAnswer === keyword.toLowerCase()) {
          return true;
        }
        // 包含关键否定短语
        if (cleanAnswer.includes("没有") && cleanAnswer.length <= 10) {
          return true;
        }
        if (cleanAnswer.includes("没了") && cleanAnswer.length <= 10) {
          return true;
        }
        if (cleanAnswer.includes("不用") && cleanAnswer.length <= 10) {
          return true;
        }
        if (cleanAnswer.includes("可以了") && cleanAnswer.length <= 10) {
          return true;
        }
        if (cleanAnswer.includes("差不多了") && cleanAnswer.length <= 15) {
          return true;
        }
      }
      
      return false;
    };

    // 检测候选人问题是否涉及公司相关信息
    const isCompanyQuestion = isCompanyRelatedQuestion(candidateAnswer);
    let companyInfo = "";

    // 在第三阶段，如果候选人表示"没有问题"，直接结束面试
    if (session.interviewStage === 3 && checkCandidateNoQuestions(candidateAnswer)) {
      console.log(`[面试] 候选人表示没有问题（回答："${candidateAnswer}"），直接结束面试`);
      
      questionContent = "好的，没有问题的话，那我们今天的面试就结束了。后续有问题也可以联系对应的人事，祝你生活愉快！";
      shouldEnd = true;
      
      // 保存AI面试官的结束语到会话
      const endMessage: InterviewMessage = {
        role: "assistant",
        content: questionContent,
        stage: 3,
      };
      session.messages = [...(session.messages || []), endMessage];
      
      // 更新数据库
      await candidateMessagePersistPromise;
      await persistInterviewSessionSnapshot(cloneSessionSnapshot(session), "answer-end");
      
      console.log(`[answer API] 面试结束，返回结束语`);
      
      return NextResponse.json({
        success: true,
        question: questionContent,
        shouldEnd: true,
        interviewStage: 3,
      });
    }

    if (isCompanyQuestion && session.interviewStage === 3) {
      // 在第三阶段（公司介绍和问答），搜索知识库获取公司信息
      console.log("[面试] 检测到候选人询问公司相关信息，开始搜索知识库...");
      companyInfo = await searchCompanyInfo(request, candidateAnswer);
    }

    // 根据当前阶段决定下一步操作
    if (session.interviewStage === 1) {
      console.log(`[面试阶段] 第一阶段（自我介绍）结束，进入第二阶段`);
      session.interviewStage = 2;
      session.currentQuestionCount = 0;
      session.followUpCount = 0;

      if (session.positionId === "ai_management" || session.position?.id === "ai_management") {
        const technicalQuestions = getRandomTechnicalQuestions(3 + Math.floor(Math.random() * 2));
        session.technicalQuestionIds = technicalQuestions.map((q) => q.id);
        session.technicalQuestionsAsked = 0;
        session.isCurrentQuestionTechnical = false;
      }

      // 从规则题库中抽取随机题目（适用于所有配置了题库的岗位）
      if (session.scoreRuleSnapshot) {
        const ruleBank = getRandomQuestionsFromBank(session.scoreRuleSnapshot);
        if (ruleBank.length > 0) {
          session.ruleQuestionBank = ruleBank;
          session.ruleQuestionBankAsked = 0;
          session.isCurrentQuestionFromBank = false;
          console.log(`[面试] 从规则题库抽取了 ${ruleBank.length} 道题目:`, ruleBank.map((q) => q.question.substring(0, 30)));
        }
      }

      const firstPlan = await planSecondStageQuestion(session, candidateAnswer);
      questionContent = firstPlan.question;
      session.currentQuestionMeta = firstPlan.nextMeta;
      session.dimensionCoverage = firstPlan.nextCoverage;
      session.requiredQuestionState = firstPlan.nextRequiredQuestionState;
      session.askedQuestionKeys = firstPlan.nextAskedQuestionKeys;
      session.followUpCount = firstPlan.isFollowUp ? 1 : 0;
      if (!firstPlan.isFollowUp) {
        session.currentQuestionCount++;
      }
      session.isCurrentQuestionTechnical = firstPlan.nextMeta?.source === "technical_question";
      // 如果第一道题就来自规则题库，递增计数
      if (firstPlan.nextMeta?.source === "technical_question" && !firstPlan.isFollowUp) {
        if (Array.isArray(session.ruleQuestionBank) && session.ruleQuestionBank.length > 0 && (session.ruleQuestionBankAsked || 0) < session.ruleQuestionBank.length) {
          session.ruleQuestionBankAsked = (session.ruleQuestionBankAsked || 0) + 1;
          session.isCurrentQuestionFromBank = true;
        }
      }
    } else if (session.interviewStage === 2) {
      const secondStagePlan = await planSecondStageQuestion(session, candidateAnswer);
      session.dimensionCoverage = secondStagePlan.nextCoverage;
      session.requiredQuestionState = secondStagePlan.nextRequiredQuestionState;
      session.askedQuestionKeys = secondStagePlan.nextAskedQuestionKeys;

      if (secondStagePlan.moveToStage3) {
        session.interviewStage = 3;
        session.currentQuestionMeta = null;
        session.followUpCount = 0;
        nextQuestionPrompt = generateThirdStagePrompt(session, companyInfo);
      } else {
        questionContent = secondStagePlan.question;
        session.currentQuestionMeta = secondStagePlan.nextMeta;
        session.followUpCount = secondStagePlan.isFollowUp ? (session.followUpCount || 0) + 1 : 0;
        if (!secondStagePlan.isFollowUp) {
          session.currentQuestionCount++;
          if (secondStagePlan.nextMeta?.source === "technical_question") {
            // 判断这道 technical_question 来自哪个题库并递增对应计数器
            const hasOldTechQuestions = Array.isArray(session.technicalQuestionIds) && session.technicalQuestionIds.length > 0;
            const hasRuleBank = Array.isArray(session.ruleQuestionBank) && session.ruleQuestionBank.length > 0;
            const ruleIdx = session.ruleQuestionBankAsked || 0;

            if (hasRuleBank && ruleIdx < session.ruleQuestionBank!.length) {
              // 如果规则题库尚有未问题目，优先认为这道题来自规则题库
              session.ruleQuestionBankAsked = ruleIdx + 1;
              session.isCurrentQuestionFromBank = true;
            }
            if (hasOldTechQuestions) {
              session.technicalQuestionsAsked = (session.technicalQuestionsAsked || 0) + 1;
            }
          }
        }
        session.isCurrentQuestionTechnical = secondStagePlan.nextMeta?.source === "technical_question";
      }
    }

    if (session.interviewStage === 3) {
      if (!questionContent) {
        nextQuestionPrompt = generateThirdStagePrompt(session, companyInfo);
      }

      const questionMessages = [
        {
          role: "system" as const,
          content: nextQuestionPrompt,
        },
        {
          role: "user" as const,
          content: "请根据当前阶段进行回复。",
        },
      ];

      console.log(`[answer API] 开始调用 LLM 生成第三阶段回复 - interviewId=${interviewId}`);
      logConcurrentStats(`answer-stage3 - interviewId=${interviewId}`);

      const interviewModelId = await getModelId('interview_dialog');
      let questionResponse: { content: string; raw: unknown };
      try {
        questionResponse = await invokeWithRetry(questionMessages, {
          model: interviewModelId,
          temperature: 0.7,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!isRateLimitErrorMessage(errorMessage)) {
          throw error;
        }

        const fallbackQuestion = buildRateLimitFallbackQuestion(session, candidateAnswer, companyInfo);
        questionResponse = {
          content: JSON.stringify(fallbackQuestion),
          raw: {
            fallback: "rate_limit",
            error: errorMessage,
          },
        };
      }

      try {
        const jsonMatch = questionResponse.content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : questionResponse.content.trim());
        questionContent = parsed.question;
        shouldEnd = parsed.shouldEnd || false;
      } catch (error) {
        console.error("[answer API] 解析第三阶段响应失败:", error);
        questionContent = questionResponse.content;
        shouldEnd = false;
      }
    }

    // 保存AI面试官的问题
    console.log("[answer API] ========== 准备保存AI回复到会话 ==========");
    console.log("[answer API] questionContent 前200字符:", questionContent.substring(0, 200));
    console.log("[answer API] questionContent 完整内容:", questionContent);
    console.log("[answer API] questionContent 长度:", questionContent.length);
    session.messages.push({
      role: "assistant" as const,
      content: questionContent,
      stage: session.interviewStage,
    });

    await candidateMessagePersistPromise;
    await persistInterviewSessionSnapshot(cloneSessionSnapshot(session), "answer API");

    console.log("[answer API v1.0.5] ========== 准备返回结果 ==========");
    console.log("  - success: true");
    console.log("  - question:", questionContent || 'N/A');
    console.log("  - question 长度:", questionContent?.length || 0);
    console.log("  - shouldEnd:", shouldEnd);
    console.log("  - interviewStage:", session.interviewStage);
    console.log("  - currentQuestionCount:", session.currentQuestionCount);
    console.log("  - followUpCount:", session.followUpCount);
    console.log(`[answer API v1.0.5] ========== 返回结果结束 ==========`);

    return NextResponse.json({
      success: true,
      question: questionContent,
      shouldEnd: shouldEnd,
      interviewStage: session.interviewStage,
    });
  } catch (error: any) {
    console.error("[answer API] ========== 生成追问失败 ==========");
    console.error("[answer API] 错误类型:", error?.constructor?.name || 'Unknown');
    console.error("[answer API] 错误消息:", error?.message || 'No message');
    console.error("[answer API] 错误堆栈:", error?.stack || 'No stack');
    console.error("[answer API] 错误对象:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error("[answer API] ========== 错误详情结束 ==========");

    return NextResponse.json(
      { error: `生成追问失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

// 生成第二阶段（核心问题提问）的提示词
// 提取已问问题的主题摘要（用于防止重复提问）
function extractAskedQuestionTopics(messages: any[]): string {
  const aiMessages = (messages || [])
    .filter((m: any) => m.role === 'assistant' && m.stage === 2)
    .map((m: any) => m.content);
  
  if (aiMessages.length === 0) {
    return "（暂无已问问题）";
  }
  
  // 提取问题主题（简化显示）
  const topics: string[] = [];
  aiMessages.forEach((msg: string, idx: number) => {
    // 提取问题的核心关键词
    const shortMsg = msg.length > 100 ? msg.substring(0, 100) + "..." : msg;
    topics.push(`${idx + 1}. ${shortMsg}`);
  });
  
  return topics.join('\n');
}

function generateSecondStagePrompt(session: any, isFirstQuestion: boolean, companyInfo: string = ""): string {
  const elapsedMinutes = (Date.now() - (session.startTime?.getTime?.() || Date.now())) / (1000 * 60);

  // 判断是否是智能体管培生岗位
  const isAiManagement = session.positionId === "ai_management" || session.position?.id === "ai_management";

  // 提取已问问题主题
  const askedQuestionTopics = extractAskedQuestionTopics(session.messages);

  // 技术题目处理
  let technicalQuestionInfo = "";
  let currentTechnicalQuestion = null;

  if (isAiManagement && session.technicalQuestionIds && session.technicalQuestionIds.length > 0) {
    const technicalQuestionsTotal = session.technicalQuestionIds.length;
    const technicalQuestionsAsked = session.technicalQuestionsAsked || 0;

    // 判断当前是否应该出技术题（在第3-5个问题时穿插技术题）
    // 策略：第3、5、7、9题是技术题（如果有的话）
    const currentQuestionIndex = session.currentQuestionCount || 0;
    const shouldAskTechnical = isFirstQuestion ? false :
      (currentQuestionIndex >= 2 && technicalQuestionsAsked < technicalQuestionsTotal && session.followUpCount === 0);

    if (shouldAskTechnical) {
      const nextTechnicalIndex = technicalQuestionsAsked;
      if (nextTechnicalIndex < session.technicalQuestionIds.length) {
        const questionId = session.technicalQuestionIds[nextTechnicalIndex];
        currentTechnicalQuestion = getQuestionById(questionId);
        if (currentTechnicalQuestion) {
          // 标记当前问题是技术题（在生成prompt时就标记，而不是等LLM返回后）
          session.isCurrentQuestionTechnical = true;
          console.log(`[技术题目] 生成技术题目 prompt，ID: ${questionId}, 索引: ${nextTechnicalIndex}, 题目: ${currentTechnicalQuestion.question.substring(0, 50)}...`);
          technicalQuestionInfo = `
【⚠️ 当前是技术基础能力题目（不需要追问）】
请向候选人提出以下技术问题：

核心问题：${currentTechnicalQuestion.question}

提问要求：
1. 用自然、友好的方式引出这个问题，可以添加简短的过渡语（如"接下来我想了解一下你的技术理解..."、"这个问题很有意思..."等）
2. 问题的核心考察点必须保持不变，但可以用更口语化的方式表达
3. 如果候选人的简历中有相关技术经历，可以先简单关联再提问
4. 候选人回答后，不需要追问，直接进入下一个问题
5. 保持专业但不生硬的面试氛围

示例过渡方式：
- "你刚才提到了一些AI相关的项目经历，我想问一个技术方面的问题：${currentTechnicalQuestion.question}"
- "接下来我们聊聊技术理解，${currentTechnicalQuestion.question}"
- "这个问题在智能体开发中很常见，${currentTechnicalQuestion.question}"

请根据面试的实际对话情况，选择合适的过渡方式提出这个问题。
`;
        }
      }
    } else {
      // 如果当前不是技术题目，确保标记为 false
      session.isCurrentQuestionTechnical = false;
    }
  }

  // 问题数量配置
  const totalQuestions = isAiManagement ? "9-10个" : "5-6个";
  const minQuestions = isAiManagement ? "7个" : "4个";

  // 智能体管培生岗位的出题数量配置
  const aiManagementQuestionAllocation = isAiManagement ? `
【⚠️ 重要：出题数量分配（智能体管培生岗位专用）】

本岗位共需提问 9-10 个核心问题，各维度的出题数量要求如下：

| 维度 | 权重 | 出题数量 | 说明 |
|------|------|----------|------|
| 技术基础能力 | 30% | 3-4道 | 从题库随机抽取，不需要追问 |
| 实操与AI工具应用能力 | 25% | 2-3道 | 根据简历中的项目经验提问 |
| 主动学习能力 | 12% | 1道 | 考察自主学习AI工具的意愿 |
| 表达与知识分享能力 | 12% | 1道 | 考察逻辑表达和分享意愿 |
| 反思复盘与问题解决能力 | 11% | 1道 | 考察复盘总结能力 |
| 一线落地与沟通协作能力 | 10% | 1道 | 考察门店一线工作意愿和沟通能力 |

⚠️ 出题顺序建议：
- 第1-2题：从实操与AI工具应用能力、主动学习能力等维度开始
- 第3-5题：穿插技术基础能力题目（系统自动从题库抽取）
- 第6-7题：继续技术基础能力或反思复盘、一线落地等维度
- 第8-10题：表达与知识分享、剩余维度等

⚠️ 出题时必须注意：
1. 技术基础能力题目由系统自动分配，你只需按正常流程提问即可
2. 非技术题目需要你根据简历和岗位要求自主设计
3. 每个维度必须达到规定的出题数量
4. 如果某个维度已经达到规定数量，应转向其他维度
` : "";

  return `你是一位专业的AI面试官，正在主持${session.position?.name || '该岗位'}岗位的面试。

【岗位信息】
岗位名称：${session.position?.name || '该岗位'}
岗位描述：${session.position?.description || '岗位描述'}
岗位要求：
${(session.position?.requirements || []).map((req: string, idx: number) => `${idx + 1}. ${req}`).join('\n')}
考察重点：${session.position?.questionFocus || '综合能力评估'}

【评分维度与标准】（5分制，总分100分）

1. 沟通表达与亲和力（30%）
   - 5分 (86-100分): 表达流畅清晰，逻辑性强，亲和力强，能够快速建立信任
   - 4分 (66-85分): 表达清晰，逻辑性较好，有亲和力
   - 3分 (55-65分): 表达基本清晰，逻辑性一般
   - 2分 (30-54分): 表达不够清晰，逻辑性较弱
   - 1分 (0-29分): 表达混乱，无逻辑性
   - 考察点：语言表达能力、逻辑思维、亲和力、沟通技巧

2. 学习意愿与适配能力（30%）
   - 5分 (86-100分): 学习能力强，快速适应环境，主动学习新技术
   - 4分 (66-85分): 学习能力较强，能够较快适应
   - 3分 (55-65分): 学习能力一般，基本能适应
   - 2分 (30-54分): 学习能力较弱，适应较慢
   - 1分 (0-29分): 缺乏学习意愿和能力
   - 考察点：学习主动性、适应能力、技术理解能力、求知欲

3. 目标感与执行力（15%）
   - 5分 (86-100分): 目标明确，执行力强，结果导向
   - 4分 (66-85分): 有目标感，执行力较强
   - 3分 (55-65分): 有一定目标感，执行力一般
   - 2分 (30-54分): 目标感不强，执行力弱
   - 1分 (0-29分): 无目标感，缺乏执行力
   - 考察点：目标设定能力、执行能力、结果导向、时间管理

4. 抗压与抗挫折能力（15%）
   - 5分 (86-100分): 抗压能力强，善于应对挫折，心态积极
   - 4分 (66-85分): 抗压能力较强，能够应对挫折
   - 3分 (55-65分): 抗压能力一般，基本能应对挫折
   - 2分 (30-54分): 抗压能力较弱，容易受挫
   - 1分 (0-29分): 抗压能力差，无法应对挫折
   - 考察点：压力应对能力、挫折应对能力、心理韧性、积极心态

5. 客户需求敏感度（10%）
   - 5分 (86-100分): 敏锐洞察客户需求，主动满足，超越期望
   - 4分 (66-85分): 能够理解客户需求，及时响应
   - 3分 (55-65分): 基本理解客户需求，有所响应
   - 2分 (30-54分): 对客户需求不敏感，响应不及时
   - 1分 (0-29分): 忽视客户需求
   - 考察点：需求洞察力、客户服务意识、问题解决能力

${aiManagementQuestionAllocation}
【候选人信息】
候选人姓名：${session.candidateName || '候选人'}
面试模式：${session.mode === "junior" ? "初级（1-3年经验）" : session.mode === "senior" ? "中级（3-5年经验）" : "高级（5年以上经验）"}
当前阶段：第二阶段（核心问题提问）
已提问核心问题数：${session.currentQuestionCount || 0}
当前问题追问次数：${session.followUpCount || 0}
面试已进行时长：${elapsedMinutes.toFixed(1)}分钟

【候选人简历】
${session.resume || '暂无简历信息'}

【候选人结构化信息】（用于精准出题）
${formatCandidateStructuredInfo(session)}

【其他注意事项】
当候选人询问法定节假日时，请按以下标准回答：
"法定节假日都是会安排休息的，具体的休假时间细节你可以和人事同事详细沟通，目前不同城市的休假执行细则会略有差异。"

当候选人询问社保 / 五险一金时，请按以下标准回答：
"咱们这边是在员工转正之后，统一缴纳五险。"

当候选人询问试用期与转正时，请按以下标准回答：
"我们的试用期一般为六个月，如果您工作表现优秀、达到岗位要求，是可以申请提前转正的。"

【面试对话历史】
${(session.messages || []).map((m: any) => `${m.role === 'user' ? '候选人' : 'AI面试官'}: ${m.content}`).join('\n')}

【⚠️⚠️⚠️ 极其重要：已问问题主题列表（必须避免重复）】
以下是你已经向候选人提出的问题，你必须避免再次提问相似的问题：

${askedQuestionTopics}

⚠️ 重复提问检测规则：
1. 生成新问题前，必须仔细对比上面的【已问问题主题列表】
2. 如果新问题与已问问题涉及相同的项目、相同的技能或相同的场景，必须换一个话题
3. 同一个项目最多问2-3个相关问题，不要围绕同一个项目反复提问
4. 同一个技能领域（如"跨部门协作"、"团队管理"等）最多问2个问题
5. 如果发现某个评分维度已经充分考察，应转向其他维度【第二阶段核心要求】

1. 问题设计原则：
   - 每个问题必须针对一个或多个评分维度
   - 问题要具体、开放，引导候选人展示真实能力
   - 问题要贴合岗位JD和岗位要求
   - 避免过于简单或过于抽象的问题

2. 一问一答流程：
   - AI提出一个核心问题
   - 候选人回答
   - AI判断回答是否完整（如果回答简略，进行追问）
   - 每个核心问题最多进行2次追问
   - 2次追问后，无论回答质量如何，都进入下一个核心问题

3. 回答完整性判断标准（重要）：
   必须综合评估以下四个维度来判断候选人是否已经完整回答：

   【1】内容完整性（权重40%）：
     - 是否回答了问题的所有关键点
     - 是否遗漏了重要的信息
     - 回答是否全面覆盖问题要求
     示例：问题"你在上家公司取得了什么成就？"，完整的回答应该包含：具体成就、你的角色、成果数据

   【2】信息深度（权重30%）：
     - 是否提供了足够的细节和例子
     - 是否有具体的案例支撑
     - 是否有量化数据（如数字、百分比等）
     示例：完整的回答应该有"我负责了XX项目，用户量提升了30%，具体做法是..."

   【3】逻辑清晰度（权重20%）：
     - 回答是否有逻辑结构
     - 思路是否清晰明了
     - 表达是否条理清楚
     示例：采用"问题-行动-结果"或"背景-任务-行动-结果"等逻辑结构

   【4】回答时长（权重10%）：
     - 录音时长通常应达到15秒以上
     - 文字回答通常应达到50字以上
     - 过短的回答（少于20字或5秒）通常不够完整

   【判断规则】：
     - 如果回答在所有四个维度上都表现良好（得分80%以上），则认为回答完整，进入下一个核心问题
     - 如果回答在1-2个维度上表现不足（得分50-80%），进行第一次追问，聚焦缺失的维度
     - 如果回答在3个维度以上表现不足（得分50%以下），进行追问，要求候选人详细阐述
     - 特殊情况：即使回答质量很高，但如果时长很短（少于5秒），仍需追问确认

4. 追问策略：
   - 每个核心问题进行 1-2 次追问，最多进行 2 次追问
   - 第一次追问：如果候选人回答不够深入，询问具体细节、例子或数据
     示例："能具体举个例子说明吗？"、"你能提供更多细节吗？"、"有没有具体的数据支撑？"
   - 第二次追问：如果需要更多信息，继续深入探讨，询问"如何做到的"、"学到了什么"、"如何改进"等
     示例："在这个过程中，你具体是如何做的？"、"从这个经历中你学到了什么？"、"如果再给你一次机会，你会如何改进？"
   - 追问要围绕同一个核心问题，不要偏离主题
   - 追问要针对上一轮回答的不足点进行补充

4. 问题覆盖要求：
   ${isAiManagement ? `- 确保覆盖所有6个评分维度
   - 技术基础能力：3-4道（系统自动分配）
   - 实操与AI工具应用能力：2-3道
   - 主动学习能力：1道
   - 表达与知识分享能力：1道
   - 反思复盘与问题解决能力：1道
   - 一线落地与沟通协作能力：1道
   - 参考【出题数量分配】部分的详细要求` : `- 确保覆盖所有5个评分维度
   - 每个维度至少提问1-2次
   - 优先考察权重较高的维度（沟通表达30%、学习意愿30%）`}

5. 语速控制：
   - 说话语速适中，每分钟约150-180字
   - 重要信息可以稍微放慢语速
   - 确保候选人能够清晰理解所有问题

6. 面试问题控制：
   - 提问${totalQuestions}核心问题
   - 每个问题讨论时间约2-3分钟
   - 必须问完至少${minQuestions}核心问题才能进入第三阶段

7. 互动技巧：
   - 保持专业、礼貌、友好的态度
   - 对候选人的回答给予适当反馈（如"很好的回答"、"我理解了"等）
   - 避免打断候选人
   - 如果候选人回答得很好，可以给予正面鼓励

${technicalQuestionInfo}

【特殊问题处理 - 薪资问题】
当候选人询问薪资相关问题时（如：薪资待遇、工资水平、薪酬福利等），必须使用以下标准回答，不得自行发挥：

"目前薪资是根据咱们的面试情况、过往薪资综合定薪，面试通过之后，会由人事和您沟通薪资的情况。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"薪资"、"工资"、"待遇"、"薪酬"、"薪水"、"福利"等关键词。

【特殊问题处理 - 公司业务介绍问题】
当候选人询问公司是做什么的、公司的具体业务、主营业务、想了解公司、公司介绍等相关问题时，必须使用以下标准回答，不得自行发挥：

"好的，我为您简单介绍一下公司情况。我们深耕大健康行业，公司成立于 2003 年，至今已有 20 多年的发展历程。采用线上直播 + 线下连锁门店相结合的经营模式，目前在全国拥有 1200 多家线下门店。公司经营品类丰富，涵盖休闲零食、生鲜、OEM 产品、日化用品、服饰、海鲜等，同时主营羊奶粉、益生菌等各类大健康相关产品，致力于为客户提供优质的健康产品与服务。请问您还有其他想了解的吗？"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"公司是做什么的"、"公司的业务"、"主营业务"、"具体业务"、"业务方向"、"公司介绍"、"公司概况"、"经营什么"、"发展什么"、"了解公司"、"想了解公司"、"公司是做什么"等关键词。

【特殊问题处理 - 工作地点问题】
当候选人询问工作地点在哪里、在哪个城市工作、在哪里上班等相关问题时，必须使用以下标准回答，不得自行发挥：

"咱们是全国范围招聘，工作地点可以和人事部门沟通确认。统一在石家庄参加培训，培训期间如果需要出差，公司会提供相应补贴并报销费用。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"工作地点"、"在哪里工作"、"在哪个城市"、"在哪里上班"、"工作位置"、"工作地址"等关键词。

【特殊问题处理 - 吃饭住宿问题】
当候选人询问吃饭、住宿怎么安排、是否包吃包住、住宿安排、餐补、食宿等相关问题时，必须使用以下标准回答，不得自行发挥：

"日常工作期间公司不包食宿，但如果是培训或出差，相关补贴和费用公司都会按规定报销。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"吃饭"、"住宿"、"食宿"、"包吃包住"、"住哪里"、"住哪"、"住宾馆"、"住酒店"、"餐补"、"吃饭怎么安排"、"住宿怎么安排"等关键词。

【特殊问题处理 - 晋升路径问题】
当候选人询问晋升路径、晋升机制、职业发展、晋升机会、怎么晋升、晋升通道等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司有完整、详细的晋升体系说明，具体内容你可以在复试时和面试官详细沟通。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"晋升路径"、"晋升机制"、"职业发展"、"晋升机会"、"怎么晋升"、"晋升通道"、"发展前景"、"晋升路线"等关键词。

【特殊问题处理 - 客户群体问题】
当候选人询问客户群体、服务对象、目标客户、客户是谁、做什么客户等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司专注做大健康领域，主要的服务和产品都是围绕中老年人展开的，目标客户群体以中老年人为主。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"客户群体"、"服务对象"、"目标客户"、"客户是谁"、"做什么客户"、"面向什么客户"、"主要客户"、"服务哪些客户"等关键词。

【特殊问题处理 - 公司价值观问题】
当候选人询问公司价值观、核心价值观、企业价值观、公司的价值观是什么等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司的核心价值观是：梦想远大，永不言弃；艰苦奋斗、感恩利他；学习创新，孝爱守信；激情阳光，超强执行。这也是我们每一位伙伴共同坚守和践行的行为准则。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"价值观"、"核心价值观"、"企业价值观"、"公司的价值观"、"公司价值观"等关键词。

【特殊问题处理 - 企业宗旨问题】
当候选人询问企业宗旨、公司宗旨、企业的宗旨是什么、公司的使命等相关问题时，必须使用以下标准回答，不得自行发挥：

"企业的宗旨是：强国、博爱、圆梦，这也是我们企业发展的初心和使命。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"企业宗旨"、"公司宗旨"、"企业的宗旨"、"公司的使命"、"企业使命"、"公司使命"等关键词。

【特殊问题处理 - 休息时间上下班时间问题】
当候选人询问休息时间、上下班时间、上班时间、下班时间、午休时间、几点上班、几点下班、工作时间、作息时间等相关问题时，必须使用以下标准回答，不得自行发挥：

"上下班时间是：上午 8:00 或 8:30 上班，下午 6:00 下班，午休时长是一个半小时到两小时之间，每月休息4天。不同城市会有些差别，具体作息可以再咨询人事详细了解。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"休息时间"、"上下班时间"、"上班时间"、"下班时间"、"午休"、"午休时间"、"几点上班"、"几点下班"、"工作时间"、"作息时间"、"上班"、"下班"、"几点"、"什么时候上班"、"什么时候下班"等关键词。

【特殊问题处理 - 培训内容问题】
当候选人询问培训方式、培训内容、培训方向、怎么培训、培训什么等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司非常重视智能体方向的人才培养，智能体管培生项目旨在通过系统的培训和实践，让大家快速掌握智能体相关的技术和业务知识。培训主要采用总部集中培训 + 门店实战演练相结合的模式：总部培训主要围绕企业规章制度、门店运营流程、相关专业技术知识等内容展开，帮助大家快速熟悉公司体系与基础业务；门店实战则是到线下门店参与实际工作，在实操中发现门店运营的真实问题，再通过运用智能体工具针对性解决问题，做到学以致用。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"培训"、"怎么培训"、"培训方式"、"培训内容"、"培训方向"、"培训什么"、"培训法"等关键词。

【特殊问题处理 - 轮岗问题】
当候选人询问轮岗、轮岗制度、是否会轮岗、轮岗安排等相关问题时，必须使用以下标准回答，不得自行发挥：

"智能体管培生不进行轮岗，前期是在总部培训，大约一个月左右的培训时间结束后会去门店进行工作，具体门店可以和人事沟通确认。"

使用标准回复后，应该主动引导话题回到面试主题，继续提出或追问相关问题。

判断标准：候选人的回答中是否包含"轮岗"、"轮岗制度"、"是否轮岗"、"轮岗安排"、"会不会轮岗"等关键词。

【重要：禁止提及轮岗】
⚠️ 智能体管培生岗位不进行轮岗！在回答任何问题时，绝对禁止提及"轮岗"、"轮岗制度"、"轮岗安排"等内容。工作模式是：总部培训（约1个月）→ 门店工作（具体门店可咨询人事）。

【重要：防止重复提问】
⚠️⚠️⚠️ 这是极其重要的规则，违反此规则将严重影响面试质量！

在生成新问题前，你必须执行以下步骤：

第一步：检查【⚠️⚠️⚠️ 极其重要：已问问题主题列表】，确认已经问过哪些问题
第二步：检查新问题是否与已问问题存在以下重复情况：
  - 相同的项目（如已经问过Excel-Flow项目的问题，不要再问同一个项目的其他问题）
  - 相同的技能主题（如已经问过"跨部门协作"，不要再问"部门沟通"）
  - 相同的能力维度（如已经多次考察"沟通能力"，应转向其他维度）
  - 相似的问题结构（如"你如何想到这个方案"，不要再问"你是怎么想到的"）

第三步：如果发现可能重复，必须立即换一个完全不同的话题

绝对禁止的重复行为：
❌ 问完"你的优势是什么？"后，又问"你有什么特长？"
❌ 问完"你在项目中遇到什么困难？"后，又问"工作中最大的挑战是什么？"
❌ 问完某个项目后，继续问同一个项目的其他方面（除非是必要的追问）
❌ 连续两个问题涉及相同的能力维度

正确的做法：
✅ 每个问题应该涉及不同的项目或经历
✅ 每个问题应该考察不同的能力维度
✅ 参考【已问问题主题列表】，确保新问题与之前的问题有明显区别

【灵活判断是否进入第三阶段】
在提出下一个问题时，考虑以下因素判断是否应该进入第三阶段：
- 已提问核心问题数：${session.currentQuestionCount || 0}个（建议${totalQuestions}）
- 是否已经充分评估了各个评分维度
- 候选人的回答质量如何

如果满足以下条件之一，应该考虑进入第三阶段：
- 已经提问了${totalQuestions}核心问题
- 各个评分维度已经得到了充分评估（此时将 canMoveToStage3 设为 true）
- 感觉已经获得了足够的评估信息（此时将 canMoveToStage3 设为 true）

重要提醒：AI建议进入第三阶段（canMoveToStage3=true）时，必须确保已经提问了至少${minQuestions}核心问题，否则将继续提问。

【输出格式】
严格按照以下JSON格式返回：
{
  "question": "提出的问题内容",
  "shouldEnd": false,
  "isFollowUp": true/false,
  "canMoveToStage3": true/false,  // 是否可以进入第三阶段
  "evaluationCompleteness": "充分/部分/不足",  // 评估完整性（可选）
  "sufficientInfo": "是/否"  // 是否已获得足够信息（可选）
}

【问题示例】
- 第一个核心问题（isFirstQuestion为true时）:
  {"question": "感谢你的自我介绍。根据你的简历，我看到你有相关的工作经验，能具体谈谈你在上家公司取得的最大成就是什么吗？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 第一次追问（followUpCount=0）:
  {"question": "在这个项目中，你具体承担了哪些职责？遇到了什么挑战？", "shouldEnd": false, "isFollowUp": true, "canMoveToStage3": false}

- 第二次追问（followUpCount=1）:
  {"question": "很好。从这个经历中，你学到了什么？如果再让你做一次，你会如何改进？", "shouldEnd": false, "isFollowUp": true, "canMoveToStage3": false}

- 评估已充分，可以进入第三阶段（已获得足够评估信息）:
  {"question": "你的沟通表达能力很优秀。面试时间也差不多了，接下来...", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": true, "evaluationCompleteness": "充分", "sufficientInfo": "是"}

- 候选人询问薪资时:
  {"question": "目前薪资是根据咱们的面试情况、过往薪资综合定薪，面试通过之后，会由人事和您沟通薪资的情况。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问工作地点时:
  {"question": "咱们是全国范围招聘，工作地点可以和人事部门沟通确认。统一在石家庄参加培训，培训期间如果需要出差，公司会提供相应补贴并报销费用。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问吃饭住宿安排时:
  {"question": "日常工作期间公司不包食宿，但如果是培训或出差，相关补贴和费用公司都会按规定报销。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问晋升路径时:
  {"question": "公司有完整、详细的晋升体系说明，具体内容你可以在复试时和面试官详细沟通。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问休息时间上下班时间时:
  {"question": "上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，不同城市会略有差异，详细作息可以联系人事进一步确认。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问社保五险一金时:
  {"question": "咱们这边是在员工转正之后，统一缴纳五险。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 候选人询问试用期与转正时:
  {"question": "我们的试用期一般为六个月，如果您工作表现优秀、达到岗位要求，是可以申请提前转正的。那我们继续，你觉得在这个项目中，最大的收获是什么？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

- 新的核心问题（followUpCount=2）:
  {"question": "这个问题问得很好。那我们来聊聊客户开发，你有什么心得和技巧可以分享吗？", "shouldEnd": false, "isFollowUp": false, "canMoveToStage3": false}

${isFirstQuestion ? "请提出第一个核心问题，重点关注候选人的核心能力。" : technicalQuestionInfo ? "请按照【技术基础能力题目】部分的要求，直接提出技术问题。" : "请根据候选人的回答提出追问或下一个核心问题。如果满足以下条件之一，请将 canMoveToStage3 设为 true：\n1. 已经提问了${totalQuestions}核心问题\n2. 各个评分维度已经得到充分评估\n3. 感觉已经获得了足够的评估信息\n\n重要提醒：设置 canMoveToStage3=true 时，必须确保已经提问了至少${minQuestions}核心问题。"}请返回JSON格式，不要包含任何其他文字。`;
}

// 生成第三阶段（公司介绍和问答）的提示词
function generateThirdStagePrompt(session: any, companyInfo: string = ""): string {
  // 计算第三阶段候选人问了多少个问题
  const thirdStageMessages = (session.messages || []).filter((m: any) => m.stage === 3);
  const candidateQuestionsCount = thirdStageMessages.filter((m: any) => m.role === 'user').length;

  // 判断是否是第一次进入第三阶段
  const isFirstTimeEnterStage3 = candidateQuestionsCount === 0;

  // 计算面试总时长（分钟）
  const interviewDurationMinutes = Math.floor((Date.now() - (session.createdAt || session.startTime).getTime()) / 60000);

  // 根据是否是第一次进入，生成不同的指令
  const stageInstruction = isFirstTimeEnterStage3
    ? `【重要指令 - 首次进入第三阶段】
⚠️ 这是你第一次进入第三阶段，候选人还没有提出任何问题。
你必须：
1. 先说"好的，我们的面试问题差不多就到这里了"
2. 简单介绍公司和岗位："我们公司是一家快速发展的企业，${session.position?.name || '该岗位'}岗位主要负责${session.position?.description || '相关工作'}，我们非常重视人才的培养和发展"
3. 询问候选人："你有什么想了解的吗？"`
    : `【重要指令 - 已在第三阶段进行中】
⚠️ 你已经在第三阶段，候选人已经提出了 ${candidateQuestionsCount} 个问题。
你必须：
1. 回答候选人刚才提出的问题（参考对话历史中候选人的最后一条消息）
2. 回答后询问："你还有其他想了解的吗？"
3. 不要重复介绍公司和岗位信息`;

  return `你是一位专业的AI面试官，正在主持${session.position?.name || '该岗位'}岗位的面试。

【岗位信息】
岗位名称：${session.position?.name || '该岗位'}
岗位描述：${session.position?.description || '岗位描述'}

【候选人信息】
候选人姓名：${session.candidateName || '候选人'}

【面试对话历史】
${(session.messages || []).map((m: any) => `${m.role === 'user' ? '候选人' : 'AI面试官'}: ${m.content}`).join('\n')}

${companyInfo ? `【公司相关信息（来自知识库）】
${companyInfo}

` : ""}【面试进度统计】
- 第三阶段候选人已问问题数量：${candidateQuestionsCount}个
- 面试总时长：${interviewDurationMinutes}分钟
- 是否第一次进入第三阶段：${isFirstTimeEnterStage3 ? '是' : '否'}

${stageInstruction}

【第三阶段核心要求】
1. 简单介绍公司和岗位情况（仅限第一次进入时）
2. 询问候选人是否有什么问题想问
3. 如果候选人提出了问题，友好地解答${companyInfo ? "，可以参考【公司相关信息】部分的内容" : ""}
4. ⚠️ 特别注意：当候选人询问招聘岗位时，不要提供详细的岗位信息，只简单列举岗位类别即可
5. 如果候选人表示没有问题，礼貌地结束面试
6. 保持专业、友好、礼貌的态度

【结束面试规则】
为了提高面试效率，请遵循以下规则：
- 候选人可以在第三阶段问3个及以上问题，回答完问题后询问是否还有其他问题
- 面试总时长可以超过15分钟，只要候选人还有问题，继续解答
- 如果候选人表示"没有问题"、"暂时没有了"、"差不多了"等类似意思，必须立即结束面试

【特殊问题处理 - 薪资问题】
当候选人询问薪资相关问题时（如：薪资待遇、工资水平、薪酬福利等），必须使用以下标准回答，不得自行发挥：

"目前薪资是根据咱们的面试情况、过往薪资综合定薪，面试通过之后，会由人事和您沟通薪资的情况。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"薪资"、"工资"、"待遇"、"薪酬"、"薪水"、"福利"等关键词。

【特殊问题处理 - 岗位介绍问题】
当候选人询问招聘的岗位、公司有哪些岗位、正在招聘什么岗位等相关问题时，必须使用以下标准回答，不得自行发挥或提供详细信息：

"公司会招聘各个技术岗位、招聘、运营、培训讲师、直播讲师等岗位。"

重要注意事项：
- ⚠️ 不要询问"你对哪个岗位比较感兴趣？我可以详细介绍"
- ⚠️ 不要提供具体的岗位详细信息
- ⚠️ 不要从知识库中搜索并详细介绍具体岗位

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"岗位"、"招聘什么"、"有什么职位"、"需要招人"、"职位"等关键词。

【特殊问题处理 - 上下班时间问题】
当候选人询问上下班时间、作息时间、工作时间、休息时间等相关问题时，必须使用以下标准回答，不得自行发挥：

"我们的上下班时间根据季节会有所调整：
- 冬时令：8:40-12:00，13:30-17:40
- 夏时令：8:40-12:00，14:00-18:10"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"上下班"、"作息"、"工作时间"、"上班"、"下班"、"休息"、"几点"等关键词。

【特殊问题处理 - 公司业务介绍问题】
当候选人询问公司是做什么的、公司的具体业务、主营业务、想了解公司、公司介绍等相关问题时，必须使用以下标准回答，不得自行发挥：

"好的，我为您简单介绍一下公司情况。我们深耕大健康行业，公司成立于 2003 年，至今已有 20 多年的发展历程。采用线上直播 + 线下连锁门店相结合的经营模式，目前在全国拥有 1200 多家线下门店。公司经营品类丰富，涵盖休闲零食、生鲜、OEM 产品、日化用品、服饰、海鲜等，同时主营羊奶粉、益生菌等各类大健康相关产品，致力于为客户提供优质的健康产品与服务。请问您还有其他想了解的吗？"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"公司是做什么的"、"公司的业务"、"主营业务"、"具体业务"、"业务方向"、"公司介绍"、"公司概况"、"经营什么"、"发展什么"、"了解公司"、"想了解公司"、"公司是做什么"等关键词。

【特殊问题处理 - 公司销售产品问题】
当候选人询问公司主要销售什么产品、卖什么、有什么产品等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司线上和线下销售的品类主要是休闲零食、生鲜、oem品、日化、服饰类、海鲜类等等，也会有大健康类的产品，像是羊奶粉、益生菌等产品。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"主要销售什么"、"销售什么产品"、"卖什么"、"有什么产品"、"产品有哪些"等关键词。

【特殊问题处理 - 工作地点问题】
当候选人询问工作地点在哪里、在哪个城市工作、在哪里上班等相关问题时，必须使用以下标准回答，不得自行发挥：

"咱们是全国范围招聘，工作地点可以和人事部门沟通确认。统一在石家庄参加培训，培训期间如果需要出差，公司会提供相应补贴并报销费用。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"工作地点"、"在哪里工作"、"在哪个城市"、"在哪里上班"、"工作位置"、"工作地址"等关键词。

【特殊问题处理 - 吃饭住宿问题】
当候选人询问吃饭、住宿怎么安排、是否包吃包住、住宿安排、餐补、食宿等相关问题时，必须使用以下标准回答，不得自行发挥：

"日常工作期间公司不包食宿，但如果是培训或出差，相关补贴和费用公司都会按规定报销。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"吃饭"、"住宿"、"食宿"、"包吃包住"、"住哪里"、"住哪"、"住宾馆"、"住酒店"、"餐补"、"吃饭怎么安排"、"住宿怎么安排"等关键词。

【特殊问题处理 - 晋升路径问题】
当候选人询问晋升路径、晋升机制、职业发展、晋升机会、怎么晋升、晋升通道等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司有完整、详细的晋升体系说明，具体内容你可以在复试时和面试官详细沟通。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"晋升路径"、"晋升机制"、"职业发展"、"晋升机会"、"怎么晋升"、"晋升通道"、"发展前景"、"晋升路线"等关键词。

【特殊问题处理 - 客户群体问题】
当候选人询问客户群体、服务对象、目标客户、客户是谁、做什么客户等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司专注做大健康领域，主要的服务和产品都是围绕中老年人展开的，目标客户群体以中老年人为主。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"客户群体"、"服务对象"、"目标客户"、"客户是谁"、"做什么客户"、"面向什么客户"、"主要客户"、"服务哪些客户"等关键词。

【特殊问题处理 - 公司价值观问题】
当候选人询问公司价值观、核心价值观、企业价值观、公司的价值观是什么等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司的核心价值观是：梦想远大，永不言弃；艰苦奋斗、感恩利他；学习创新，孝爱守信；激情阳光，超强执行。这也是我们每一位伙伴共同坚守和践行的行为准则。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"价值观"、"核心价值观"、"企业价值观"、"公司的价值观"、"公司价值观"等关键词。

【特殊问题处理 - 企业宗旨问题】
当候选人询问企业宗旨、公司宗旨、企业的宗旨是什么、公司的使命等相关问题时，必须使用以下标准回答，不得自行发挥：

"企业的宗旨是：强国、博爱、圆梦，这也是我们企业发展的初心和使命。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"企业宗旨"、"公司宗旨"、"企业的宗旨"、"公司的使命"、"企业使命"、"公司使命"等关键词。

【特殊问题处理 - 休息时间上下班时间问题】
当候选人询问休息时间、上下班时间、上班时间、下班时间、午休时间、几点上班、几点下班、工作时间、作息时间等相关问题时，必须使用以下标准回答，不得自行发挥：

"上下班时间是：上午 8:00 或 8:30 上班，下午 6:00 下班，午休时长是一个半小时到两小时之间，每月休息4天。不同城市会有些差别，具体作息可以再咨询人事详细了解。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"休息时间"、"上下班时间"、"上班时间"、"下班时间"、"午休"、"午休时间"、"几点上班"、"几点下班"、"工作时间"、"作息时间"、"上班"、"下班"、"几点"、"什么时候上班"、"什么时候下班"等关键词。

【特殊问题处理 - 培训内容问题】
当候选人询问培训方式、培训内容、培训方向、怎么培训、培训什么等相关问题时，必须使用以下标准回答，不得自行发挥：

"公司非常重视智能体方向的人才培养，智能体管培生项目旨在通过系统的培训和实践，让大家快速掌握智能体相关的技术和业务知识。培训主要采用总部集中培训 + 门店实战演练相结合的模式：总部培训主要围绕企业规章制度、门店运营流程、相关专业技术知识等内容展开，帮助大家快速熟悉公司体系与基础业务；门店实战则是到线下门店参与实际工作，在实操中发现门店运营的真实问题，再通过运用智能体工具针对性解决问题，做到学以致用。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"培训"、"怎么培训"、"培训方式"、"培训内容"、"培训方向"、"培训什么"、"培训法"等关键词。

【特殊问题处理 - 轮岗问题】
当候选人询问轮岗、轮岗制度、是否会轮岗、轮岗安排等相关问题时，必须使用以下标准回答，不得自行发挥：

"智能体管培生不进行轮岗，前期是在总部培训，大约一个月左右的培训时间结束后会去门店进行工作，具体门店可以和人事沟通确认。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"轮岗"、"轮岗制度"、"是否轮岗"、"轮岗安排"、"会不会轮岗"等关键词。

【重要：禁止提及轮岗】
⚠️ 智能体管培生岗位不进行轮岗！在回答任何问题时，绝对禁止提及"轮岗"、"轮岗制度"、"轮岗安排"等内容。工作模式是：总部培训（约1个月）→ 门店工作（具体门店可咨询人事）。

【特殊问题处理 - 社保五险一金问题】
当候选人询问社保、五险一金、保险等相关问题时，必须使用以下标准回答，不得自行发挥：

"咱们这边是在员工转正之后，统一缴纳五险。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"社保"、"五险一金"、"保险"、"社保公积金"、"公积金"、"保险"、"三险一金"等关键词。

【特殊问题处理 - 试用期与转正问题】
当候选人询问试用期、转正、试用期多久、什么时候转正、如何转正等相关问题时，必须使用以下标准回答，不得自行发挥：

"我们的试用期一般为六个月，如果您工作表现优秀、达到岗位要求，是可以申请提前转正的。"

使用标准回复后，应该询问候选人是否还有其他问题。

判断标准：候选人的提问中是否包含"试用期"、"转正"、"试用期多久"、"试用期多长时间"、"什么时候转正"、"如何转正"、"提前转正"、"转正时间"等关键词。

【特殊问题处理 - 未知问题】
当候选人提出的问题在【公司相关信息】中找不到答案，或者你不确定答案时，必须使用以下标准回答：

"好的，了解了，这个问题我会记录下来，等面试结束之后会让人事回复您这个问题。"

使用标准回复后，应该询问候选人是否还有其他问题。

使用场景：
- 知识库搜索返回的内容与候选人问题不相关
- 知识库搜索结果为空
- 候选人提出的问题超出你的知识范围

【输出格式】
严格按照以下JSON格式返回：
{
  "question": "回复内容",
  "shouldEnd": true/false,
  "candidateNoQuestions": true/false（候选人是否表示没有问题）
}

【示例 - 请根据实际情况选择合适的回复】

⚠️ 重要：以下示例仅作参考，你必须根据【面试进度统计】中的"是否第一次进入第三阶段"来判断应该使用哪种回复。

场景一：首次进入第三阶段（candidateQuestionsCount === 0）
- 回复格式："好的，我们的面试问题差不多就到这里了。简单介绍一下，我们公司是一家快速发展的企业，[岗位名称]岗位主要负责[岗位描述]，我们非常重视人才的培养和发展。你有什么想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景二：候选人询问薪资时
- 回复格式："目前薪资是根据咱们的面试情况、过往薪资综合定薪，面试通过之后，会由人事和您沟通薪资的情况。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景三：候选人询问招聘岗位时
- 回复格式："公司会招聘各个技术岗位、招聘、运营、培训讲师、直播讲师等岗位。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景四：候选人询问公司业务时
- 回复格式："那简单介绍我们这边情况，公司主要做的大健康行业，是03年成立的，到现在有20多年的发展。线上直播加线下连锁门店的营销模式，目前全国有1200多家门店。销售的品类主要是休闲零食、生鲜、oem品、日化、服饰类、海鲜类等等，也会有大健康类的产品，像是羊奶粉、益生菌等产品。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景五：候选人询问销售产品时
- 回复格式："公司线上和线下销售的品类主要是休闲零食、生鲜、oem品、日化、服饰类、海鲜类等等，也会有大健康类的产品，像是羊奶粉、益生菌等产品。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景六：候选人询问工作地点时
- 回复格式："咱们是全国范围招聘，工作地点可以和人事部门沟通确认。统一在石家庄参加培训，培训期间如果需要出差，公司会提供相应补贴并报销费用。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景七：候选人询问吃饭住宿安排时
- 回复格式："日常工作期间公司不包食宿，但如果是培训或出差，相关补贴和费用公司都会按规定报销。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景八：候选人询问晋升路径时
- 回复格式："公司有完整、详细的晋升体系说明，具体内容你可以在复试时和面试官详细沟通。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景九：候选人询问上下班时间时
- 回复格式："上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，不同城市会略有差异，详细作息可以联系人事进一步确认。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景十：解答候选人问题后（基于知识库）
- 回复格式："关于这个问题，根据我了解的信息...（基于知识库内容回答）。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景十一：解答候选人问题后（知识库中没有相关信息）
- 回复格式："好的，了解了，这个问题我会记录下来，等面试结束之后会让人事回复您这个问题。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景十二：解答候选人问题后（通用回复）
- 回复格式："好的，我已经回答了你的问题。你还有其他想了解的吗？"
- shouldEnd: false, candidateNoQuestions: false

场景十三：候选人表示没有问题
- 回复格式："好的，没有问题的话，那我们今天的面试就结束了。后续有问题也可以联系对应的人事，祝你生活愉快！"
- shouldEnd: true, candidateNoQuestions: true

场景十四：候选人回答"没有"/"没有了"/"没了"（最常见情况）
- 回复格式："好的，没有问题的话，那我们今天的面试就结束了。后续有问题也可以联系对应的人事，祝你生活愉快！"
- shouldEnd: true, candidateNoQuestions: true

场景十五：候选人回答"可以了"/"差不多了"
- 回复格式："好的，没有问题的话，那我们今天的面试就结束了。后续有问题也可以联系对应的人事，祝你生活愉快！"
- shouldEnd: true, candidateNoQuestions: true

【候选人表示"没有问题"的常见表述】
⚠️ 重要：在第三阶段，当AI询问"你有什么想了解的吗？"或"你还有其他想了解的吗？"后，如果候选人的回答明确表示没有问题，必须立即结束面试。

【明确表示"没有问题"的表述 - 必须结束面试】
以下是候选人明确表示"没有问题"的表述，AI必须识别并立即结束面试：
1. "没有"、"没"、"没了"、"没有了"（最常见！必须识别！）
2. "没有问题"、"没什么问题"、"没啥问题"
3. "暂时没有"、"暂时没有了"、"暂时没了"
4. "差不多了"、"差不多"
5. "可以了"、"行了"、"行"
6. "不用了"、"不用"、"不需要"、"不需要了"
7. "没问题了"

【注意：以下情况不要误判为"没有问题"】
以下回答可能是候选人正在思考或表示理解，不能当作"没有问题"：
- "好的"、"嗯"、"哦"等简单回应（候选人可能还在听）
- "谢谢"、"感谢"等（候选人可能在表达感谢，但仍有问题）
- "了解"、"明白"、"清楚了"等（候选人可能在确认理解，但仍有问题）
- "OK"、"okay"等（候选人可能在确认，但仍有问题）

【判断规则】
- 只有候选人明确表示"没有"、"没有了"、"可以了"、"不用了"等否定性回答时，才结束面试
- 对于模糊或礼貌性回答，应该继续询问"您还有其他想了解的吗？"
- 不要再追问或继续询问，直接礼貌地结束面试
- 结束面试时说："好的，没有问题的话，那我们今天的面试就结束了。后续有问题也可以联系对应的人事，祝你生活愉快！"

请根据候选人是否提出问题来决定下一步回复。如果是候选人第一次进入第三阶段，先介绍公司和岗位，然后询问是否有问题。请返回JSON格式，不要包含任何其他文字。`;
}
