import { and, desc, eq } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/storage/database/shared/schema";
import { aiPositionScoreRules, positions } from "@/storage/database/shared/schema";
import { ensureAiPositionScoreRulesTable } from "@/lib/db/ensure-ai-position-score-rules-table";

export type ScoreRuleDimension = {
  code: string;
  name: string;
  weight: number;
  description: string;
  scoringRule: string;
  evidenceHints?: string[];
  mustAsk?: boolean;
  minQuestions?: number;
  maxFollowUps?: number;
  questionTemplates?: string[];
  followUpTemplates?: string[];
  coverageThreshold?: number;
};

export type ScoreRuleThresholds = {
  hire: number;
  consider: number;
  reject: number;
};

export type ScoreRuleRequiredQuestion = {
  id: string;
  question: string;
  purpose?: string;
  dimensionCode?: string;
  when?: "early" | "middle" | "late" | "any";
  maxFollowUps?: number;
};

/**
 * 随机题库中的单个题目
 */
export type QuestionBankItem = {
  id: string;
  question: string;
  standardAnswer: string;
  scoringCriteria: string;
  dimensionCode?: string;
};

export type ScoreRuleInterviewStrategy = {
  minCoreQuestions: number;
  maxCoreQuestions: number;
  maxFollowUpsPerQuestion: number;
  focusHighWeightDimensions: boolean;
};

export type ScoreRuleConfig = {
  positionKey: string;
  positionName: string;
  ruleName: string;
  ruleVersion: string;
  status: "draft" | "active" | "archived";
  dimensions: ScoreRuleDimension[];
  thresholds: ScoreRuleThresholds;
  requiredQuestions: ScoreRuleRequiredQuestion[];
  interviewStrategy: ScoreRuleInterviewStrategy;
  promptTemplate?: string | null;
  /** 随机提问题库 */
  questionBank?: QuestionBankItem[];
  /** 每次面试从题库中随机抽取的题目数量 */
  questionBankCount?: number;
};

const DEFAULT_THRESHOLD: ScoreRuleThresholds = {
  hire: 80,
  consider: 60,
  reject: 0,
};

const DEFAULT_INTERVIEW_STRATEGY: ScoreRuleInterviewStrategy = {
  minCoreQuestions: 5,
  maxCoreQuestions: 7,
  maxFollowUpsPerQuestion: 2,
  focusHighWeightDimensions: true,
};

function normalizeWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) {
    return 0;
  }
  return Math.round(weight * 10000) / 10000;
}

function normalizeDimensions(dimensions: ScoreRuleDimension[]): ScoreRuleDimension[] {
  const safeDimensions = Array.isArray(dimensions) ? dimensions.filter(Boolean) : [];
  const totalWeight = safeDimensions.reduce((sum, item) => sum + Math.max(item.weight || 0, 0), 0);
  if (safeDimensions.length === 0) {
    return [];
  }

  return safeDimensions.map((item) => ({
    code: item.code.trim(),
    name: item.name.trim(),
    weight: totalWeight > 0 ? normalizeWeight((item.weight || 0) / totalWeight) : normalizeWeight(1 / safeDimensions.length),
    description: item.description?.trim() || item.name.trim(),
    scoringRule: item.scoringRule?.trim() || "根据候选人面试表现与岗位要求综合评估",
    evidenceHints: Array.isArray(item.evidenceHints) ? item.evidenceHints.filter(Boolean) : [],
    mustAsk: item.mustAsk ?? false,
    minQuestions: Math.max(1, Math.round(item.minQuestions || 1)),
    maxFollowUps: Math.max(0, Math.round(item.maxFollowUps ?? 2)),
    questionTemplates: Array.isArray(item.questionTemplates) ? item.questionTemplates.filter(Boolean) : [],
    followUpTemplates: Array.isArray(item.followUpTemplates) ? item.followUpTemplates.filter(Boolean) : [],
    coverageThreshold: typeof item.coverageThreshold === "number" ? item.coverageThreshold : 0.75,
  }));
}

function normalizeRequiredQuestions(requiredQuestions: ScoreRuleRequiredQuestion[]): ScoreRuleRequiredQuestion[] {
  if (!Array.isArray(requiredQuestions)) {
    return [];
  }

  return requiredQuestions
    .filter((item) => item && item.question)
    .map((item, index) => ({
      id: item.id?.trim() || `required_${index + 1}`,
      question: item.question.trim(),
      purpose: item.purpose?.trim() || "",
      dimensionCode: item.dimensionCode?.trim() || "",
      when: item.when || "any",
      maxFollowUps: Math.max(0, Math.round(item.maxFollowUps ?? 1)),
    }));
}

function normalizeQuestionBank(questionBank?: QuestionBankItem[]): QuestionBankItem[] {
  if (!Array.isArray(questionBank)) {
    return [];
  }

  return questionBank
    .filter((item) => item && item.question)
    .map((item, index) => ({
      id: item.id?.trim() || `qb_${index + 1}`,
      question: item.question.trim(),
      standardAnswer: item.standardAnswer?.trim() || "",
      scoringCriteria: item.scoringCriteria?.trim() || "",
      dimensionCode: item.dimensionCode?.trim() || "",
    }));
}

