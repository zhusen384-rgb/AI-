import { NextRequest, NextResponse } from 'next/server';
import { calculateMatchScoreWithPenalty } from '@/lib/optimization/calculate-score';

/**
 * 手动计算简历匹配度分数（用于测试和调试）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      resumeContent,
      position,
      evaluationStage = 'resume_screening',
      candidateId,
      resumeId,
      positionId,
    } = body;

    // 验证必要参数
    if (!resumeContent) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少 resumeContent 参数'
        },
        { status: 400 }
      );
    }

    if (!position) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少 position 参数'
        },
        { status: 400 }
      );
    }

    if (!position.title || !position.jobDescription) {
      return NextResponse.json(
        {
          success: false,
          error: 'position 必须包含 title 和 jobDescription 字段'
        },
        { status: 400 }
      );
    }

    console.log('开始计算简历匹配度分数...');
    console.log('  评估阶段:', evaluationStage);
    console.log('  岗位名称:', position.title);

    // 计算匹配度分数
    const result = await calculateMatchScoreWithPenalty(
      resumeContent,
      position,
      evaluationStage,
      candidateId,
      resumeId,
      positionId
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('计算匹配度分数失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '计算匹配度分数失败',
      },
      { status: 500 }
    );
  }
}

/**
 * GET 请求：返回计算说明和示例
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: '简历匹配度计算 API',
    description: '使用权重方案计算简历与岗位的匹配度分数',
    usage: {
      method: 'POST',
      endpoint: '/api/optimization/calculate-score',
      parameters: {
        resumeContent: '简历内容（文本格式）',
        position: {
          title: '岗位名称',
          department: '部门（可选）',
          education: '学历要求（可选）',
          experience: '经验要求（可选）',
          jobDescription: '岗位描述（JD）',
        },
        evaluationStage: '评估阶段：resume_screening 或 final_evaluation（默认：resume_screening）',
        candidateId: '候选人ID（可选，用于记录评估数据）',
        resumeId: '简历ID（可选，用于记录评估数据）',
        positionId: '岗位ID（可选，用于记录评估数据）',
      },
      example: {
        resumeContent: '姓名：张三\n教育背景：...\n工作经历：...',
        position: {
          title: '高级Java开发工程师',
          jobDescription: '岗位要求：...',
        },
        evaluationStage: 'resume_screening',
      }
    },
    algorithm: {
      description: '使用权重方案计算匹配度分数',
      steps: [
        '1. 使用 LLM 分析各个维度的匹配度（0-100分）',
        '2. 根据权重配置计算加权总分',
        '3. 计算降权系数（基于冲突标记）',
        '4. 应用降权系数得到最终分数',
      ],
      resumeScreeningWeights: {
        technicalSkills: 25,      // 技术技能匹配度
        experienceMatch: 20,      // 工作经验相关性
        projectExperience: 15,    // 项目经验
        education: 12,            // 教育背景
        certificates: 8,          // 证书/奖项
        companyBackground: 5,     // 公司背景
        skillMatch: 10,           // 核心技能匹配度
        keywordMatch: 5,          // 关键词匹配度
      },
      penaltyCoefficient: {
        description: '根据简历中的冲突标记计算降权系数',
        highSeverity: 0.10,      // 高严重性：降权10%
        mediumSeverity: 0.05,    // 中严重性：降权5%
        lowSeverity: 0.02,       // 低严重性：降权2%
        maxPenalty: 0.30,        // 最大降权30%
      }
    }
  });
}
