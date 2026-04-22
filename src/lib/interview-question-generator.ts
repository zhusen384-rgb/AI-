import { getModelId } from "@/lib/db/model-config-utils";

type UnknownRecord = Record<string, unknown>;

export type InterviewQuestionType = "basic" | "skill" | "gap" | "scenario";
export type InterviewQuestionDifficulty = "easy" | "medium" | "hard";
export type InterviewQuestionLevel = "junior" | "mid" | "senior";

export interface InterviewQuestion {
  type: InterviewQuestionType;
  category: string;
  question: string;
  followUpQuestions: string[];
  targetSkill: string;
  difficulty: InterviewQuestionDifficulty;
  order?: number;
}

interface InterviewerPreferences {
  focusAreas: string[];
  questionStyle: string;
  additionalNotes: string;
}

interface NormalizedJobDescription {
  title: string;
  jobDescription: string;
  education: string;
  experience: string;
  interviewerPreferences?: InterviewerPreferences;
  coreRequirements: string[];
}

export interface GenerateInterviewQuestionsRequest {
  resumeData: unknown;
  jobDescription: unknown;
  level?: InterviewQuestionLevel;
  coreRequirements?: string[];
}

interface LLMClientLike {
  invoke(
    messages: Array<{ role: "system" | "user"; content: string }>,
    options: { model: string; temperature: number }
  ): Promise<{ content: string }>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readRecordArray(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function normalizeJobDescription(
  value: unknown,
  coreRequirements: string[] = []
): NormalizedJobDescription {
  if (typeof value === "string") {
    return {
      title: "",
      jobDescription: value,
      education: "",
      experience: "",
      coreRequirements,
    };
  }

  if (!isRecord(value)) {
    return {
      title: "",
      jobDescription: "",
      education: "",
      experience: "",
      coreRequirements,
    };
  }

  const preferences = isRecord(value.interviewerPreferences)
    ? {
        focusAreas: readStringArray(value.interviewerPreferences.focusAreas),
        questionStyle: readString(value.interviewerPreferences.questionStyle),
        additionalNotes: readString(value.interviewerPreferences.additionalNotes),
      }
    : undefined;

  return {
    title: readString(value.title),
    jobDescription: readString(value.jobDescription),
    education: readString(value.education),
    experience: readString(value.experience),
    interviewerPreferences: preferences,
    coreRequirements,
  };
}

function normalizeResumePayload(value: unknown): { profile: UnknownRecord; rawText: string } {
  if (typeof value === "string") {
    return {
      profile: {},
      rawText: value,
    };
  }

  if (!isRecord(value)) {
    return {
      profile: {},
      rawText: "",
    };
  }

  if (isRecord(value.parsedData)) {
    return {
      profile: value.parsedData,
      rawText: readString(value.content),
    };
  }

  return {
    profile: value,
    rawText: readString(value.content),
  };
}

function safeJsonParse(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  try {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch?.[1]) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
  } catch {}

  const startIdx = trimmed.indexOf("{");
  const endIdx = trimmed.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return JSON.parse(trimmed.slice(startIdx, endIdx + 1));
  }

  throw new Error("无法解析 LLM 返回的 JSON 数据");
}

function normalizeQuestion(rawQuestion: unknown): InterviewQuestion | null {
  if (!isRecord(rawQuestion)) {
    return null;
  }

  const type = readString(rawQuestion.type);
  if (!["basic", "skill", "gap", "scenario"].includes(type)) {
    return null;
  }

  const difficulty = readString(rawQuestion.difficulty);
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return null;
  }

  return {
    type: type as InterviewQuestionType,
    category: readString(rawQuestion.category) || "other",
    question: readString(rawQuestion.question),
    followUpQuestions: readStringArray(rawQuestion.followUpQuestions),
    targetSkill: readString(rawQuestion.targetSkill),
    difficulty: difficulty as InterviewQuestionDifficulty,
  };
}

function extractQuestions(payload: unknown): InterviewQuestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.questions)) {
    return [];
  }

  return payload.questions
    .map((question) => normalizeQuestion(question))
    .filter((question): question is InterviewQuestion => question !== null)
    .map((question, index) => ({
      ...question,
      order: index + 1,
    }));
}

