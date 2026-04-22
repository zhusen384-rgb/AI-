import { NextRequest, NextResponse } from 'next/server';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';

const client = createCompatibleLlmClient();

export async function POST(req: NextRequest) {
  try {
    const { question, positionTitle, positionDescription, mode, conversationHistory, resume } = await req.json();

    if (!question) {
      return NextResponse.json(
        { error: '问题不能为空' },
        { status: 400 }
      );
    }

    // 根据模式设置难度和经验
    const modeSettings: Record<string, { experience: string; depth: string }> = {
      junior: { experience: "1-3年", depth: "基础" },
      senior: { experience: "3-5年", depth: "深入" },
      expert: { experience: "5年以上", depth: "资深" }
    };

    const setting = modeSettings[mode] || modeSettings.senior;

    // 根据岗位信息生成候选人人设
    const systemPrompt = `你现在是一位正在参加${positionTitle || "技术"}岗位面试的候选人。

【岗位信息】
岗位名称：${positionTitle || "技术岗位"}
岗位描述：${positionDescription || "负责相关技术工作"}

【经验水平】
工作经验：${setting.experience}
回答深度：${setting.depth}

${resume ? `【你的简历】
姓名：${resume.name || "候选人"}
年龄：${resume.age || 28}
学历：${resume.education || "本科"}
工作经验：${resume.experience || setting.experience}

技能：${resume.skills ? resume.skills.join('、') : "相关技术栈"}

项目经验：
${resume.projects ? resume.projects.map((p: any, idx: number) => `${idx + 1}. ${p.name} - ${p.role}\n   ${p.description}\n   ${p.achievements}`).join('\n\n') : "相关项目"}

工作经历：
${resume.workHistory ? resume.workHistory.map((w: any, idx: number) => `${idx + 1}. ${w.company} - ${w.position}\n   工作时长：${w.duration}\n   职责：${w.responsibilities}`).join('\n\n') : "相关工作经历"}

个人优势：${resume.strengths ? resume.strengths.join('、') : "专业技能、学习能力、沟通能力"}
职业目标：${resume.careerGoal || "成为技术专家"}
` : ''}

【候选人人设】
1. 你是一位正在面试${positionTitle || "技术"}岗位的候选人，姓名：${resume?.name || "候选人"}
2. 你的回答要体现你对${positionTitle || "技术"}岗位的理解和热情
3. 根据岗位描述和你的简历，你应该具备相关的专业技能和经验
4. 你的回答要符合岗位要求，展示你的专业能力
5. 表现出对这个岗位的渴望和对公司的兴趣
${resume ? `6. 回答问题时，要基于你的真实简历内容，包括项目经验、工作经历和技能` : ''}

【面试要求】
1. 模拟真实候选人的回答方式，包括语气、表达习惯
2. 回答要自然流畅，像真人对话一样
3. 可以适当展示优势和亮点，但不要太夸张
4. 回答长度控制在100-200字之间
5. 如果遇到不会的问题，可以适当展示思考过程
6. 保持积极正面的态度
7. 回答要具体，可以举一些实际案例，基于你的项目经验和技能
8. 回答要体现你对${positionTitle || "技术"}岗位的专业理解
9. 回答要与岗位描述和你的简历相匹配，展示你的相关技能和经验

【重要】
- 你的身份是候选人，不是面试官
- 用第一人称"我"来回答
- 回答要真实可信，符合你的简历和经验水平
- 回答时要参考你的简历内容，包括项目、技能、工作经历
- 避免使用过于专业的术语堆砌
- 语气要礼貌但自然
- 回答要体现你对${positionTitle || "技术"}岗位的专业性和热情`;

    // 构建对话历史
    let conversationContext = "";
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.slice(-4).forEach((msg: any) => {
        if (msg.role === 'interviewer') {
          conversationContext += `\n面试官：${msg.content}\n`;
        } else if (msg.role === 'candidate') {
          conversationContext += `我：${msg.content}\n`;
        }
      });
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `${conversationContext ? `之前的对话记录：\n${conversationContext}\n\n` : ''}面试官的提问：${question}\n\n请以候选人的身份回答这个问题。`,
      },
    ];

    const response = await client.invoke(messages, {
      model: await getModelId('interview_dialog'),
      temperature: 0.7,
    });

    // 清理回答，移除可能的格式标记
    let answer = response.content.trim();
    // 移除可能的开头标记
    answer = answer.replace(/^(候选人|回答|Candidate|Answer)[：:]\s*/i, '');
    // 移除引号
    answer = answer.replace(/^["']|["']$/g, '');

    return NextResponse.json({
      success: true,
      answer: answer,
    });
  } catch (error) {
    console.error('陪练聊天失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '聊天失败',
      },
      { status: 500 }
    );
  }
}
