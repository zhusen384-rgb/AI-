import { NextRequest, NextResponse } from "next/server";
import { getInterviewSession } from "@/lib/db/session-utils";
import { getModelId } from "@/lib/db/model-config-utils";
import { createCompatibleLlmClient } from "@/lib/ark-llm";

// 保留全局存储作为备用（向后兼容）
if (!(global as any).interviewSessions) {
  (global as any).interviewSessions = new Map();
}

// 获取面试会话数据（优先从数据库获取）
const getSession = async (interviewId: string) => {
  // 先从数据库获取
  const dbSession = await getInterviewSession(interviewId);
  if (dbSession) {
    console.log(`[detect-answer-end] 从数据库获取到会话: ${interviewId}`);
    return dbSession;
  }

  // 如果数据库没有，尝试从全局存储获取（向后兼容）
  const globalSession = (global as any).interviewSessions?.get(interviewId);
  if (globalSession) {
    console.log(`[detect-answer-end] 从全局存储获取到会话: ${interviewId}`);
    return globalSession;
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    const { interviewId, answer } = await request.json();

    if (!interviewId || !answer) {
      return NextResponse.json(
        { error: "请提供面试ID和候选人回答" },
        { status: 400 }
      );
    }

    const session = await getSession(interviewId);
    if (!session) {
      console.error(`[detect-answer-end] 面试会话不存在: ${interviewId}`);
      return NextResponse.json(
        { error: "面试会话不存在" },
        { status: 404 }
      );
    }

    const client = createCompatibleLlmClient();

    // 获取最近的对话历史
    const recentMessages = session.messages.slice(-6); // 取最近3轮对话

    const systemPrompt = `你是一位专业的AI面试官，需要判断候选人是否已经回答完当前问题。

【判断标准】
回答结束的特征：
1. 候选人的回答已经涵盖了问题的核心要点
2. 回答有明确的总结或收尾语句（如："以上就是我的看法"、"总之"、"总的来说"等）
3. 回答长度适中（一般50-500字之间）
4. 回答内容完整，逻辑清晰，没有明显的中断

回答未结束的特征：
1. 回答过短（少于20字），可能还在思考中
2. 回答中出现省略号、"等等"、"还有"、"另外"等表示继续的词汇
3. 回答没有逻辑收尾，显得戛然而止
4. 回答过于简略，没有提供具体的例子或细节

【当前对话历史】
${recentMessages.map((m: any) => `${m.role === 'user' ? '候选人' : 'AI面试官'}: ${m.content}`).join('\n')}

【候选人当前回答】
${answer}

【返回格式】
严格按照以下JSON格式返回：
{
  "hasEnded": true/false,
  "confidence": 0.0-1.0（置信度）
}

【示例】
- 回答已结束: {"hasEnded": true, "confidence": 0.9}
- 回答未结束: {"hasEnded": false, "confidence": 0.8}

请仔细分析候选人回答的完整性和逻辑性，判断是否已经回答完当前问题。只返回JSON格式，不要包含任何其他文字。`;

    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: "请判断候选人是否已经回答完当前问题。",
      },
    ];

    // 获取面试对话场景的模型配置
    const interviewModelId = await getModelId('interview_dialog');
    console.log(`[回答结束判断] 使用模型: ${interviewModelId}`);

    const response = await client.invoke(messages, {
      model: interviewModelId,
      temperature: 0.3, // 降低温度以获得更稳定的判断
    });

    console.log(`[回答结束判断] LLM响应: ${response.content}`);

    // 解析JSON响应
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[回答结束判断] 判断结果: hasEnded=${parsed.hasEnded}, confidence=${parsed.confidence}`);

        return NextResponse.json({
          success: true,
          hasEnded: parsed.hasEnded || false,
          confidence: parsed.confidence || 0.5,
        });
      }
    } catch (error) {
      console.error("[回答结束判断] 解析JSON失败:", error);
    }

    // 如果无法解析，默认认为未结束
    return NextResponse.json({
      success: true,
      hasEnded: false,
      confidence: 0.5,
    });
  } catch (error) {
    console.error("[回答结束判断] 判断失败:", error);
    return NextResponse.json(
      { error: "判断回答结束失败", hasEnded: false },
      { status: 500 }
    );
  }
}
