import { NextRequest, NextResponse } from 'next/server';
import { createCompatibleLlmClient } from '@/lib/ark-llm';
import { getModelId } from '@/lib/db/model-config-utils';

const client = createCompatibleLlmClient();

export async function POST(req: NextRequest) {
  try {
    const { positionTitle, positionDescription, mode } = await req.json();

    if (!positionTitle) {
      return NextResponse.json(
        { error: '岗位名称不能为空' },
        { status: 400 }
      );
    }

    // 根据模式设置经验水平
    const modeSettings: Record<string, { experience: string; years: string }> = {
      junior: { experience: "1-3年", years: "2" },
      senior: { experience: "3-5年", years: "4" },
      expert: { experience: "5年以上", years: "7" }
    };

    const setting = modeSettings[mode] || modeSettings.senior;

    const systemPrompt = `你是一个简历生成助手。请根据提供的岗位信息，生成一份完整的候选人简历。

【要求】
1. 简历要真实可信，符合${setting.experience}工作经验
2. 根据岗位描述，简历内容要匹配岗位要求
3. 包含真实的技能、项目经验和工作经历
4. 避免过于夸张或虚假的信息
5. 简历格式要规范，内容要完整

【输出格式】
请以 JSON 格式输出，包含以下字段：
{
  "name": "候选人姓名（中文）",
  "age": 年龄（数字），
  "education": "学历和学校",
  "experience": "${setting.experience}工作经验",
  "skills": ["技能1", "技能2", "技能3"],
  "projects": [
    {
      "name": "项目名称",
      "role": "担任角色",
      "description": "项目描述（50字左右）",
      "achievements": "主要成就"
    }
  ],
  "workHistory": [
    {
      "company": "公司名称",
      "position": "职位",
      "duration": "工作时长",
      "responsibilities": "主要职责（50字左右）"
    }
  ],
  "strengths": ["优势1", "优势2", "优势3"],
  "careerGoal": "职业目标（一句话）"
}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `岗位名称：${positionTitle}\n岗位描述：${positionDescription || "负责相关技术工作"}\n\n请生成一份匹配该岗位的候选人简历。`,
      },
    ];

    const response = await client.invoke(messages, {
      model: await getModelId('interview_dialog'),
      temperature: 0.8,
    });

    // 提取 JSON 部分
    let content = response.content.trim();
    
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    const resume = JSON.parse(content);

    return NextResponse.json({
      success: true,
      resume: resume,
    });
  } catch (error) {
    console.error('生成简历失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '生成简历失败',
      },
      { status: 500 }
    );
  }
}
