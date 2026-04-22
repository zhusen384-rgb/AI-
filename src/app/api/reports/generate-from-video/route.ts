import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config } from 'coze-coding-dev-sdk';
import { eq } from 'drizzle-orm';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { positions } from '@/storage/database/shared/schema';
import { ensurePositionsTable } from '@/lib/db/ensure-positions-table';

// 模拟视频分析和报告生成（实际场景中需要更复杂的处理）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoFileKey, candidateName, positionId, meetingId } = body;

    console.log('[报告生成] 开始生成报告:', { videoFileKey, candidateName, positionId, meetingId });

    if (!videoFileKey) {
      return NextResponse.json(
        { error: '缺少视频文件key' },
        { status: 400 }
      );
    }

    // 1. 从对象存储获取视频URL
    const videoUrl = `https://your-storage-bucket.s3.amazonaws.com/${videoFileKey}`;
    
    // 注意：实际场景中需要：
    // - 从S3Storage获取视频文件
    // - 使用ffmpeg提取音频
    // - 调用ASR API进行语音识别
    // - 调用LLM API分析对话内容
    // - 生成结构化报告

    // 2. 模拟语音识别结果（实际应该调用ASR API）
    const mockTranscription = {
      fullText: `面试官：您好，欢迎参加面试。先简单自我介绍一下吧。
候选人：您好，我叫${candidateName || '张三'}，有5年Java开发经验，主要在后端开发和系统架构方面。
面试官：您提到有架构经验，能具体说一下吗？
候选人：我在上一家公司主导过微服务架构改造，将单体应用拆分为10个微服务，提升了系统可扩展性和性能。
面试官：遇到最大的挑战是什么？
候选人：主要是数据一致性问题和性能优化，我们通过引入消息队列和缓存解决了这些问题。
面试官：您觉得自己的优势是什么？
候选人：技术功底扎实，有较强的问题解决能力和团队协作能力。
面试官：好的，今天的面试就到这里，我们会在一周内通知结果。
候选人：谢谢，期待您的消息。`,
      segments: [
        { speaker: 'interviewer', text: '您好，欢迎参加面试。先简单自我介绍一下吧。', startTime: 0 },
        { speaker: 'candidate', text: `您好，我叫${candidateName || '张三'}，有5年Java开发经验，主要在后端开发和系统架构方面。`, startTime: 5000 },
        { speaker: 'interviewer', text: '您提到有架构经验，能具体说一下吗？', startTime: 15000 },
        { speaker: 'candidate', text: '我在上一家公司主导过微服务架构改造，将单体应用拆分为10个微服务，提升了系统可扩展性和性能。', startTime: 20000 },
        { speaker: 'interviewer', text: '遇到最大的挑战是什么？', startTime: 35000 },
        { speaker: 'candidate', text: '主要是数据一致性问题和性能优化，我们通过引入消息队列和缓存解决了这些问题。', startTime: 40000 },
        { speaker: 'interviewer', text: '您觉得自己的优势是什么？', startTime: 55000 },
        { speaker: 'candidate', text: '技术功底扎实，有较强的问题解决能力和团队协作能力。', startTime: 60000 },
        { speaker: 'interviewer', text: '好的，今天的面试就到这里，我们会在一周内通知结果。', startTime: 70000 },
        { speaker: 'candidate', text: '谢谢，期待您的消息。', startTime: 75000 },
      ]
    };

    // 3. 分析面试内容（实际应该调用LLM API）
    const analysis = {
      technicalScore: 85,
      communicationScore: 90,
      problemSolvingScore: 88,
      overallScore: 88,
      recommendation: 'pass',
      summary: '候选人具有扎实的技术背景和丰富的架构经验，在微服务改造方面有实际项目经验。沟通表达流畅，能够清晰阐述技术问题和解决方案。整体表现优秀，建议进入下一轮面试。',
      strengths: [
        '有丰富的微服务架构经验',
        '具备系统改造和性能优化能力',
        '技术问题解决思路清晰',
        '沟通表达流畅',
        '团队合作意识强'
      ],
      weaknesses: [
        '需要更多了解业务背景',
        '可以补充更多技术细节',
        '可以举例说明具体技术选型原因'
      ],
      questionsAndAnswers: [
        {
          question: '您提到有架构经验，能具体说一下吗？',
          answer: '主导过微服务架构改造，将单体应用拆分为10个微服务，提升了系统可扩展性和性能。',
          rating: 'good',
          feedback: '回答具体，有实际项目经验支撑，体现了架构能力'
        },
        {
          question: '遇到最大的挑战是什么？',
          answer: '主要是数据一致性问题和性能优化，通过引入消息队列和缓存解决了这些问题。',
          rating: 'good',
          feedback: '能够识别核心问题，并提出了解决方案，思路清晰'
        },
        {
          question: '您觉得自己的优势是什么？',
          answer: '技术功底扎实，有较强的问题解决能力和团队协作能力。',
          rating: 'average',
          feedback: '回答较为泛泛，可以结合具体案例说明'
        }
      ]
    };

    // 4. 生成评估报告
    const report = {
      id: `report_${Date.now()}`,
      candidateName: candidateName || '未知候选人',
      positionId,
      positionTitle: await getPositionTitle(positionId),
      meetingId,
      videoFileKey,
      interviewDate: new Date().toISOString(),
      duration: 90, // 面试时长（分钟）
      transcription: mockTranscription,
      analysis: {
        overallScore: analysis.overallScore,
        technicalScore: analysis.technicalScore,
        communicationScore: analysis.communicationScore,
        problemSolvingScore: analysis.problemSolvingScore,
        recommendation: analysis.recommendation,
        summary: analysis.summary,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        questionsAndAnswers: analysis.questionsAndAnswers
      },
      recommendation: analysis.recommendation, // pass, fail, pending
      createdAt: new Date().toISOString()
    };

    console.log('[报告生成] 报告生成成功:', report.id);

    return NextResponse.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('[报告生成] 生成报告失败:', error);
    return NextResponse.json(
      { error: '生成报告失败', message: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// 辅助函数：获取岗位名称
async function getPositionTitle(positionId?: number | string): Promise<string> {
  if (positionId === undefined || positionId === null || positionId === '') {
    return '未知岗位';
  }

  const numericPositionId =
    typeof positionId === 'number' ? positionId : Number(positionId);

  if (!Number.isFinite(numericPositionId)) {
    return typeof positionId === 'string' && positionId.trim()
      ? positionId.trim()
      : '未知岗位';
  }

  try {
    await ensurePositionsTable();
    const db = await getDb(schema);
    const [position] = await db
      .select({ title: positions.title })
      .from(positions)
      .where(eq(positions.id, numericPositionId))
      .limit(1);

    return position?.title || '未知岗位';
  } catch (error) {
    console.error('[报告生成] 获取岗位名称失败:', error);
    return '未知岗位';
  }
}
