// API 中间件配置 - 增加请求体大小限制
// 在 Next.js 15+ 中，使用 config 导出来配置 API Route

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 导出配置对象
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10gb', // 10GB 限制
    },
    // 设置外部正文解析器
    externalResolver: false,
  },
};

// 中间件函数（可选）
export async function middleware(request: NextRequest) {
  // 可以在这里添加额外的处理逻辑
  return NextResponse.next();
}
