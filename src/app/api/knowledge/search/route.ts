import { NextRequest, NextResponse } from "next/server";
import { searchCompanyKnowledge } from "@/lib/chatbot/local-knowledge";

/**
 * 本地知识库搜索 API
 * 直接检索 assets 目录中的知识文件
 */
export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5 } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "搜索查询不能为空" },
        { status: 400 }
      );
    }

    const { results } = await searchCompanyKnowledge(query);
    const slicedResults = results.slice(0, Math.max(1, Number(topK) || 5));

    return NextResponse.json({
      success: true,
      query,
      results: slicedResults.map((item) => ({
        content: item.snippet,
        score: item.score,
        docId: item.fileName,
        docName: item.fileName,
      })),
      totalResults: slicedResults.length,
    });
  } catch (error) {
    console.error("[知识库搜索] 处理异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "搜索失败",
        results: [],
      },
      { status: 500 }
    );
  }
}