function buildResumeContent(profile: UnknownRecord, rawText: string): string {
  let resumeContent = "";

  const summary = readString(profile.summary);
  if (summary) {
    resumeContent += `个人简介：${summary}\n\n`;
  }

  const skills = readStringArray(profile.skills);
  if (skills.length > 0) {
    resumeContent += `技能列表：${skills.join(", ")}\n\n`;
  }

  const workExperience = readRecordArray(profile.workExperience);
  if (workExperience.length > 0) {
    resumeContent += "工作经历：\n";
    workExperience.forEach((experience, index) => {
      resumeContent += `${index + 1}. ${readString(experience.company)} - ${readString(experience.position)} (${readString(experience.startDate)} ~ ${readString(experience.endDate)})\n`;

      const responsibilities = experience.responsibilities;
      if (Array.isArray(responsibilities)) {
        resumeContent += `   职责：${readStringArray(responsibilities).join("; ")}\n`;
      } else if (typeof responsibilities === "string") {
        resumeContent += `   职责：${responsibilities}\n`;
      }

      const achievements = experience.achievements;
      if (Array.isArray(achievements)) {
        resumeContent += `   成就：${readStringArray(achievements).join("; ")}\n`;
      } else if (typeof achievements === "string") {
        resumeContent += `   成就：${achievements}\n`;
      }
    });
    resumeContent += "\n";
  }

  const educationList = readRecordArray(profile.education);
  if (educationList.length > 0) {
    resumeContent += "教育背景：\n";
    educationList.forEach((education, index) => {
      resumeContent += `${index + 1}. ${readString(education.school)} - ${readString(education.major)} (${readString(education.degree)})\n`;
    });
    resumeContent += "\n";
  } else if (isRecord(profile.education)) {
    resumeContent += `教育背景：${readString(profile.education.school)} - ${readString(profile.education.major)} (${readString(profile.education.degree)})\n\n`;
  }

  const projects = readRecordArray(profile.projects);
  if (projects.length > 0) {
    resumeContent += "项目经验：\n";
    projects.forEach((project, index) => {
      resumeContent += `${index + 1}. ${readString(project.name)}\n`;
      const description = readString(project.description);
      if (description) {
        resumeContent += `   描述：${description}\n`;
      }

      const technologies = project.technologies;
      if (Array.isArray(technologies)) {
        resumeContent += `   技术：${readStringArray(technologies).join(", ")}\n`;
      } else if (typeof technologies === "string") {
        resumeContent += `   技术：${technologies}\n`;
      }
    });
    resumeContent += "\n";
  }

  if (!resumeContent.trim() && rawText.trim()) {
    resumeContent += `简历原文：\n${rawText.trim()}\n`;
  }

  return resumeContent;
}

function buildAnalysisContent(profile: UnknownRecord): string {
  const strengths = readStringArray(profile.strengths);
  const weaknesses = readStringArray(profile.weaknesses);
  const matchedItems = readRecordArray(profile.matchedItems);
  const unmatchedItems = readRecordArray(profile.unmatchedItems);
  const conflictMarkers = Array.isArray(profile.conflictMarkers) ? profile.conflictMarkers : [];
  const matchScore = typeof profile.matchScore === "number" ? profile.matchScore : undefined;

  if (
    strengths.length === 0 &&
    weaknesses.length === 0 &&
    matchedItems.length === 0 &&
    unmatchedItems.length === 0 &&
    conflictMarkers.length === 0 &&
    matchScore === undefined
  ) {
    return "";
  }

  let analysisContent = "\n简历解析结果：\n";

  if (matchScore !== undefined) {
    analysisContent += `整体匹配度：${matchScore}分\n`;
  }

  if (matchedItems.length > 0) {
    analysisContent += "\n已匹配项：\n";
    matchedItems.forEach((item, index) => {
      analysisContent += `${index + 1}. ${readString(item.requirement)}\n   证据：${readString(item.evidence)}\n`;
    });
  }

  if (unmatchedItems.length > 0) {
    analysisContent += "\n未匹配项：\n";
    unmatchedItems.forEach((item, index) => {
      analysisContent += `${index + 1}. ${readString(item.requirement)}\n   缺失：${readString(item.gap)}\n`;
    });
  }

  if (strengths.length > 0) {
    analysisContent += "\n候选人优势：\n";
    strengths.forEach((strength, index) => {
      analysisContent += `${index + 1}. ${strength}\n`;
    });
  }

  if (weaknesses.length > 0) {
    analysisContent += "\n潜在不足：\n";
    weaknesses.forEach((weakness, index) => {
      analysisContent += `${index + 1}. ${weakness}\n`;
    });
  }

  if (conflictMarkers.length > 0) {
    analysisContent += "\n冲突信息标记（需重点验证）：\n";
    conflictMarkers.forEach((marker, index) => {
      analysisContent += `${index + 1}. ${typeof marker === "string" ? marker : JSON.stringify(marker)}\n`;
    });
  }

  return analysisContent;
}

