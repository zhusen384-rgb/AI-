import { NextRequest, NextResponse } from 'next/server';
import { userManager, tenantManager } from '@/storage/database';
import { validateInitAccess } from '@/lib/init-access';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';

export async function POST(req: NextRequest) {
  try {
    const accessError = validateInitAccess(req);
    const shouldRevealPassword = process.env.NODE_ENV !== 'production';
    if (accessError) {
      return NextResponse.json(
        { success: false, error: accessError.message },
        { status: accessError.status }
      );
    }

    console.log('开始重置 admin 用户密码...');

    // 检查租户是否存在
    const tenant = await tenantManager.getTenantByCode('default');
    if (!tenant) {
      return NextResponse.json(
        { error: '默认租户不存在，请先运行 /api/init 初始化数据库' },
        { status: 400 }
      );
    }

    // 检查 admin 用户是否存在
    let admin = await userManager.getUserByUsername(DEFAULT_ADMIN_USERNAME);

    if (!admin) {
      console.log('admin 用户不存在，创建新用户...');
      
      // 创建 admin 用户
      admin = await userManager.createUser({
        username: DEFAULT_ADMIN_USERNAME,
        password: DEFAULT_ADMIN_PASSWORD,
        email: 'admin@example.com',
        name: '系统管理员',
        role: 'super_admin', // 创建超级管理员
        tenantId: tenant.id,
      });
      
      console.log('admin 用户创建成功');
    } else {
      console.log('admin 用户已存在，重置密码...');
      
      // 重置密码
      await userManager.updatePassword(admin.id, DEFAULT_ADMIN_PASSWORD);
      
      // 确保用户状态是 active 并且角色是 super_admin
      await userManager.updateUser(admin.id, { 
        status: 'active',
        role: 'super_admin' // 确保是超级管理员
      });
      
      // 重新获取用户信息
      admin = await userManager.getUserByUsername(DEFAULT_ADMIN_USERNAME);
      
      console.log('admin 用户密码已重置');
    }

    // 验证密码
    const isValid = await userManager.verifyPassword(admin!, DEFAULT_ADMIN_PASSWORD);
    
    console.log('密码验证结果:', isValid ? '成功' : '失败');

    return NextResponse.json({
      success: true,
      message: shouldRevealPassword
        ? `admin 用户密码已重置为 ${DEFAULT_ADMIN_PASSWORD}`
        : `admin 用户密码已重置，请立即登录并修改密码。`,
      data: {
        username: DEFAULT_ADMIN_USERNAME,
        ...(shouldRevealPassword ? { password: DEFAULT_ADMIN_PASSWORD } : {}),
        userId: admin!.id,
        verified: isValid,
      },
    });
  } catch (error) {
    console.error('重置密码失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '重置密码失败',
      },
      { status: 500 }
    );
  }
}
