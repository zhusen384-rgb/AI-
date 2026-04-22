/**
 * LLM集成模块 - 使用大语言模型实现智能对话
 * 
 * 核心功能：
 * - 意图识别
 * - 回复生成
 * - 情感分析
 * - 意向判断
 * - 敏感词检测
 */

import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';
import type {
  JobPosition,
  CandidateCommunication,
  Message,
  Platform,
  IntentLevel,
  AIAnalysis,
} from './types';

async function getSceneModel(scene: 'interview_dialog' | 'evaluation' | 'resume_parse'): Promise<string> {
  return getModelId(scene);
}

function createLLMClient() {
  return createCompatibleLlmClient();
}

/**
 * 分析候选人消息
 */
export async function analyzeCandidateMessage(
  message: string,
  context: {
    job: JobPosition;
    conversationHistory: Message[];
    platform: Platform;
  }
): Promise<AIAnalysis> {
  const client = createLLMClient();
  
  const systemPrompt = `你是一个招聘沟通助手，负责分析候选人的消息。
请分析候选人消息，返回以下信息：
1. intent: 意图类型，可选值：inquiry(询问)、application(应聘)、refusal(拒绝)、greeting(打招呼)、other(其他)
2. sentiment: 情感倾向，可选值：positive(积极)、neutral(中立)、negative(消极)
3. intentLevel: 意向等级，可选值：A(高意向)、B(中意向)、C(低意向)、D(无意向)
4. keywords: 关键词列表（候选人关注的点）
5. shouldIntervene: 是否需要人工介入（boolean）

请以JSON格式返回结果，不要包含其他文字。`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { 
      role: 'user' as const, 
      content: `岗位信息：${context.job.name}
候选人消息：${message}

请分析这条消息。` 
    },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.3,
      model: await getSceneModel('evaluation'),
    });

    // 解析JSON响应
    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        intent: result.intent,
        sentiment: result.sentiment,
        intentLevel: result.intentLevel as IntentLevel,
        keywords: result.keywords || [],
        shouldIntervene: result.shouldIntervene || false,
      };
    }
  } catch (error) {
    console.error('分析候选人消息失败:', error);
  }

  // 返回默认值
  return {
    intent: 'other',
    sentiment: 'neutral',
    intentLevel: 'B' as IntentLevel,
    keywords: [],
    shouldIntervene: false,
  };
}

/**
 * 生成回复消息
 */
export async function generateReply(
  context: {
    job: JobPosition;
    candidateMessage: string;
    conversationHistory: Message[];
    platform: Platform;
    stage: string;
  }
): Promise<string> {
  const client = createLLMClient();
  
  const platformToneMap: Record<Platform, string> = {
    boss: '轻松、直接、简洁',
    zhilian: '正式、礼貌、专业',
    liepin: '专业、得体',
    '51job': '正式、礼貌',
  };

  const systemPrompt = `你是一个招聘沟通助手，正在代表HR与候选人沟通。
岗位：${context.job.name}
地点：${context.job.location}
薪资：${context.job.salaryMin}-${context.job.salaryMax}K
公司：${context.job.companyIntro || '某科技公司'}

沟通风格：${platformToneMap[context.platform]}
当前对话阶段：${context.stage}

回复要求：
1. 简洁自然，像真人一样
2. 不要过于正式或机械化
3. 针对候选人的问题给出有针对性的回复
4. 不要提及你是AI
5. 控制在50字以内`;

  // 构建对话历史
  const conversationMessages = context.conversationHistory
    .slice(-6) // 最近6条消息
    .map(msg => ({
      role: (msg.sender === 'hr' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: msg.content,
    }));

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversationMessages,
    { role: 'user' as const, content: context.candidateMessage },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.7,
      model: await getSceneModel('interview_dialog'),
    });

    return response.content.trim();
  } catch (error) {
    console.error('生成回复失败:', error);
    return '好的，我了解了。还有什么想了解的吗？';
  }
}

/**
 * 判断候选人意向等级
 */
export async function determineIntentLevel(
  communication: CandidateCommunication
): Promise<IntentLevel> {
  const client = createLLMClient();
  
  const messages = [
    {
      role: 'system' as const,
      content: `你是一个招聘意向分析专家。
根据候选人的沟通记录，判断其意向等级：
- A: 高意向，主动询问面试、愿意发简历、留联系方式
- B: 中意向，提问多、犹豫、需进一步了解
- C: 低意向，敷衍回复、明确考虑中
- D: 无意向，明确不考虑、不回复、恶意消息

只返回A、B、C、D中的一个字母，不要包含其他文字。`,
    },
    {
      role: 'user' as const,
      content: `对话轮数：${communication.communicationStats.effectiveRounds}
候选人消息数：${communication.communicationStats.candidateMessageCount}
HR消息数：${communication.communicationStats.hrMessageCount}
当前状态：${communication.status}
标签：${communication.tags.join('、')}

请判断意向等级。`,
    },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.2,
      model: await getSceneModel('evaluation'),
    });

    const level = response.content.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(level)) {
      return level as IntentLevel;
    }
  } catch (error) {
    console.error('判断意向等级失败:', error);
  }

  return 'B';
}

