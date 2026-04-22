import { NextRequest, NextResponse } from "next/server";
import { invokeWithRetry, logConcurrentStats } from "@/lib/llm-client";
import { initInterviewSessionsTable, saveInterviewSession, initInterviewStatisticsTable, saveInterviewStatistics } from "@/lib/db/session-utils";
import { getDb } from "@/lib/db";
import { fullAiInterviewConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { positions as sharedPositions } from "@/storage/database/shared/schema";
import { getModelId } from "@/lib/db/model-config-utils";
import { buildCandidateInterviewLink, getInterviewPublicBaseUrlFromRequest } from "@/lib/interview-public-url";
import { ensureFullAiInterviewConfigsTable } from "@/lib/db/ensure-full-ai-interview-configs-table";
import { ensurePositionsTable } from "@/lib/db/ensure-positions-table";
import { getAiScoreRule } from "@/lib/ai-score-rules";
import { createRuleDrivenRuntimeState } from "@/lib/full-ai-interview/rule-driven-interview";
import { randomUUID } from "crypto";

interface InterviewConfigRecord {
  resume?: string;
  resumeParsedData?: unknown;
  interviewerVoice?: string;
  tenantId?: string | null;
  userId?: string | null;
}

interface PositionRequirement {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  questionFocus: string;
  workHours: string;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object" && "name" in item && typeof item.name === "string") {
        return item.name.trim();
      }

      return "";
    })
    .filter(Boolean);
}

function isAiManagementPosition(value?: string | null): boolean {
  const normalizedValue = value?.trim().toLowerCase() || "";
  return normalizedValue.includes("ai_management") || normalizedValue.includes("智能体管培生");
}

function buildDynamicPositionRequirement(
  positionId: string,
  positionRecord?: typeof sharedPositions.$inferSelect
): PositionRequirement {
  const positionTitle = positionRecord?.title || positionId;
  const normalizedId = isAiManagementPosition(positionTitle) || isAiManagementPosition(positionId)
    ? "ai_management"
    : positionId;
  const coreRequirements = readStringArray(positionRecord?.coreRequirements);
  const softSkills = readStringArray(positionRecord?.softSkills);
  const requirements = [
    ...coreRequirements,
    ...softSkills,
    positionRecord?.education ? `学历要求：${positionRecord.education}` : "",
    positionRecord?.experience ? `经验要求：${positionRecord.experience}` : "",
  ].filter(Boolean);

  const interviewerPreferences =
    positionRecord?.interviewerPreferences &&
    typeof positionRecord.interviewerPreferences === "object"
      ? positionRecord.interviewerPreferences as { focusAreas?: string[] }
      : null;
  const focusAreas = Array.isArray(interviewerPreferences?.focusAreas)
    ? interviewerPreferences.focusAreas.filter(Boolean)
    : [];

  let workHours = "具体工作时间请以 HR 或招聘负责人后续通知为准";
  if (positionTitle.includes("人事")) {
    workHours = "冬时令：上午 8:40-12:00，下午 13:30-17:40；夏时令：上午 8:40-12:00，下午 14:00-18:10，单休";
  } else if (isAiManagementPosition(positionTitle)) {
    workHours = "上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，月休四天，不同城市会略有差异，详细作息可以联系人事进一步确认";
  }

  return {
    id: normalizedId,
    name: positionTitle,
    description: positionRecord?.jobDescription || `${positionTitle}相关岗位`,
    requirements: requirements.length > 0
      ? requirements
      : [
          "岗位基础能力",
          "沟通表达能力",
          "学习与适应能力",
          "问题分析与解决能力",
          "岗位经验与实操能力",
        ],
    questionFocus:
      focusAreas.length > 0
        ? `重点围绕 ${focusAreas.join("、")} 进行追问，并结合岗位职责评估候选人匹配度`
        : "围绕岗位职责、过往经验、业务理解、学习能力与岗位匹配度展开追问",
    workHours,
  };
}

function buildFallbackOpeningQuestion(candidateName: string, positionName: string): string {
  return `${candidateName}，你好，欢迎参加${positionName}岗位的 AI 面试。我会先和你完成一轮简短沟通，再进入核心问题环节。首先请你用 2 到 3 分钟做一个自我介绍，重点介绍一下你最近的学习或工作经历、为什么选择这个岗位，以及你认为自己最匹配这个岗位的优势。`;
}