function normalizeInterviewStrategy(strategy?: Partial<ScoreRuleInterviewStrategy>): ScoreRuleInterviewStrategy {
  return {
    minCoreQuestions: Math.max(3, Math.round(strategy?.minCoreQuestions ?? DEFAULT_INTERVIEW_STRATEGY.minCoreQuestions)),
    maxCoreQuestions: Math.max(
      Math.round(strategy?.minCoreQuestions ?? DEFAULT_INTERVIEW_STRATEGY.minCoreQuestions),
      Math.round(strategy?.maxCoreQuestions ?? DEFAULT_INTERVIEW_STRATEGY.maxCoreQuestions)
    ),
    maxFollowUpsPerQuestion: Math.max(0, Math.round(strategy?.maxFollowUpsPerQuestion ?? DEFAULT_INTERVIEW_STRATEGY.maxFollowUpsPerQuestion)),
    focusHighWeightDimensions: strategy?.focusHighWeightDimensions ?? DEFAULT_INTERVIEW_STRATEGY.focusHighWeightDimensions,
  };
}

// ==================== 所有内置岗位评分规则 ====================

/**
 * 所有内置岗位 key 列表，用于前端展示和匹配
 */
export const BUILTIN_POSITION_KEYS = ["ai_management", "sales_management", "store_manager", "hr"] as const;
export type BuiltinPositionKey = (typeof BUILTIN_POSITION_KEYS)[number];

/**
 * 内置岗位元数据
 */
export const BUILTIN_POSITION_META: Record<BuiltinPositionKey, { name: string; category: string }> = {
  ai_management: { name: "智能体管培生", category: "AI技术" },
  sales_management: { name: "销售管培生", category: "销售" },
  store_manager: { name: "储备店长", category: "门店管理" },
  hr: { name: "人事", category: "职能" },
};

