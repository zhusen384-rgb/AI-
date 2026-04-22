import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-auth";
import {
  generateInterviewQuestions,
  type GenerateInterviewQuestionsRequest,
} from "@/lib/interview-question-generator";
import { createCompatibleLlmClient } from "@/lib/ark-llm";

const client = createCompatibleLlmClient();

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = (await request.json()) as GenerateInterviewQuestionsRequest;

    if (!body.resumeData || !body.jobDescription) {
      return NextResponse.json(
        {
          success: false,
          error: "简历数据和岗位描述不能为空",
        },
        { status: 400 }
      );
    }

    const questions = await generateInterviewQuestions(client, body);

    return NextResponse.json({
      success: true,
      data: { questions },
      questions,
    });
  } catch (error) {
    console.error("问题库生成失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "问题库生成失败",
      },
      { status: 500 }
    );
  }
});
