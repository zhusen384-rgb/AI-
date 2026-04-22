import { NextRequest, NextResponse } from 'next/server';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';

const client = createCompatibleLlmClient();

export async function POST(req: NextRequest) {
  try {
    const { interviewData, candidateName, positionTitle, interviewAnswers } = await req.json();

    if (!interviewData || !interviewAnswers) {
      return NextResponse.json(
        { error: '面试数据和面试回答不能为空' },
        { status: 400 }
      );
    }

    const systemPrompt = `你是一位专业的面试评估专家，负责基于面试记录生成结构化的综合评估报告。

请严格按照以下JSON格式输出评估报告：

{
  "evaluation": {
    "hardSkillScore": 数字0-10,
    "experienceScore": 数字0-10,
    "communicationScore": 数字0-10,
    "problemSolvingScore": 数字0-10,
    "professionalismScore": 数字0-10,
    "teamCollaborationScore": 数字0-10,
    "learningAbilityScore": 数字0-10,
    "stressResistanceScore": 数字0-10,
    "strengths": [
      {
        "dimension": "维度名称",
        "score": 数字,
        "description": "具体描述"
      }
    ],
    "weaknesses": [
      {
        "dimension": "维度名称",
        "score": 数字,
        "description": "具体表现"
      }
    ],
    "intention": "high|medium|low",
    "fitScore": 数字0-100,
    "fitVerdict": "是|否",
    "fitReason": "适配理由",
    "retestRecommendation": "复试建议",
    "retestFocus": ["重点考察点1", "重点考察点2"],
    "concerns": ["关注点1", "关注点2"],
    "highlights": ["亮点1", "亮点2"],
    "doubtPoints": ["疑点1", "疑点2"]
  },
  "markdownReport": "完整的Markdown格式报告文本"
}

Markdown报告格式要求：
📊 【岗位名称】面试报告
⏰ 面试时间：HR填写
👤 面试官：[姓名/身份]（如果没有明确写到，需要写"无"）
👥 求职者：[姓名]（学历/经验：本科/2年Java经验）

--- 一、岗位需求匹配 ---
🎯 岗位核心要求：
- 技术：[技术要求]
- 软技能：[软技能要求]
- 学历：[学历要求]

✅ 求职者匹配情况：
| 需求项：求职者表现 →→→ | 匹配度 |
|----------------|--------------------------|--------|
| [需求项1]：[表现] →→→ | [百分比]% |
| [需求项2]：[表现] →→→ | [百分比]% |

--- 二、候选人多维度评价 ---
硬技能匹配度（0-10 分）：[分数]
工作经验适配度（0-10 分）：[分数]
沟通表达能力（0-10 分）：[分数]
问题解决能力（0-10 分）：[分数]
职业素养（0-10 分）：[分数]
岗位整体匹配度（0-10 分）：[分数]
🔑 关键结论：[总结]

--- 三、最终建议 ---
🔹 候选人优势（维度分数5分以上）:
[维度 + 分数 + 具体案例]
- ⭐️「亮点标记」：[亮点]
- ⚠️「需验证疑点」：[疑点]

🔹 候选人劣势（维度分数5分以下）:
[维度 + 分数 + 具体表现]

🔹 候选人的意向度：[高/中/低]
🔹 岗位适配度：[是/否，详细理由]
适配理由：[详细理由]

🔹 初试通过之后，复试的建议：
- 重点考察：[核心能力点]
- 问题方向：[问题方向]

🔗 推荐：[建议复试/建议录用/建议淘汰]（综合得分[分数]分）
⚠️ 关注点：[需要关注的问题]

评分标准（0-10分）：
- 8-10分：优秀，完全符合要求
- 6-7分：良好，基本符合要求
- 4-5分：一般，部分符合要求
- 0-3分：不足，不符合要求

评估维度说明：
1. 硬技能匹配度：岗位要求的技术能力掌握程度
2. 工作经验适配度：相关工作经验与岗位要求的匹配度
3. 沟通表达能力：逻辑清晰度、表达流畅度
4. 问题解决能力：情景题回答的思路和方法
5. 职业素养：态度、时间观念、专业性
6. 团队协作能力：团队合作经验和协作意识
7. 学习能力：新技术学习能力和适应能力
8. 抗压能力：面对压力和挑战的表现

输出要求：
1. 必须严格按照上述JSON格式输出，evaluation用于数据渲染，markdownReport用于文本展示
2. Markdown报告必须包含完整的格式，包括emoji图标、表格、分隔线等
3. 所有分数必须是0-10之间的整数
4. fitScore是综合得分（0-100），基于各维度分数加权计算
5. 所有描述要基于面试回答的具体内容
6. markdownReport字段必须包含完整的文本内容，不要有任何省略`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `候选人姓名：${candidateName}\n应聘岗位：${positionTitle}\n\n面试问题及回答：\n${JSON.stringify(interviewAnswers, null, 2)}\n\n请基于以上信息生成结构化评估报告。`,
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
    console.error('评估报告生成失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '评估报告生成失败',
      },
      { status: 500 }
    );
  }
}
