import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { generateToken, generateRefreshToken } from '@/lib/auth/jwt';
import { LoginLimiter } from '@/lib/login-limiter';
import { AuditLogger } from '@/storage/database/audit-logger';
import { getDb } from 'coze-coding-dev-sdk';
import { sql } from 'drizzle-orm';
import * as schema from '@/storage/database/shared/schema';

async function ensureTablesExist() {
  try {
    const db = await getDb(schema);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(128) NOT NULL,
        code VARCHAR(32) NOT NULL UNIQUE,
        phone VARCHAR(20),
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active' NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        username VARCHAR(64) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        name VARCHAR(128) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user' NOT NULL,
        status VARCHAR(20) DEFAULT 'active' NOT NULL,
        locked_until TIMESTAMP WITH TIME ZONE,
        avatar_url VARCHAR(512),
        login_count INTEGER DEFAULT 0 NOT NULL,
        last_login_ip VARCHAR(50),
        created_by VARCHAR(36),
        updated_by VARCHAR(36),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE,
        last_login_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB
      )
    `);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE`);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        ip VARCHAR(50),
        user_agent TEXT,
        login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        status VARCHAR(20) NOT NULL,
        failure_reason VARCHAR(255),
        location JSONB,
        device JSONB
      )
    `);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`);
    
    console.log('[数据库初始化] 表结构检查完成');
  } catch (error) {
    console.error('[数据库初始化] 创建表失败:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  console.log('========== 登录请求开始 ==========');
  console.log('[登录] 收到登录请求');
  
  try {
    const { username, password } = await req.json();
    console.log('[登录] 用户名:', username);
    console.log('[登录] 密码长度:', password?.length || 0);

    if (!username || !password) {
      console.log('[登录] 错误: 用户名或密码为空');
      return NextResponse.json(
        { error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const ip = forwardedFor.split(',')[0].trim() ||
              req.headers.get('x-real-ip')?.trim() ||
              'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    console.log('[登录] 客户端IP:', ip);

    try {
      console.log('[登录] 开始检查数据库表...');
      await ensureTablesExist();
      console.log('[登录] 数据库表检查完成');
    } catch (tableError) {
      console.error('[登录] 数据库表初始化失败:', tableError);
    }

    console.log('[登录] 检查登录限制...');
    const limitCheck = await LoginLimiter.canLogin(username, ip);
    console.log('[登录] 登录限制检查结果:', limitCheck);
    
    if (!limitCheck.allowed) {
      console.log('[登录] 登录被限制:', limitCheck.reason);
      try {
        const user = await userManager.getUserByUsername(username);
        if (user) {
          await LoginLimiter.logLoginAttempt(user.id, 'failed', ip, userAgent, limitCheck.reason);
          await AuditLogger.logLogin(user.id, user.tenantId, ip, userAgent, 'failed', limitCheck.reason);
        }
      } catch (e) {
        console.error('记录登录失败日志错误:', e);
      }
      
      return NextResponse.json(
        { error: limitCheck.reason },
        { status: 429 }
      );
    }

    console.log('[登录] 开始查找用户:', username);
    const user = await userManager.getUserByUsername(username);
    console.log('[登录] 用户查找结果:', user ? 'found' : 'not found');
    
    if (!user) {
      console.log('[登录] 用户不存在，返回错误');
      try {
        await AuditLogger.logLogin('unknown', '', ip, userAgent, 'failed', '用户不存在');
      } catch (e) {
        console.error('记录登录失败日志错误:', e);
      }
      
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    console.log('[登录] 开始验证密码...');
    const isValidPassword = await userManager.verifyPassword(user, password);
    console.log('[登录] 密码验证结果:', isValidPassword ? 'correct' : 'incorrect');
    
    if (!isValidPassword) {
      console.log('[登录] 密码错误，返回错误');
      try {
        await LoginLimiter.logLoginAttempt(user.id, 'failed', ip, userAgent, '密码错误');
        await AuditLogger.logLogin(user.id, user.tenantId, ip, userAgent, 'failed', '密码错误');
      } catch (e) {
        console.error('记录登录失败日志错误:', e);
      }
      
      const remainingAttempts = limitCheck.remainingAttempts || 5;
      
      return NextResponse.json(
        { 
          error: '用户名或密码错误',
          remainingAttempts: remainingAttempts > 0 ? remainingAttempts - 1 : 0,
        },
        { status: 401 }
      );
    }

    console.log('[登录] 用户状态:', user.status);
    if (user.status === 'locked') {
      console.log('[登录] 账号已锁定');
      try {
        await AuditLogger.logLogin(user.id, user.tenantId, ip, userAgent, 'failed', '账号已锁定');
      } catch (e) {
        console.error('记录日志错误:', e);
      }
      return NextResponse.json(
        { error: '账号已被锁定，请联系管理员' },
        { status: 403 }
      );
    }

    if (user.status !== 'active') {
      console.log('[登录] 账号未激活');
      try {
        await AuditLogger.logLogin(user.id, user.tenantId, ip, userAgent, 'failed', '账号未激活');
      } catch (e) {
        console.error('记录日志错误:', e);
      }
      return NextResponse.json(
        { error: '账号已被禁用' },
        { status: 403 }
      );
    }

    try {
      console.log('[登录] 更新最后登录时间...');
      await userManager.updateLastLoginWithIp(user.id, ip);
      console.log('[登录] 最后登录时间更新完成');
    } catch (e) {
      console.error('更新最后登录时间失败:', e);
    }
    
    try {
      await LoginLimiter.logLoginAttempt(user.id, 'success', ip, userAgent);
    } catch (e) {
      console.error('记录登录日志失败:', e);
    }
    
    try {
      await AuditLogger.logLogin(user.id, user.tenantId, ip, userAgent, 'success');
    } catch (e) {
      console.error('记录审计日志失败:', e);
    }

    console.log('[登录] 生成 JWT Token...');
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      username: user.username,
      name: user.name,
    });
    console.log('[登录] Token 生成完成');
    
    console.log('[登录] 生成 Refresh Token...');
    const refreshToken = generateRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      username: user.username,
      name: user.name,
    });
    console.log('[登录] Refresh Token 生成完成');

    console.log('[登录] 准备响应...');
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          tenantId: user.tenantId,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
        token,
        refreshToken,
      },
    });

    console.log('[登录] 设置 Cookie...');
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    response.cookies.set('refresh-token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    console.log('[登录] 登录成功！');
    console.log('========== 登录请求结束 ==========');
    return response;
  } catch (error) {
    console.error('[登录] 登录失败:', error);
    console.log('========== 登录请求异常结束 ==========');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '登录失败',
      },
      { status: 500 }
    );
  }
}
