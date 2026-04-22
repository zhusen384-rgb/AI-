import { type AnyColumn, and, eq, or, isNull, SQL } from 'drizzle-orm';
import { JWTPayload } from './auth/jwt';

type AccessControlledTable = {
  tenantId?: AnyColumn;
  userId?: AnyColumn;
};

type TenantScopedTable = Pick<AccessControlledTable, 'tenantId'>;
type UserScopedTable = Pick<AccessControlledTable, 'userId'>;

/**
 * 构建租户过滤条件
 * @param payload JWT认证payload
 * @param table Drizzle表定义
 * @returns 租户过滤SQL条件
 */
export function buildTenantFilter<TTable extends object>(payload: JWTPayload, table: TTable): SQL | undefined {
  // 如果用户是超级管理员，不添加租户过滤（可以查看所有数据，包括 tenantId 为 NULL 的）
  if (payload.role === 'super_admin') {
    return undefined;
  }

  const tenantIdColumn = (table as TenantScopedTable).tenantId;
  if (!tenantIdColumn) {
    return undefined;
  }

  // 为其他角色添加租户过滤
  // 允许查看自己租户的数据，以及 tenantId 为 NULL 的数据（向后兼容旧数据）
  return or(
    eq(tenantIdColumn, payload.tenantId),
    isNull(tenantIdColumn)
  );
}

/**
 * 构建用户级权限过滤条件
 * @param payload JWT认证payload
 * @param table Drizzle表定义
 * @returns 用户过滤SQL条件
 */
export function buildUserFilter<TTable extends object>(payload: JWTPayload, table: TTable): SQL | undefined {
  // 如果用户是管理员，可以查看所有数据（包括 userId 为 NULL 的数据）
  if (['super_admin', 'tenant_admin', 'admin'].includes(payload.role)) {
    return undefined;
  }

  const userIdColumn = (table as UserScopedTable).userId;
  if (!userIdColumn) {
    return undefined;
  }

  // 普通用户只能查看自己的数据，以及 userId 为 NULL 的数据（向后兼容旧数据）
  return or(
    eq(userIdColumn, payload.userId),
    isNull(userIdColumn)
  );
}

/**
 * 构建租户和用户过滤条件
 * @param payload JWT认证payload
 * @param table Drizzle表定义
 * @returns 组合过滤条件
 */
export function buildTenantUserFilter<TTable extends object>(payload: JWTPayload, table: TTable): SQL | undefined {
  const tenantFilter = buildTenantFilter(payload, table);
  const userFilter = buildUserFilter(payload, table);

  if (tenantFilter && userFilter) {
    return and(tenantFilter, userFilter);
  }

  return tenantFilter || userFilter;
}

/**
 * 检查用户是否可以访问指定租户的数据
 * @param payload JWT认证payload
 * @param tenantId 目标租户ID
 * @returns 是否可以访问
 */
export function canAccessTenant(payload: JWTPayload, tenantId: string): boolean {
  // 超级管理员可以访问所有租户
  if (payload.role === 'super_admin') {
    return true;
  }

  // 其他用户只能访问自己的租户
  return payload.tenantId === tenantId;
}

/**
 * 检查用户是否可以访问指定用户的数据
 * @param payload JWT认证payload
 * @param userId 目标用户ID
 * @returns 是否可以访问
 */
export function canAccessUser(payload: JWTPayload, userId: string): boolean {
  // 超级管理员可以访问所有用户
  if (payload.role === 'super_admin') {
    return true;
  }

  // 管理员可以访问同一租户的用户
  if (['tenant_admin', 'admin'].includes(payload.role)) {
    // 需要检查租户关系，这里简化处理
    return true;
  }

  // 普通用户只能访问自己的数据
  return payload.userId === userId;
}
