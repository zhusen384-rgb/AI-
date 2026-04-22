import { NextRequest, NextResponse } from 'next/server';

// 内存存储信号数据（生产环境应该使用 Redis 或数据库）
const signalStore = new Map<string, any>();

// POST: 保存或更新 WebRTC 信号
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meetingId, type, signal, role } = body;

    console.log('[信令服务器] 收到信号:', { meetingId, type, role });

    if (!meetingId || !type) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 获取或创建会议信号记录
    const existingSignal = signalStore.get(meetingId) || {};

    // 对于 ICE candidates，使用数组存储
    if (type === 'ice-candidate') {
      const existingCandidates = existingSignal['ice-candidates'] || [];
      existingSignal['ice-candidates'] = [...existingCandidates, signal];
    } else {
      // Offer 和 Answer 直接存储
      existingSignal[type] = signal;
    }

    existingSignal[`${type}_role`] = role;
    existingSignal.updatedAt = new Date().toISOString();

    signalStore.set(meetingId, existingSignal);

    console.log('[信令服务器] 信号已保存:', { meetingId, type, hasCandidates: !!existingSignal['ice-candidates'] });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存信号失败:', error);
    return NextResponse.json(
      { error: '保存信号失败' },
      { status: 500 }
    );
  }
}

// GET: 获取 WebRTC 信号
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const meetingId = searchParams.get('meetingId');
    const lastKnownTime = searchParams.get('lastKnownTime');

    if (!meetingId) {
      return NextResponse.json(
        { error: '缺少 meetingId' },
        { status: 400 }
      );
    }

    const signal = signalStore.get(meetingId);

    if (!signal) {
      return NextResponse.json({ signal: null, hasUpdate: false });
    }

    // 检查是否有更新
    if (lastKnownTime && signal.updatedAt <= lastKnownTime) {
      return NextResponse.json({ signal: null, hasUpdate: false });
    }

    return NextResponse.json({
      signal,
      hasUpdate: true,
      updatedAt: signal.updatedAt,
    });
  } catch (error) {
    console.error('获取信号失败:', error);
    return NextResponse.json(
      { error: '获取信号失败' },
      { status: 500 }
    );
  }
}
