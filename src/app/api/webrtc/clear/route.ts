import { NextRequest, NextResponse } from 'next/server';

// 内存存储信号数据（与 signal/route.ts 共享）
const signalStore = new Map<string, any>();

// POST: 清除 WebRTC 信号
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId } = body;

    if (!meetingId) {
      return NextResponse.json(
        { error: '缺少 meetingId' },
        { status: 400 }
      );
    }

    signalStore.delete(meetingId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('清除信号失败:', error);
    return NextResponse.json(
      { error: '清除信号失败' },
      { status: 500 }
    );
  }
}
