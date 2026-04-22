import { NextRequest, NextResponse } from 'next/server';
import { tenantManager, userManager } from '@/storage/database';
import type { Tenant, User } from '@/storage/database';
import { getDb } from 'coze-coding-dev-sdk';
import { sql } from 'drizzle-orm';
import { validateInitAccess } from '@/lib/init-access';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';

/**
 * 修复数据库表的序列（解决主键冲突问题）
 */
async function fixSequences() {
  try {
    const db = await getDb();
    
    // 修复 login_logs 表序列
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('login_logs', 'id'),
        COALESCE((SELECT MAX(id) FROM login_logs), 0) + 1,
        false
      )
    `);
    
    // 修复 audit_logs 表序列
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('audit_logs', 'id'),
        COALESCE((SELECT MAX(id) FROM audit_logs), 0) + 1,
        false
      )
    `);
    
    console.log('数据库序列修复完成');
  } catch (error) {
    console.error('修复序列失败（可忽略）:', error);
  }
}

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

    console.log('开始初始化数据库...');

    // 检查是否已存在默认租户
    const existingTenant = await tenantManager.getTenantByCode('default');
    let tenant: Tenant;

    if (!existingTenant) {
      console.log('创建默认租户...');
      tenant = await tenantManager.createTenant({
        name: '默认组织',
        code: 'default',
        email: 'admin@example.com',
        phone: '400-888-8888',
      });
      console.log(`默认租户创建成功，ID: ${tenant.id}`);
    } else {
      tenant = existingTenant;
      console.log(`默认租户已存在，ID: ${tenant.id}`);
    }

    // 检查是否已存在默认管理员
    const existingAdmin = await userManager.getUserByUsername(DEFAULT_ADMIN_USERNAME);
    let admin: User;

    if (!existingAdmin) {
      console.log('创建默认管理员用户...');
      admin = await userManager.createUser({
        username: DEFAULT_ADMIN_USERNAME,
        password: DEFAULT_ADMIN_PASSWORD,
        email: 'admin@example.com',
        name: '系统管理员',
        role: 'super_admin', // 创建超级管理员
        tenantId: tenant.id,
      });
      console.log(`默认管理员创建成功，ID: ${admin.id}`);
      console.log('默认登录信息:');
      console.log(`  用户名: ${DEFAULT_ADMIN_USERNAME}`);
      if (shouldRevealPassword) {
        console.log(`  密码: ${DEFAULT_ADMIN_PASSWORD}`);
      } else {
        console.log('  密码: [生产环境已隐藏]');
      }
      console.log('  角色: 超级管理员');
    } else {
      admin = existingAdmin;
      console.log('默认管理员已存在');
    }

    // 修复数据库序列（防止主键冲突）
    await fixSequences();

    console.log('数据库初始化完成！');
    
    return NextResponse.json({
      success: true,
      data: {
        tenant: { id: tenant.id, name: tenant.name },
        admin: { id: admin.id, username: admin.username },
      },
      message: shouldRevealPassword
        ? `数据库初始化成功。默认登录信息：用户名 ${DEFAULT_ADMIN_USERNAME}，密码 ${DEFAULT_ADMIN_PASSWORD}`
        : `数据库初始化成功。管理员账户 ${DEFAULT_ADMIN_USERNAME} 已可使用，请立即登录并修改密码。`,
    });
  } catch (error) {
    console.error('初始化数据库失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '初始化数据库失败',
      },
      { status: 500 }
    );
  }
}