export async function POST(request: NextRequest) {
  try {
    // 初始化数据库表
    await Promise.all([
      initInterviewSessionsTable(),
      initInterviewStatisticsTable(),
    ]);

    const {
      candidateName,
      mode,
      position,
      interviewId: requestedLinkId,
      resume: providedResume,
      resumeParsedData: providedResumeParsedData,
    } = await request.json();

    if (!candidateName || !mode || !position) {
      return NextResponse.json(
        { error: "请提供候选人姓名、面试模式和岗位" },
        { status: 400 }
      );
    }

    // 生成面试ID
    const interviewId = randomUUID();
    const linkId = requestedLinkId || interviewId;

    // 从配置中获取简历（先从内存读取，如果不存在则从数据库读取）
    let interviewConfig: InterviewConfigRecord | null = null;
    const configStore = (globalThis as typeof globalThis & {
      interviewConfigs?: Map<string, InterviewConfigRecord>;
    }).interviewConfigs;

    // 1. 先尝试从内存读取
    if (requestedLinkId && configStore) {
      interviewConfig = configStore.get(linkId) ?? null;
    }

    // 2. 如果内存中没有，从数据库读取
    if (requestedLinkId && !interviewConfig) {
      try {
        await ensureFullAiInterviewConfigsTable();
        const db = await getDb();
        const configs = await db
          .select()
          .from(fullAiInterviewConfigs)
          .where(eq(fullAiInterviewConfigs.linkId, linkId))
          .limit(1);

        if (configs && configs.length > 0) {
          interviewConfig = configs[0];
          // 同步到内存中（提升下次访问速度）
          if (configStore) {
            configStore.set(linkId, interviewConfig);
          }
          console.log(`[start] 从数据库加载配置成功: linkId=${linkId}`);
        }
      } catch (dbError) {
        console.error(`[start] 从数据库读取配置失败:`, dbError);
      }
    }

    const resume =
      (typeof providedResume === "string" && providedResume.trim()) ||
      interviewConfig?.resume ||
      "";
    const resumeParsedData = providedResumeParsedData || interviewConfig?.resumeParsedData || null;
    const tenantId = interviewConfig?.tenantId || null;
    const userId = interviewConfig?.userId || null;

    if (!resume) {
      console.error(`[start] 面试配置不存在或简历未上传: linkId=${linkId}`);
      return NextResponse.json(
        { error: "面试配置不存在或简历未上传，请联系面试官或重新上传简历" },
        { status: 400 }
      );
    }

    // 岗位需求定义
    const positionRequirements: Record<string, PositionRequirement> = {
      sales_management: {
        id: "sales_management",
        name: "销售管培生",
        description: "销售方向管理培训生",
        requirements: [
          "沟通表达能力",
          "客户关系管理",
          "销售技巧和谈判能力",
          "目标达成能力",
          "抗压能力",
          "市场洞察力"
        ],
        questionFocus: "侧重考察销售技能、客户开发、业绩达成、客户关系维护等方面",
        workHours: "上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，月休四天，不同城市会略有差异，详细作息可以联系人事进一步确认"
      },
      store_manager: {
        id: "store_manager",
        name: "储备店长",
        description: "门店储备管理人员",
        requirements: [
          "门店运营管理",
          "团队管理能力",
          "客户服务意识",
          "库存管理",
          "数据分析能力",
          "问题解决能力"
        ],
        questionFocus: "侧重考察门店管理经验、团队协作、客户服务、运营思维等方面",
        workHours: "上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，月休四天，不同城市会略有差异，详细作息可以联系人事进一步确认"
      },
      hr: {
        id: "hr",
        name: "人事",
        description: "人力资源相关岗位",
        requirements: [
          "人力资源管理知识",
          "沟通协调能力",
          "招聘与配置",
          "培训与发展",
          "员工关系管理",
          "劳动法规了解"
        ],
        questionFocus: "侧重考察HR专业知识、沟通协调、招聘经验、员工管理等方面",
        workHours: "冬时令：上午 8:40-12:00，下午 13:30-17:40；夏时令：上午 8:40-12:00，下午 14:00-18:10，单休"
      },
      ai_management: {
        id: "ai_management",
        name: "智能体管培生",
        description: "智能体方向管理培训生",
        requirements: [
          "学习能力",
          "技术理解能力",
          "创新思维",
          "逻辑分析能力",
          "产品理解",
          "跨部门协作"
        ],
        questionFocus: "侧重考察对AI/智能体的理解、学习能力、创新思维、技术潜质等方面",
        workHours: "上班时间一般是上午 8:00 或 8:30，下午 6:00 下班，月休四天，不同城市会略有差异，详细作息可以联系人事进一步确认"
      }
    };

    let positionRecord: typeof sharedPositions.$inferSelect | undefined;
    if (!positionRequirements[position]) {
      try {
        await ensurePositionsTable();
        const db = await getDb();
        const matchedPosition = await db
          .select()
          .from(sharedPositions)
          .where(eq(sharedPositions.id, Number(position)))
          .limit(1);

        positionRecord = matchedPosition[0];
      } catch (positionLookupError) {
        console.error("[start] 读取动态岗位信息失败，回退通用岗位逻辑:", positionLookupError);
      }
    }

    const selectedPosition =
      positionRequirements[position] ||
      Object.values(positionRequirements).find((item) => item.name === position) ||
      buildDynamicPositionRequirement(position, positionRecord);

    const scoreRule = await getAiScoreRule(position, selectedPosition.name);
    const runtimeState = createRuleDrivenRuntimeState(scoreRule);

    // 系统提示词：设置AI面试官的角色
    const systemPrompt = `你是一位专业的AI面试官，专门负责${selectedPosition.name}岗位的面试。

【岗位信息】
岗位名称：${selectedPosition.name}
岗位描述：${selectedPosition.description}
岗位要求：
${selectedPosition.requirements.map((req: string, idx: number) => `${idx + 1}. ${req}`).join('\n')}
考察重点：${selectedPosition.questionFocus}

【工作时间说明】
工作时间安排：${selectedPosition.workHours || "请咨询人事部门获取详细的工作时间安排"}

【其他注意事项】
当候选人询问法定节假日时，请按以下标准回答：
"法定节假日都是会安排休息的，具体的休假时间细节你可以和人事同事详细沟通，目前不同城市的休假执行细则会略有差异。"

当候选人询问社保 / 五险一金时，请按以下标准回答：
"咱们这边是在员工转正之后，统一缴纳五险。"

当候选人询问试用期与转正时，请按以下标准回答：
"我们的试用期一般为六个月，如果您工作表现优秀、达到岗位要求，是可以申请提前转正的。"

【评分维度与标准】（5分制，总分100分）

1. 沟通表达与亲和力（30%）
   - 5分 (86-100分): 表达流畅清晰，逻辑性强，亲和力强，能够快速建立信任
   - 4分 (66-85分): 表达清晰，逻辑性较好，有亲和力
   - 3分 (55-65分): 表达基本清晰，逻辑性一般
   - 2分 (30-54分): 表达不够清晰，逻辑性较弱
   - 1分 (0-29分): 表达混乱，无逻辑性

2. 学习意愿与适配能力（30%）
   - 5分 (86-100分): 学习能力强，快速适应环境，主动学习新技术
   - 4分 (66-85分): 学习能力较强，能够较快适应
   - 3分 (55-65分): 学习能力一般，基本能适应
   - 2分 (30-54分): 学习能力较弱，适应较慢
   - 1分 (0-29分): 缺乏学习意愿和能力

3. 目标感与执行力（15%）
   - 5分 (86-100分): 目标明确，执行力强，结果导向
   - 4分 (66-85分): 有目标感，执行力较强
   - 3分 (55-65分): 有一定目标感，执行力一般
   - 2分 (30-54分): 目标感不强，执行力弱
   - 1分 (0-29分): 无目标感，缺乏执行力

4. 抗压与抗挫折能力（15%）
   - 5分 (86-100分): 抗压能力强，善于应对挫折，心态积极
   - 4分 (66-85分): 抗压能力较强，能够应对挫折
   - 3分 (55-65分): 抗压能力一般，基本能应对挫折
   - 2分 (30-54分): 抗压能力较弱，容易受挫
   - 1分 (0-29分): 抗压能力差，无法应对挫折

5. 客户需求敏感度（10%）
   - 5分 (86-100分): 敏锐洞察客户需求，主动满足，超越期望
   - 4分 (66-85分): 能够理解客户需求，及时响应
   - 3分 (55-65分): 基本理解客户需求，有所响应
   - 2分 (30-54分): 对客户需求不敏感，响应不及时
   - 1分 (0-29分): 忽视客户需求

【候选人信息】
候选人姓名：${candidateName}
面试模式：${mode === "junior" ? "初级（1-3年经验）" : mode === "senior" ? "中级（3-5年经验）" : "高级（5年以上经验）"}

【候选人简历】
${resume}

【面试阶段说明】
面试分为三个阶段：
1. 第一阶段：自我介绍（引导候选人进行自我介绍，了解基本情况）
2. 第二阶段：核心问题提问（根据简历、岗位要求、评分维度提出针对性问题，每个问题最多进行2次追问后换下一个问题${selectedPosition.id === "ai_management" ? "，共提问9-10个核心问题（包括3-4个技术基础能力题目，技术题目从题库随机抽取，不需要追问）" : "，共提问5-6个核心问题"}）
3. 第三阶段：公司介绍和问答（介绍公司和岗位，询问候选人是否有问题）

当前阶段：第一阶段（自我介绍）

【第一阶段要求】
1. 友好、专业、礼貌地向候选人打招呼
2. 引导候选人进行2-3分钟的自我介绍
3. 建议候选人介绍以下内容：
   - 简要的工作经历（最近1-2份工作）
   - 为什么选择这个岗位
   - 个人优势和特长
4. 保持温和、友好的语气
5. 时间控制在2-3分钟内
6. 鼓励候选人充分展示自己

【语速控制】
- 说话语速适中，不宜过快或过慢
- 保持每分钟约150-180字的语速
- 重要信息可以稍微放慢语速
- 确保候选人能够清晰理解所有问题

请开始第一阶段面试，友好地向候选人打招呼并引导进行自我介绍。`;

    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: "请开始面试。",
      },
    ];

    // 调用 LLM 生成第一个问题（使用重试机制）
    console.log(`[start] 开始调用 LLM 生成第一个问题`);
    logConcurrentStats('start - before LLM call');
    
    // 获取面试对话场景的模型配置
    const interviewModelId = await getModelId('interview_dialog');
    console.log(`[start] 使用模型: ${interviewModelId}`);
    
    let openingQuestion = "";

    try {
      const response = await invokeWithRetry(messages, {
        model: interviewModelId,
        temperature: 0.7,
      });
      openingQuestion = response.content;
    } catch (llmError) {
      console.error("[start] LLM 生成首问失败，使用本地兜底开场白:", llmError);
      openingQuestion = buildFallbackOpeningQuestion(candidateName, selectedPosition.name);
    }
    logConcurrentStats('start - after LLM call');

    // 保存面试会话到数据库
    const sessionData = {
      interviewId,
      linkId,
      candidateName,
      resume,
      resumeParsedData, // 添加结构化简历数据
      mode,
      position: selectedPosition,
      positionId: position,
      tenantId,
      userId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "请开始第一阶段面试。" },
        { role: "assistant", content: openingQuestion },
      ],
      startTime: new Date(),
      interviewStage: 1, // 1-自我介绍，2-核心问题，3-结束阶段
      followUpCount: 0, // 当前问题的追问次数
      currentQuestionCount: 0, // 核心问题数量
      scoreRuleSnapshot: runtimeState.scoreRuleSnapshot,
      dimensionCoverage: runtimeState.dimensionCoverage,
      requiredQuestionState: runtimeState.requiredQuestionState,
      currentQuestionMeta: runtimeState.currentQuestionMeta,
      askedQuestionKeys: runtimeState.askedQuestionKeys,
    };

    // 保存到数据库
    const meetingLink = buildCandidateInterviewLink(
      getInterviewPublicBaseUrlFromRequest(request),
      linkId
    );
    await Promise.all([
      saveInterviewSession(sessionData),
      saveInterviewStatistics({
        linkId,
        interviewId,
        candidateName,
        position,
        mode,
        meetingLink,
        meetingId: interviewId, // 使用 interviewId 作为会议ID
        status: 'in_progress'
        ,
        tenantId,
        userId,
      }),
    ]);

    console.log(`[start] 面试会话已创建: interviewId=${interviewId}, candidateName=${candidateName}, stage=${sessionData.interviewStage}`);

    return NextResponse.json({
      success: true,
      interviewId,
      messages: [
        {
          id: Date.now().toString(),
          role: "interviewer",
          content: openingQuestion,
          timestamp: new Date(),
        },
      ],
    });
  } catch (error) {
    console.error("开始面试失败:", error);
    return NextResponse.json(
      { error: "开始面试失败，请重试" },
      { status: 500 }
    );
  }
}
