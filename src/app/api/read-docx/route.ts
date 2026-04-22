import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "请提供Word文档文件" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await mammoth.extractRawText({ buffer });

    return NextResponse.json({
      success: true,
      content: result.value,
    });
  } catch (error) {
    console.error("读取Word文档失败:", error);
    return NextResponse.json(
      { error: "读取Word文档失败" },
      { status: 500 }
    );
  }
}
