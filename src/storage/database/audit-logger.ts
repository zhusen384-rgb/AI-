import { getDb } from 'coze-coding-dev-sdk';
import * as auditSchema from './shared/audit-schema';
import { auditLogs, type AuditLog } from './shared/audit-schema';
import { eq, desc } from 'drizzle-orm';
import { ensureAuditLogsTable } from './ensure-audit-logs-table';

/**
 * 审计日志管理器
 */
export class AuditLogger {
  /**
   * 记录审计日志
   * @param data 审计日志数据
   */
  static async log(data: {
    userId: string;
    tenantId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    changes?: unknown;
    ipAddress?: string;
    userAgent?: string;
    status?: 'success' | 'failed';
    errorMessage?: string;
  }): Promise<void> {
    await ensureAuditLogsTable();
    const db = await getDb(auditSchema);
    
    await db.insert(auditLogs).values({
      ...data,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 记录用户操作
   */
  static async logUserAction(
    userId: string,
    tenantId: string,
    action: string,
    resource: string,
    resourceId?: string,
    changes?: unknown,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action,
      resource,
      resourceId,
      changes,
      ipAddress,
      userAgent,
      status: 'success',
    });
  }

  /**
   * 记录登录事件
   */
  static async logLogin(
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string,
    status: 'success' | 'failed' = 'success',
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action: 'login',
      resource: 'auth',
      ipAddress,
      userAgent,
      status,
      errorMessage,
    });
  }

  /**
   * 记录登出事件
   */
  static async logLogout(
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      userId,
      tenantId,
      action: 'logout',
      resource: 'auth',
      ipAddress,
      userAgent,
    });
  }

  /**
   * 获取用户审计日志
   */
  static async getUserLogs(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AuditLog[]> {
    const db = await getDb(auditSchema);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return logs;
  }

  /**
   * 获取租户审计日志
   */
  static async getTenantLogs(
    tenantId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    const db = await getDb(auditSchema);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return logs;
  }
}
