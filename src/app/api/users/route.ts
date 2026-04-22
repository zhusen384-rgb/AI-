import { NextRequest, NextResponse } from 'next/server';
import { userManager, tenantManager } from '@/storage/database';
import { AuthError, authenticateApi, assertCanAssignRole, canAccessTenant, isAdmin, isAuthError } from '@/lib/api-auth';
import { PasswordStrengthChecker } from '@/lib/password-strength';
import { AuditLogger } from '@/storage/database/audit-logger';
import { sanitizeUser, sanitizeUsers, type UserFilters } from '@/storage/database/userManager';

/**
 * GET /api/users
 * 获取用户列表
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await authenticateApi(req);

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // 权限检查：只有管理员可以查看用户列表
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    // 构建过滤条件
    const filters: UserFilters = {};
    
    // 只有超级管理员可以查看所有租户的用户
    if (payload.role !== 'super_admin') {
      filters.tenantId = payload.tenantId;
    }
    
    if (role) {
      filters.role = role;
    }
    
    if (status) {
      filters.status = status;
    }

    if (search) {
      filters.search = search;
    }

    // 获取用户列表
    const [users, total] = await Promise.all([
      userManager.getUsers({
        skip: (page - 1) * limit,
        limit,
        filters,
      }),
      userManager.countUsers(filters),
    ]);

    return NextResponse.json({
      success: true,
      data: sanitizeUsers(users),
      pagination: {
        page,
        limit,
        total,
      },
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);

    if (isAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取用户列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * 创建用户
 */
export async function POST(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以创建用户' },
        { status: 403 }
      );
    }

    // 获取创建用户的信息
    const { username, password, email, role, tenantCode, name } = await req.json();

    if (!username || !password || !email || !role || !name) {
      return NextResponse.json(
        { error: '用户名、姓名、密码、邮箱和角色不能为空' },
        { status: 400 }
      );
    }

    // 验证密码强度
    const passwordCheck = PasswordStrengthChecker.check(password);
    if (passwordCheck.score < 40) {
      return NextResponse.json(
        { 
          error: '密码强度不足',
          details: passwordCheck.feedback,
          suggestion: PasswordStrengthChecker.getSuggestion(password),
        },
        { status: 400 }
      );
    }

    // 验证角色
    if (!['admin', 'user', 'super_admin'].includes(role)) {
      return NextResponse.json(
        { error: '无效的角色' },
        { status: 400 }
      );
    }

    assertCanAssignRole(payload, role);

    // 获取租户 ID
    let tenantId;
    if (tenantCode) {
      // 查找指定租户
      const tenant = await tenantManager.getTenantByCode(tenantCode);
      if (!tenant) {
        return NextResponse.json(
          { error: '租户不存在' },
          { status: 404 }
        );
      }

      if (!canAccessTenant(payload, tenant.id)) {
        return NextResponse.json(
          { error: '无权在其他租户下创建用户' },
          { status: 403 }
        );
      }

      tenantId = tenant.id;
    } else {
      // 使用当前用户的租户 ID
      tenantId = payload.tenantId;
    }

    // 创建用户
    const newUser = await userManager.createUser({
      username,
      password,
      email,
      role,
      tenantId,
      name,
    });

    try {
      await AuditLogger.logUserAction(
        payload.userId,
        payload.tenantId,
        'create',
        'user',
        newUser.id,
        { username, name, email, role },
        req.headers.get('x-forwarded-for') || 'unknown',
        req.headers.get('user-agent') || 'unknown'
      );
    } catch (auditError) {
      console.error('记录创建用户审计日志失败:', auditError);
    }

    // 返回用户信息（不包含密码）
    return NextResponse.json({
      success: true,
      data: sanitizeUser(newUser),
    });
  } catch (error) {
    console.error('创建用户失败:', error);

    // 认证错误
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建用户失败',
      },
      { status: 500 }
    );
  }
}