// ---- 智能体管培生 ----
export function buildAiManagementDefaultRule(): ScoreRuleConfig {
  return {
    positionKey: "ai_management",
    positionName: "智能体管培生",
    ruleName: "智能体管培生评分规则",
    ruleVersion: "builtin-v1",
    status: "active",
    thresholds: {
      hire: 82,
      consider: 65,
      reject: 0,
    },
    interviewStrategy: {
      minCoreQuestions: 8,
      maxCoreQuestions: 10,
      maxFollowUpsPerQuestion: 2,
      focusHighWeightDimensions: true,
    },
    requiredQuestions: [
      {
        id: "ai_required_motivation",
        question: "你为什么会选择智能体管培生这个岗位？如果加入，你最希望先解决的一类业务问题是什么？",
        purpose: "验证岗位动机与业务理解",
        dimensionCode: "active_learning",
        when: "early",
        maxFollowUps: 1,
      },
      {
        id: "ai_required_frontline",
        question: "这个岗位需要先到一线门店扎根和观察业务，你怎么看这种工作方式？如果到了门店，你会先从哪些事情开始了解？",
        purpose: "验证一线接受度与业务落地意识",
        dimensionCode: "frontline_communication",
        when: "middle",
        maxFollowUps: 1,
      },
    ],
    dimensions: normalizeDimensions([
      {
        code: "active_learning",
        name: "主动学习能力",
        weight: 0.12,
        description: "主动探索 AI 工具、业务知识和新技术的意愿与行动",
        scoringRule: "重点看是否主动学习、是否持续跟进新工具，以及能否把学习迁移到业务场景。",
        evidenceHints: ["主动学习经历", "自驱探索案例", "AI工具持续使用"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你最近主动学习过哪些AI工具或新技术？为什么会去学，它们后来有没有真的帮到你？"],
        followUpTemplates: ["你当时是怎么开始学的？如果没有人要求你，你为什么还会主动去研究？"],
      },
      {
        code: "practical_application",
        name: "实操与AI工具应用能力",
        weight: 0.25,
        description: "真实使用 AI 工具解决问题、落地场景或搭建工具的能力",
        scoringRule: "重点看是否有真实上手经历、解决过什么问题、过程是否清晰、结果是否有价值。",
        evidenceHints: ["工具实操", "项目落地", "使用效果"],
        mustAsk: true,
        minQuestions: 2,
        maxFollowUps: 2,
        questionTemplates: ["请讲一个你真实使用AI工具解决问题的案例，重点说你自己做了什么、怎么做的、最后效果怎么样。"],
        followUpTemplates: ["如果把这个案例拆开看，你具体负责的是哪一部分？最后效果有没有量化结果？"],
      },
      {
        code: "frontline_communication",
        name: "一线落地与沟通协作能力",
        weight: 0.1,
        description: "与门店、一线人员、客户及跨部门协同的沟通能力",
        scoringRule: "重点看沟通对象适配能力、是否能把技术语言翻译成业务语言、是否愿意贴近一线。",
        evidenceHints: ["跨团队协作", "业务沟通", "门店/客户互动"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["如果你发现门店同事提出的问题和技术团队理解的不一样，你会怎么把双方拉到同一个频道？"],
      },
      {
        code: "reflection_problem_solving",
        name: "反思复盘与问题解决能力",
        weight: 0.11,
        description: "发现问题、结构化分析、复盘改进和落地优化能力",
        scoringRule: "重点看是否能结构化拆解问题、提出改进动作，并说明复盘后的效果。",
        evidenceHints: ["问题拆解", "复盘案例", "优化结果"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 2,
        questionTemplates: ["讲一个你做完事情后主动复盘并改进的例子。你当时发现了什么问题，后来怎么优化的？"],
      },
      {
        code: "expression_sharing",
        name: "表达与知识分享能力",
        weight: 0.12,
        description: "表达逻辑、经验抽象、知识传递和赋能他人的能力",
        scoringRule: "重点看表达是否清晰、是否能总结方法论，以及是否有分享或带教案例。",
        evidenceHints: ["结构化表达", "经验分享", "知识沉淀"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["如果让你把一个你熟悉的AI工具教给完全没接触过的同事，你会怎么讲，先讲什么后讲什么？"],
      },
      {
        code: "technical_foundation",
        name: "技术基础能力",
        weight: 0.3,
        description: "编程、API、数据、智能体框架和工程基础能力",
        scoringRule: "重点看技术题回答、项目技术细节、编程理解和工程落地能力。",
        evidenceHints: ["技术题作答", "代码/接口能力", "框架理解"],
        mustAsk: true,
        minQuestions: 2,
        maxFollowUps: 1,
      },
    ]),
    questionBank: [
      {
        id: "tech_1",
        question: "什么是智能体（Agent）？它和普通聊天机器人有什么区别？",
        standardAnswer: "智能体是具有感知、决策、执行能力的AI系统，能够自主完成复杂任务。核心区别：聊天机器人主要是问答对话、被动响应；智能体具备自主决策、工具调用、多步推理能力，能主动完成任务。",
        scoringCriteria: "5分：完整回答定义+区别+关键能力，能举例说明\n4分：回答定义和主要区别，提到工具调用或自主决策\n3分：能说出智能体大概是什么，知道有工具调用能力\n2分：理解有偏差，混淆聊天机器人和智能体\n1分：完全不了解或回答错误",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_2",
        question: "什么是提示词（Prompt）？一个好的提示词应该是什么样子？举一例",
        standardAnswer: "提示词是用户输入给大模型的指令，引导模型生成期望的输出。好提示词要素：角色设定、任务描述、上下文信息、输出格式要求、约束条件。",
        scoringCriteria: "5分：完整回答定义+要素+给出合理示例\n4分：回答定义和主要要素，示例较简单\n3分：知道提示词是什么，能说出1-2个要素\n2分：概念模糊，说不出好提示词的特点\n1分：不了解或回答错误",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_3",
        question: "什么是工作流（Workflow）？什么情况只用提示词不够？",
        standardAnswer: "工作流是多步骤任务的编排流程，将复杂任务拆解为有序的执行步骤。需要工作流的场景：多步骤任务、需要条件判断分支、需要调用多个工具协作。",
        scoringCriteria: "5分：准确定义+场景分析+能举例\n4分：基本定义正确，能说出需要工作流的场景\n3分：知道工作流概念，理解比较浅\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_4",
        question: "什么是知识库？它在智能体中起什么作用？",
        standardAnswer: "知识库是存储结构化/非结构化数据的系统，为智能体提供领域特定知识。作用：弥补大模型通用知识不足、提供实时/私域数据、提高回答准确性。",
        scoringCriteria: "5分：准确定义+作用+理解与RAG的关系\n4分：基本理解正确，能说出主要作用\n3分：知道知识库概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_5",
        question: "什么是RAG（检索增强生成）？它解决了什么问题？",
        standardAnswer: "RAG是将检索与生成结合的技术：先从知识库检索相关内容，再结合检索结果让大模型生成回答。解决问题：大模型知识过时、缺乏私域知识、减少幻觉。",
        scoringCriteria: "5分：完整理解RAG流程+解决的问题+与微调的区别\n4分：基本理解RAG概念和流程\n3分：知道RAG概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_6",
        question: "什么是Tool Calling（工具调用）？在智能体里怎么用？",
        standardAnswer: "Tool Calling是让大模型能够调用外部工具和API的能力。智能体通过工具描述让模型理解可用工具，模型决定何时调用哪个工具，系统执行工具获取结果并返回给模型。",
        scoringCriteria: "5分：完整理解概念+流程+能举例应用场景\n4分：基本理解概念和使用方式\n3分：知道工具调用概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_7",
        question: "什么是MCP协议？它和传统API有什么区别？",
        standardAnswer: "MCP（Model Context Protocol）是Anthropic提出的模型上下文协议，标准化了大模型与外部工具/数据源的通信方式。与传统API区别：MCP是标准化协议、支持双向通信、面向AI场景设计。",
        scoringCriteria: "5分：准确理解MCP定义+与API区别+应用场景\n4分：基本理解MCP概念\n3分：听说过MCP\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_8",
        question: "大模型的“幻觉”是什么？怎么减少幻觉？",
        standardAnswer: "幻觉是指大模型生成看似合理但实际错误的内容。减少方法：RAG检索增强、设置低温度参数、约束输出格式、事实验证、使用知识库。",
        scoringCriteria: "5分：准确理解幻觉概念+多种减少方法+实际应用\n4分：理解概念+能说出2-3种方法\n3分：知道幻觉概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_9",
        question: "什么是上下文窗口（Context Window）？它的限制对实际应用有什么影响？",
        standardAnswer: "上下文窗口是模型单次能处理的最大token数量。影响：限制对话长度、限制输入文档大小、影响长文本处理能力。解决方案：分段处理、摘要压缩、RAG。",
        scoringCriteria: "5分：理解概念+实际影响+解决方案\n4分：理解概念和主要限制\n3分：知道概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
      {
        id: "tech_10",
        question: "Temperature（温度）参数是什么？什么场景用高温度，什么场景用低温度？",
        standardAnswer: "Temperature控制模型输出的随机性。低温度(0-0.3)：事实性问答、代码生成、数据提取等需要确定性的场景。高温度(0.7-1.0)：创意写作、头脑风暴等需要多样性的场景。",
        scoringCriteria: "5分：准确理解+场景分析+能结合实际应用\n4分：基本理解概念和场景区分\n3分：知道温度参数概念\n2分：概念模糊\n1分：不了解",
        dimensionCode: "technical_foundation",
      },
    ],
    questionBankCount: 3,
  };
}

// ---- 销售管培生 ----
export function buildSalesManagementDefaultRule(): ScoreRuleConfig {
  return {
    positionKey: "sales_management",
    positionName: "销售管培生",
    ruleName: "销售管培生评分规则",
    ruleVersion: "builtin-v1",
    status: "active",
    thresholds: {
      hire: 80,
      consider: 62,
      reject: 0,
    },
    interviewStrategy: {
      minCoreQuestions: 6,
      maxCoreQuestions: 8,
      maxFollowUpsPerQuestion: 2,
      focusHighWeightDimensions: true,
    },
    requiredQuestions: [
      {
        id: "sales_required_motivation",
        question: "你为什么选择做销售？你觉得销售工作中最重要的能力是什么？",
        purpose: "验证销售动机和对销售工作的认知",
        dimensionCode: "sales_skill",
        when: "early",
        maxFollowUps: 1,
      },
      {
        id: "sales_required_pressure",
        question: "销售工作经常面临业绩压力，你是怎么看待和应对这种压力的？能举一个具体的例子吗？",
        purpose: "验证抗压能力和心态稳定性",
        dimensionCode: "resilience",
        when: "middle",
        maxFollowUps: 1,
      },
    ],
    dimensions: normalizeDimensions([
      {
        code: "communication_affinity",
        name: "沟通表达与亲和力",
        weight: 0.25,
        description: "表达清晰度、说服力、倾听回应能力和亲和力",
        scoringRule: "重点看表达是否清晰流畅、能否快速建立信任感、是否具备客户沟通场景下的亲和力和说服力。",
        evidenceHints: ["自我介绍表现", "案例表述清晰度", "追问回应能力"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["请你讲一个你成功说服客户或他人接受你方案的案例，重点说你是怎么沟通的。"],
        followUpTemplates: ["当时对方最大的顾虑是什么？你是怎么打消的？"],
      },
      {
        code: "sales_skill",
        name: "销售技巧与客户开发能力",
        weight: 0.3,
        description: "客户开发、需求挖掘、谈判成交和客户关系维护的能力",
        scoringRule: "重点看是否有客户开发经验、能否识别并挖掘客户需求、谈判和成交能力如何、是否能维护客户关系。",
        evidenceHints: ["客户开发经历", "成交案例", "客户维护方法"],
        mustAsk: true,
        minQuestions: 2,
        maxFollowUps: 2,
        questionTemplates: [
          "请讲一个你从零开始开发客户并最终成交的完整案例。",
          "你是怎么挖掘客户的真实需求的？有没有客户一开始拒绝后来被你转化的案例？",
        ],
        followUpTemplates: ["这个客户后续有没有复购或转介绍？你是怎么维护的？"],
      },
      {
        code: "target_execution",
        name: "目标感与执行力",
        weight: 0.2,
        description: "目标拆解、计划推进、结果导向和业绩达成能力",
        scoringRule: "重点看是否有明确的目标拆解能力、是否能推动计划执行并对结果负责、有无业绩达成经验。",
        evidenceHints: ["业绩目标案例", "计划执行过程", "结果数据"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你在过去的工作或实习中，有没有接到过一个有明确指标的任务？你是怎么拆解目标、执行计划、最后完成的？"],
      },
      {
        code: "resilience",
        name: "抗压与抗挫折能力",
        weight: 0.15,
        description: "面对压力和挫折时的心态调节、情绪管理和恢复能力",
        scoringRule: "重点看是否有真实的抗压案例、面对挫折的心态和行动、是否能从失败中总结经验。",
        evidenceHints: ["压力场景应对", "挫折恢复经历", "心态调节方式"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["讲一个你在工作或学习中遭遇重大挫折或压力的经历，当时你是怎么应对的？"],
      },
      {
        code: "market_insight",
        name: "市场洞察与客户敏感度",
        weight: 0.1,
        description: "对市场趋势、客户需求变化、竞争环境的敏锐观察力",
        scoringRule: "重点看是否关注市场动态、能否洞察客户需求变化、是否具备竞争分析意识。",
        evidenceHints: ["市场分析", "客户需求洞察", "竞品了解"],
        mustAsk: false,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你对你所在行业或目标行业的市场现状有什么了解？你觉得客户最关心的是什么？"],
      },
    ]),
  };
}

// ---- 储备店长 ----
export function buildStoreManagerDefaultRule(): ScoreRuleConfig {
  return {
    positionKey: "store_manager",
    positionName: "储备店长",
    ruleName: "储备店长评分规则",
    ruleVersion: "builtin-v1",
    status: "active",
    thresholds: {
      hire: 78,
      consider: 60,
      reject: 0,
    },
    interviewStrategy: {
      minCoreQuestions: 6,
      maxCoreQuestions: 8,
      maxFollowUpsPerQuestion: 2,
      focusHighWeightDimensions: true,
    },
    requiredQuestions: [
      {
        id: "store_required_operation",
        question: "如果你接手一家新门店，你会优先从哪些方面了解和管理这家店？",
        purpose: "验证门店运营管理思维",
        dimensionCode: "store_operation",
        when: "early",
        maxFollowUps: 1,
      },
      {
        id: "store_required_team",
        question: "你带过团队吗？如果团队中有一个同事持续不达标，你会怎么处理？",
        purpose: "验证团队管理能力和处事方式",
        dimensionCode: "team_management",
        when: "middle",
        maxFollowUps: 1,
      },
    ],
    dimensions: normalizeDimensions([
      {
        code: "store_operation",
        name: "门店运营管理能力",
        weight: 0.3,
        description: "门店日常运营管理、流程优化、库存管理、业绩管理能力",
        scoringRule: "重点看是否了解门店运营全流程、能否识别运营问题、是否有优化改进的意识和方法。",
        evidenceHints: ["运营管理经验", "流程优化案例", "业绩管理经历"],
        mustAsk: true,
        minQuestions: 2,
        maxFollowUps: 2,
        questionTemplates: [
          "你有没有参与过门店、店铺或团队的运营管理？请讲一个你发现运营问题并改进的案例。",
          "你觉得一家门店要做好日常运营，最关键的几个环节是什么？",
        ],
        followUpTemplates: ["你当时是怎么发现这个问题的？改进后效果怎么样？有没有量化数据？"],
      },
      {
        code: "team_management",
        name: "团队管理与协作能力",
        weight: 0.25,
        description: "团队建设、人员培养、沟通协调和冲突处理能力",
        scoringRule: "重点看是否有带团队经验、能否培养下属、是否善于沟通和处理团队冲突。",
        evidenceHints: ["带团队经历", "人员培养案例", "冲突处理"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 2,
        questionTemplates: ["你在管理团队时，是怎么分配任务和激励团队成员的？"],
        followUpTemplates: ["遇到团队成员之间有矛盾时，你是怎么处理的？"],
      },
      {
        code: "customer_service",
        name: "客户服务意识",
        weight: 0.2,
        description: "客户需求理解、服务标准把控、投诉处理和客户满意度管理",
        scoringRule: "重点看是否有客户服务意识、能否处理客户投诉、是否关注客户体验和满意度。",
        evidenceHints: ["服务案例", "投诉处理", "客户反馈"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["讲一个你处理客户投诉或不满的案例，你当时是怎么处理的，结果如何？"],
      },
      {
        code: "data_analysis",
        name: "数据分析与决策能力",
        weight: 0.15,
        description: "通过数据分析指导运营决策、发现问题和优化业务的能力",
        scoringRule: "重点看是否关注数据指标、能否从数据中发现问题、是否用数据驱动决策。",
        evidenceHints: ["数据分析案例", "关键指标理解", "数据驱动决策"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你在工作中会关注哪些关键数据指标？能不能举一个你通过数据发现问题并做出调整的例子？"],
      },
      {
        code: "problem_solving",
        name: "问题解决与应急处理能力",
        weight: 0.1,
        description: "面对突发问题的应对能力、分析能力和解决方案制定能力",
        scoringRule: "重点看是否能冷静分析突发问题、提出有效解决方案、是否有应急处理经验。",
        evidenceHints: ["突发事件处理", "问题分析", "应急方案"],
        mustAsk: false,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["如果门店突然出现设备故障或人员短缺等紧急情况，你会怎么应对？"],
      },
    ]),
  };
}

// ---- 人事 ----
export function buildHrDefaultRule(): ScoreRuleConfig {
  return {
    positionKey: "hr",
    positionName: "人事",
    ruleName: "人事岗位评分规则",
    ruleVersion: "builtin-v1",
    status: "active",
    thresholds: {
      hire: 78,
      consider: 60,
      reject: 0,
    },
    interviewStrategy: {
      minCoreQuestions: 5,
      maxCoreQuestions: 7,
      maxFollowUpsPerQuestion: 2,
      focusHighWeightDimensions: true,
    },
    requiredQuestions: [
      {
        id: "hr_required_motivation",
        question: "你为什么选择做人事/HR工作？你觉得人事工作中最有挑战的部分是什么？",
        purpose: "验证职业动机和对HR工作的理解深度",
        dimensionCode: "hr_professional",
        when: "early",
        maxFollowUps: 1,
      },
      {
        id: "hr_required_labor_law",
        question: "你在工作中有没有遇到过需要处理劳动法规相关问题的情况？你是怎么处理的？",
        purpose: "验证劳动法规知识和实际应用能力",
        dimensionCode: "compliance_risk",
        when: "middle",
        maxFollowUps: 1,
      },
    ],
    dimensions: normalizeDimensions([
      {
        code: "hr_professional",
        name: "人力资源专业知识",
        weight: 0.25,
        description: "人力资源六大模块知识、HR流程设计和制度建设能力",
        scoringRule: "重点看是否了解HR核心模块（招聘、培训、薪酬、绩效、劳动关系、人力规划）、有无实操经验。",
        evidenceHints: ["HR模块经验", "制度建设", "流程优化"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 2,
        questionTemplates: ["你之前在HR工作中主要负责哪些模块？请讲一个你在该模块中比较有成就感的案例。"],
        followUpTemplates: ["你在做这件事的过程中遇到过什么困难？最后是怎么解决的？"],
      },
      {
        code: "recruitment_skill",
        name: "招聘与人才配置能力",
        weight: 0.25,
        description: "人才画像构建、招聘渠道管理、面试筛选和录用决策能力",
        scoringRule: "重点看是否能精准构建人才画像、高效使用招聘渠道、面试筛选判断力是否准确。",
        evidenceHints: ["招聘流程经验", "渠道使用", "筛选判断"],
        mustAsk: true,
        minQuestions: 2,
        maxFollowUps: 1,
        questionTemplates: [
          "你平时是怎么做岗位人才画像的？从需求确认到最终录用，你的招聘流程是什么样的？",
          "你用过哪些招聘渠道？不同岗位你会怎么选择渠道？",
        ],
        followUpTemplates: ["如果用人部门对候选人要求一直变化，你会怎么处理？"],
      },
      {
        code: "communication_coordination",
        name: "沟通协调能力",
        weight: 0.2,
        description: "跨部门沟通、员工关系管理、上下级协调和冲突调解能力",
        scoringRule: "重点看是否擅长跨部门沟通、能否平衡员工与公司利益、是否有处理员工纠纷的经验。",
        evidenceHints: ["跨部门沟通", "员工关系处理", "冲突调解"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["讲一个你在工作中成功协调多方利益或调解冲突的案例。"],
      },
      {
        code: "compliance_risk",
        name: "劳动法规与合规意识",
        weight: 0.15,
        description: "劳动法规知识、用工风险防范和合规体系建设能力",
        scoringRule: "重点看是否了解劳动法基本条款、能否识别用工风险、是否有合规管理经验。",
        evidenceHints: ["劳动法知识", "风险防范案例", "合规管理"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你对劳动合同法中关于试用期、解除合同、经济补偿的规定了解多少？能举一个你实际处理过的案例吗？"],
      },
      {
        code: "training_development",
        name: "培训与员工发展能力",
        weight: 0.15,
        description: "培训需求分析、培训体系搭建、员工发展规划和绩效改进能力",
        scoringRule: "重点看是否有培训组织经验、能否设计有效的培训方案、是否关注员工成长和绩效提升。",
        evidenceHints: ["培训组织案例", "员工发展规划", "绩效改进"],
        mustAsk: false,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["你有没有组织过培训活动或搭建过培训体系？效果怎么衡量的？"],
      },
    ]),
  };
}

// ---- 通用默认规则（未命中任何内置岗位时使用） ----
export function buildGeneralDefaultRule(positionKey: string, positionName: string): ScoreRuleConfig {
  return {
    positionKey,
    positionName,
    ruleName: `${positionName}评分规则`,
    ruleVersion: "builtin-v1",
    status: "active",
    thresholds: DEFAULT_THRESHOLD,
    interviewStrategy: DEFAULT_INTERVIEW_STRATEGY,
    requiredQuestions: [],
    dimensions: normalizeDimensions([
      {
        code: "communication",
        name: "沟通表达",
        weight: 0.25,
        description: "表达清晰度、逻辑性、倾听与回应能力",
        scoringRule: "重点看表达是否清晰完整、是否能回应追问、是否具有基础亲和力。",
        evidenceHints: ["自我介绍", "案例讲述", "追问回答"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
        questionTemplates: ["请你结合最近一次比较有代表性的经历，完整讲讲背景、你的角色、你的做法和结果。"],
      },
      {
        code: "job_fit",
        name: "岗位匹配度",
        weight: 0.3,
        description: "过往经历、技能和岗位要求的贴合程度",
        scoringRule: "重点看候选人与岗位 JD、经验要求、技能要求的契合程度。",
        evidenceHints: ["相关经历", "岗位动机", "能力匹配"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 2,
        questionTemplates: ["你为什么会投这个岗位？结合你的经历，你觉得自己和这个岗位最匹配的点是什么？"],
      },
      {
        code: "execution",
        name: "执行力与目标感",
        weight: 0.2,
        description: "计划推进、结果导向与目标意识",
        scoringRule: "重点看是否有明确目标、是否能推动事情落地并对结果负责。",
        evidenceHints: ["目标案例", "执行过程", "结果产出"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
      },
      {
        code: "learning",
        name: "学习适应能力",
        weight: 0.15,
        description: "学习新知识、接受反馈并适应新环境的能力",
        scoringRule: "重点看是否有主动学习、适应变化和快速上手的新环境经历。",
        evidenceHints: ["学习计划", "适应新环境", "反馈改进"],
        mustAsk: true,
        minQuestions: 1,
        maxFollowUps: 1,
      },
      {
        code: "problem_solving",
        name: "问题解决能力",
        weight: 0.1,
        description: "分析问题、提出方案和复盘优化的能力",
        scoringRule: "重点看是否能拆解问题、给出解决路径并说明验证结果。",
        evidenceHints: ["问题分析", "解决动作", "复盘总结"],
        mustAsk: false,
        minQuestions: 1,
        maxFollowUps: 1,
      },
    ]),
  };
}

export function getBuiltinRule(positionKey: string, positionName?: string | null): ScoreRuleConfig {
  // 精确匹配 positionKey
  if (positionKey === "ai_management") {
    return buildAiManagementDefaultRule();
  }
  if (positionKey === "sales_management") {
    return buildSalesManagementDefaultRule();
  }
  if (positionKey === "store_manager") {
    return buildStoreManagerDefaultRule();
  }
  if (positionKey === "hr") {
    return buildHrDefaultRule();
  }

  // 模糊匹配 positionName（兼容从岗位表动态读取的场景）
  const normalizedName = positionName?.trim() || "";
  if (normalizedName.includes("智能体管培生")) {
    return buildAiManagementDefaultRule();
  }
  if (normalizedName.includes("销售管培生") || normalizedName.includes("销售管理培训")) {
    return buildSalesManagementDefaultRule();
  }
  if (normalizedName.includes("储备店长") || normalizedName.includes("门店店长")) {
    return buildStoreManagerDefaultRule();
  }
  if (normalizedName.includes("人事") || normalizedName.includes("人力资源") || normalizedName === "HR") {
    return buildHrDefaultRule();
  }

  return buildGeneralDefaultRule(positionKey, positionName || positionKey);
}

/**
 * 获取所有内置岗位的评分规则列表
 */
export function getAllBuiltinRules(): ScoreRuleConfig[] {
  return [
    buildAiManagementDefaultRule(),
    buildSalesManagementDefaultRule(),
    buildStoreManagerDefaultRule(),
    buildHrDefaultRule(),
  ];
}

export function normalizeRuleConfig(input: Partial<ScoreRuleConfig> & { positionKey: string; positionName: string }): ScoreRuleConfig {
  const positionKey = String(input.positionKey || "").trim();
  const positionName = String(input.positionName || "").trim() || positionKey;
  const builtIn = getBuiltinRule(positionKey, positionName);
  const thresholds = input.thresholds || builtIn.thresholds;
  const normalizedDimensions = normalizeDimensions(input.dimensions || builtIn.dimensions);

  return {
    positionKey,
    positionName,
    ruleName: input.ruleName?.trim() || builtIn.ruleName,
    ruleVersion: input.ruleVersion?.trim() || "v1",
    status: (input.status as ScoreRuleConfig["status"]) || "active",
    dimensions: normalizedDimensions.length > 0 ? normalizedDimensions : builtIn.dimensions,
    thresholds: {
      hire: Number.isFinite(thresholds.hire) ? thresholds.hire : builtIn.thresholds.hire,
      consider: Number.isFinite(thresholds.consider) ? thresholds.consider : builtIn.thresholds.consider,
      reject: Number.isFinite(thresholds.reject) ? thresholds.reject : builtIn.thresholds.reject,
    },
    requiredQuestions: normalizeRequiredQuestions(input.requiredQuestions || builtIn.requiredQuestions),
    interviewStrategy: normalizeInterviewStrategy(input.interviewStrategy || builtIn.interviewStrategy),
    promptTemplate: input.promptTemplate || builtIn.promptTemplate || null,
    questionBank: normalizeQuestionBank(input.questionBank ?? builtIn.questionBank),
    questionBankCount: Math.max(0, Math.round(input.questionBankCount ?? builtIn.questionBankCount ?? 0)),
  };
}

function mapRecordToRule(record: typeof aiPositionScoreRules.$inferSelect): ScoreRuleConfig {
  return normalizeRuleConfig({
    positionKey: record.positionKey,
    positionName: record.positionName,
    ruleName: record.ruleName,
    ruleVersion: record.ruleVersion,
    status: (record.status as ScoreRuleConfig["status"]) || "active",
    dimensions: (record.dimensions as ScoreRuleDimension[]) || [],
    thresholds: (record.thresholds as ScoreRuleThresholds) || DEFAULT_THRESHOLD,
    requiredQuestions: (record.requiredQuestions as ScoreRuleRequiredQuestion[]) || [],
    interviewStrategy: (record.interviewStrategy as ScoreRuleInterviewStrategy) || DEFAULT_INTERVIEW_STRATEGY,
    promptTemplate: record.promptTemplate,
    questionBank: (record as any).questionBank as QuestionBankItem[] | undefined,
    questionBankCount: (record as any).questionBankCount as number | undefined,
  });
}

export async function listAiScoreRules(): Promise<ScoreRuleConfig[]> {
  await ensureAiPositionScoreRulesTable();
  const db = await getDb(schema);
  const records = await db.select().from(aiPositionScoreRules).orderBy(desc(aiPositionScoreRules.updatedAt));
  return records.map(mapRecordToRule);
}

export async function getAiScoreRule(positionKey: string, positionName?: string | null): Promise<ScoreRuleConfig> {
  await ensureAiPositionScoreRulesTable();
  const db = await getDb(schema);
  const [record] = await db
    .select()
    .from(aiPositionScoreRules)
    .where(and(eq(aiPositionScoreRules.positionKey, positionKey), eq(aiPositionScoreRules.status, "active")))
    .limit(1);

  if (record) {
    return mapRecordToRule(record);
  }

  if (/^\d+$/.test(positionKey)) {
    try {
      const [positionRecord] = await db
        .select({
          title: positions.title,
        })
        .from(positions)
        .where(eq(positions.id, Number(positionKey)))
        .limit(1);

      return getBuiltinRule(positionKey, positionRecord?.title || positionName || positionKey);
    } catch (positionLookupError) {
      console.error("[getAiScoreRule] 查询 positions 表失败，使用 positionName 回退:", positionLookupError);
      return getBuiltinRule(positionKey, positionName || positionKey);
    }
  }

  return getBuiltinRule(positionKey, positionName || positionKey);
}

export async function upsertAiScoreRule(
  input: Partial<ScoreRuleConfig> & { positionKey: string; positionName: string },
  operatorUserId: string
): Promise<ScoreRuleConfig> {
  await ensureAiPositionScoreRulesTable();
  const db = await getDb(schema);
  const normalized = normalizeRuleConfig(input);

  const [existing] = await db
    .select()
    .from(aiPositionScoreRules)
    .where(eq(aiPositionScoreRules.positionKey, normalized.positionKey))
    .limit(1);

  if (existing) {
    await db
      .update(aiPositionScoreRules)
      .set({
        positionName: normalized.positionName,
        ruleName: normalized.ruleName,
        ruleVersion: normalized.ruleVersion,
        status: normalized.status,
        dimensions: normalized.dimensions,
        thresholds: normalized.thresholds,
        requiredQuestions: normalized.requiredQuestions,
        interviewStrategy: normalized.interviewStrategy,
        promptTemplate: normalized.promptTemplate || null,
        questionBank: normalized.questionBank || [],
        questionBankCount: normalized.questionBankCount || 0,
        updatedBy: operatorUserId,
        updatedAt: new Date(),
      })
      .where(eq(aiPositionScoreRules.id, existing.id));
  } else {
    await db.insert(aiPositionScoreRules).values({
      positionKey: normalized.positionKey,
      positionName: normalized.positionName,
      ruleName: normalized.ruleName,
      ruleVersion: normalized.ruleVersion,
      status: normalized.status,
      dimensions: normalized.dimensions,
      thresholds: normalized.thresholds,
      requiredQuestions: normalized.requiredQuestions,
      interviewStrategy: normalized.interviewStrategy,
      promptTemplate: normalized.promptTemplate || null,
      questionBank: normalized.questionBank || [],
      questionBankCount: normalized.questionBankCount || 0,
      createdBy: operatorUserId,
      updatedBy: operatorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return getAiScoreRule(normalized.positionKey, normalized.positionName);
}

/**
 * 从评分规则的随机题库中随机抽取指定数量的题目（Fisher-Yates 洗牌）
 */
export function getRandomQuestionsFromBank(
  rule: ScoreRuleConfig,
  excludeIds: string[] = []
): QuestionBankItem[] {
  const bank = (rule.questionBank || []).filter((q) => !excludeIds.includes(q.id));
  const count = Math.min(rule.questionBankCount || 0, bank.length);
  if (count <= 0) {
    return [];
  }

  const shuffled = [...bank];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}