/**
 * 检测敏感词
 */
export async function detectSensitiveContent(
  message: string
): Promise<{
  hasSensitive: boolean;
  sensitiveWords: string[];
  riskLevel: 'low' | 'medium' | 'high';
}> {
  const client = createLLMClient();
  
  const messages = [
    {
      role: 'system' as const,
      content: `你是一个内容安全检测专家。
检测消息中是否包含以下类型的敏感内容：
1. 平台违规内容：引导脱离平台交易、微信转账、私下联系等
2. 个人隐私：身份证号、银行卡号、密码等
3. 不当内容：广告、骚扰、欺诈等

返回JSON格式：
{
  "hasSensitive": boolean,
  "sensitiveWords": string[],
  "riskLevel": "low" | "medium" | "high"
}`,
    },
    {
      role: 'user' as const,
      content: `消息内容：${message}`,
    },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.1,
      model: await getSceneModel('evaluation'),
    });

    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('检测敏感内容失败:', error);
  }

  return {
    hasSensitive: false,
    sensitiveWords: [],
    riskLevel: 'low',
  };
}

/**
 * 提取简历关键信息
 */
export async function extractResumeInfo(
  resumeText: string
): Promise<{
  name?: string;
  skills: string[];
  experience: number;
  education: string;
  currentCompany?: string;
  expectedSalary?: string;
}> {
  const client = createLLMClient();
  
  const messages = [
    {
      role: 'system' as const,
      content: `你是一个简历解析专家。
从简历文本中提取关键信息，返回JSON格式：
{
  "name": "姓名",
  "skills": ["技能1", "技能2"],
  "experience": 工作年限(数字),
  "education": "最高学历",
  "currentCompany": "当前公司",
  "expectedSalary": "期望薪资"
}`,
    },
    {
      role: 'user' as const,
      content: `简历内容：\n${resumeText}`,
    },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.1,
      model: await getSceneModel('resume_parse'),
    });

    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('提取简历信息失败:', error);
  }

  return {
    skills: [],
    experience: 0,
    education: '',
  };
}

/**
 * 生成打招呼消息
 */
export async function generateGreetingMessage(
  context: {
    job: JobPosition;
    candidateName?: string;
    candidateSkills?: string[];
    platform: Platform;
  }
): Promise<string> {
  const client = createLLMClient();
  
  const platformStyleMap: Record<Platform, string> = {
    boss: '简洁直接，不用称呼，直接说事',
    zhilian: '正式礼貌，使用"您好"开头',
    liepin: '专业得体，适当寒暄',
    '51job': '正式礼貌，使用尊称',
  };

  const messages = [
    {
      role: 'system' as const,
      content: `你是一个招聘HR，正在给候选人发送首次打招呼消息。
岗位：${context.job.name}
公司：${context.job.companyIntro || '某科技公司'}
亮点：${context.job.highlights?.join('、') || '发展前景好'}

要求：
1. ${platformStyleMap[context.platform]}
2. 60字以内
3. 自然真实，像真人发的
4. 可以提到候选人技能匹配度
5. 引导回复，不要只是陈述`,
    },
    {
      role: 'user' as const,
      content: `候选人：${context.candidateName || '候选人'}
匹配技能：${context.candidateSkills?.slice(0, 3).join('、') || '相关技能'}

生成打招呼消息：`,
    },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.8,
      model: await getSceneModel('interview_dialog'),
    });

    return response.content.trim();
  } catch (error) {
    console.error('生成打招呼消息失败:', error);
    return `您好，看到您的简历，觉得非常匹配我们的${context.job.name}岗位，有兴趣聊聊吗？`;
  }
}

/**
 * 流式生成回复（用于实时对话）
 */
export async function* streamGenerateReply(
  context: {
    job: JobPosition;
    candidateMessage: string;
    conversationHistory: Message[];
    platform: Platform;
  }
): AsyncGenerator<string> {
  const client = createLLMClient();
  
  const systemPrompt = `你是一个招聘HR助手，正在与候选人沟通。
岗位：${context.job.name}
地点：${context.job.location}

要求：简洁自然，50字以内`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: context.candidateMessage },
  ];

  try {
    const response = await client.invoke(messages, {
      temperature: 0.7,
      model: await getSceneModel('interview_dialog'),
    });

    const content = response.content.trim();
    for (let index = 0; index < content.length; index += 40) {
      yield content.slice(index, index + 40);
    }
  } catch (error) {
    console.error('流式生成回复失败:', error);
    yield '好的，我了解了。';
  }
}
