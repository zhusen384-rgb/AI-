import { NextRequest, NextResponse } from 'next/server';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';

const client = createCompatibleLlmClient();

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, position, mode } = await req.json();

    if (!conversationHistory || conversationHistory.length === 0) {
      return NextResponse.json(
        { error: '对话记录不能为空' },
        { status: 400 }
      );
    }

    // 提取面试官的问题
    const interviewerQuestions = conversationHistory
      .filter((msg: any) => msg.role === 'interviewer')
      .map((msg: any, index: number) => `${index + 1}. ${msg.content}`)
      .join('\n');

    const systemPrompt = `你是一位资深的面试培训专家，负责评估面试官在陪练中的表现。

【评估维度】
1. 提问质量（0-10分）：问题的开放性、针对性、深度
2. 倾听能力（0-10分）：是否认真倾听、是否重复提问
3. 追问技巧（0-10分）：是否有效追问、使用STAR法则
4. 沟通引导（0-10分）：引导候选人表达、营造良好氛围
5. 时间控制（0-10分）：节奏把握、重点突出

【评分标准】
- 8-10分：优秀，表现突出
- 6-7分：良好，基本达标
- 4-5分：一般，有待改进
- 0-3分：不足，需要加强

【输出格式】
请严格按照以下JSON格式输出：

{
  "evaluation": {
    "questionQuality": 数字0-10,
    "listeningSkill": 数字0-10,
    "followUpTechnique": 数字0-10,
    "communicationGuidance": 数字0-10,
    "timeControl": 数字0-10,
    "overallScore": 数字0-100,
    "strengths": [
      "优势1",
      "优势2"
    ],
    "improvements": [
      "改进建议1",
      "改进建议2"
    ],
    "recommendations": [
      "具体建议1",
      "具体建议2",
      "具体建议3"
    ]
  }
}

【要求】
1. 所有分数必须是整数
2. overallScore 是前5项的平均分（0-100）
3. 至少列出3个具体建议
4. 基于实际的对话内容进行评估`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `面试官在${mode}模式下针对${position}岗位的陪练中提出的问题如下：

${interviewerQuestions}

请对面试官的提问技巧进行评估。`,
      },
    ];

    const response = await client.invoke(messages, {
      model: await getModelId('evaluation'),
      temperature: 0.3,
    });

    let parsedData;
    try {
      parsedData = JSON.parse(response.content);
    } catch (error) {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析评估数据');
      }
    }

    return NextResponse.json({
      success: true,
      data: parsedData,
    });
  } catch (error) {
    console.error('评估失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '评估失败',
      },
      { status: 500 }
    );
  }
}