function buildPrompt(
  resumeContent: string,
  jobDescription: NormalizedJobDescription,
  analysisContent: string,
  level: InterviewQuestionLevel
): string {
  const levelLabels: Record<InterviewQuestionLevel, string> = {
    junior: "应届生/初级",
    mid: "专员/中级",
    senior: "资深/高级",
  };

  let jdContent = `岗位名称：${jobDescription.title}\n`;
  jdContent += `学历要求：${jobDescription.education}\n`;
  jdContent += `经验要求：${jobDescription.experience}\n`;
  jdContent += `岗位描述（JD）：${jobDescription.jobDescription}\n`;

  if (jobDescription.coreRequirements.length > 0) {
    jdContent += `核心能力要求：${jobDescription.coreRequirements.join("、")}\n`;
  }

  let preferenceContent = "";
  if (jobDescription.interviewerPreferences) {
    preferenceContent = "\n面试官偏好：\n";
    if (jobDescription.interviewerPreferences.focusAreas.length > 0) {
      preferenceContent += `重点考察领域：${jobDescription.interviewerPreferences.focusAreas.join("、")}\n`;
    }
    if (jobDescription.interviewerPreferences.questionStyle) {
      preferenceContent += `提问风格：${jobDescription.interviewerPreferences.questionStyle}\n`;
    }
    if (jobDescription.interviewerPreferences.additionalNotes) {
      preferenceContent += `补充说明：${jobDescription.interviewerPreferences.additionalNotes}\n`;
    }
  }

  return `你是一位资深的面试官，需要为候选人生成分层面试问题库。

候选人简历：
${resumeContent}

岗位信息：
${jdContent}
${preferenceContent}
${analysisContent}

目标职级：${levelLabels[level]}

请按照以下4个层次生成面试问题，每个层次生成3-5道题：

1. 基础验证题 - 验证候选人简历真实性，确认基本技能和经验
2. 能力考察题 - 深度考察候选人的专业能力和解决问题的能力
3. 缺口补全题 - 针对候选人与岗位要求的差距进行考察（重点基于未匹配项）
4. 情景模拟题 - 模拟实际工作场景，考察候选人的应变和决策能力

每道题必须包含以下字段：
- type: 问题类型（basic/skill/gap/scenario）
- category: 问题类别（hard_skill/soft_skill/experience/other）
- question: 问题内容
- followUpQuestions: 追问列表（2-3个追问，用于深度挖掘）
- targetSkill: 考察目标
- difficulty: 难度等级（easy/medium/hard）

难度等级根据目标职级设定：
- 应届生：easy 为主，少量 medium
- 专员：medium 为主，少量 easy 和 hard
- 资深：hard 为主，少量 medium

请确保问题：
1. 基于候选人简历和岗位JD生成，具有针对性
2. 重点结合简历解析结果：针对已匹配项验证深度，针对未匹配项生成缺口补全题
3. 遵守面试官偏好：重点考察领域要在问题中体现，提问风格要匹配
4. 验证冲突信息：对于冲突信息标记，必须在基础验证题中进行重点追问验证
5. 挖掘候选人优势：针对候选人的优势，在能力考察题中深度挖掘
6. 暴露潜在不足：针对潜在不足，在缺口补全题或情景模拟题中设置考察点
7. 每道题的追问要有层次，从表象到本质逐步深入
8. 考察目标清晰明确，与岗位要求匹配
9. 难度等级与目标职级匹配

特别说明：
- 如果有面试官偏好中的重点考察领域，确保至少有2-3道题覆盖这些领域
- 如果有冲突信息标记，必须生成对应的基础验证题进行核实
- 如果提问风格为"深入"，追问要更有深度，挖掘技术细节
- 如果提问风格为"灵活"，情景模拟题要更多样化

请以 JSON 格式返回，格式如下：
{
  "questions": [
    {
      "type": "basic",
      "category": "experience",
      "question": "问题内容",
      "followUpQuestions": ["追问1", "追问2"],
      "targetSkill": "考察目标",
      "difficulty": "easy"
    }
  ]
}

注意：
- 必须返回纯 JSON 格式，不要包含任何其他文字
- 基础验证题3-4题
- 能力考察题4-5题
- 缺口补全题3-4题
- 情景模拟题2-3题
- 总题数控制在12-16题之间
- 必须针对简历解析结果和面试官偏好生成有针对性的问题`;
}

export async function generateInterviewQuestions(
  client: LLMClientLike,
  request: GenerateInterviewQuestionsRequest
): Promise<InterviewQuestion[]> {
  const level = request.level ?? "mid";
  const normalizedJobDescription = normalizeJobDescription(
    request.jobDescription,
    request.coreRequirements
  );
  const { profile, rawText } = normalizeResumePayload(request.resumeData);
  const resumeContent = buildResumeContent(profile, rawText);
  const analysisContent = buildAnalysisContent(profile);
  const prompt = buildPrompt(resumeContent, normalizedJobDescription, analysisContent, level);

  const interviewModelId = await getModelId("interview_dialog");

  const response = await client.invoke(
    [
      {
        role: "system",
        content:
          "你是一位资深的面试官，擅长生成分层面试问题。请只输出 JSON 格式，不要添加任何解释性文字。",
      },
      { role: "user", content: prompt },
    ],
    {
      model: interviewModelId,
      temperature: 0.7,
    }
  );

  return extractQuestions(safeJsonParse(response.content));
}
