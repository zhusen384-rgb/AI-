/**
 * 获取面试官系统岗位列表 API
 * 用于自动打招呼模块导入岗位
 * 
 * GET /api/auto-greeting/positions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { positions } from '@/storage/database/shared/schema';
import { desc, eq, or, like, and } from 'drizzle-orm';
import { authenticateApi } from '@/lib/auth-api';

/**
 * 获取面试官系统中的岗位列表
 * 用于自动打招呼模块导入/关联岗位
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApi(req);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { userId, role } = auth;
    const searchParams = req.nextUrl.searchParams;
    const keyword = searchParams.get('keyword');
    const status = searchParams.get('status');

    const db = await getDb(schema);

    // 构建查询条件
    const conditions = [];
    
    // 权限控制：普通用户只能看到全局岗位或自己创建的岗位
    if (role !== 'super_admin') {
      conditions.push(
        or(
          eq(positions.isGlobal, true),
          eq(positions.userId, userId as string)
        )
      );
    }
    
    // 状态筛选
    if (status && status !== 'all') {
      conditions.push(eq(positions.status, status));
    }
    
    // 关键词搜索
    if (keyword) {
      conditions.push(
        or(
          like(positions.title, `%${keyword}%`),
          like(positions.department, `%${keyword}%`)
        )
      );
    }

    // 查询岗位列表
    let query = db.select().from(positions);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const positionsList = await query.orderBy(desc(positions.createdAt)).limit(100);

    // 格式化返回数据
    const formattedPositions = positionsList.map(pos => ({
      id: pos.id,
      title: pos.title,
      department: pos.department,
      jobDescription: pos.jobDescription,
      education: pos.education,
      experience: pos.experience,
      status: pos.status,
      coreRequirements: pos.coreRequirements || [],
      softSkills: pos.softSkills || [],
      isGlobal: pos.isGlobal,
      createdAt: pos.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: formattedPositions,
    });

  } catch (error) {
    console.error('获取面试官系统岗位列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取岗位列表失败' },
      { status: 500 }
    );
  }
}
