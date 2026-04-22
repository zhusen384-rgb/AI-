import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '../storage/database/shared/schema';
import { loginLogs, users } from '../storage/database/shared/schema';
import { eq, and, gte, sql, count } from 'drizzle-orm';

/**
 * 登录限制配置
 */
export interface LoginLimitConfig {
  maxAttempts: number; // 最大尝试次数
  windowMinutes: number; // 时间窗口（分钟）
  lockDurationMinutes: number; // 锁定时长（分钟）
}

const DEFAULT_CONFIG: LoginLimitConfig = {
  maxAttempts: 5,
  windowMinutes: 15,
  lockDurationMinutes: 30,
};

export class LoginLimiter {
  /**
   * 检查是否允许登录
   * @param username 用户名
   * @param ip IP地址
   * @param config 配置
   * @returns 是否允许登录
   */
  static async canLogin(
    username: string,
    ip: string,
    config: LoginLimitConfig = DEFAULT_CONFIG
  ): Promise<{ allowed: boolean; reason?: string; remainingAttempts?: number }> {
    const db = await getDb(schema);

    // 获取用户
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const user = userResult[0];
    if (!user) {
      // 用户不存在，允许继续（但会被后续的密码验证拒绝）
      return { allowed: true };
    }

    // 检查账号是否被锁定
    if (user.status === 'locked') {
      const lockedUntilValue = (user as typeof user & { lockedUntil?: Date | string | null }).lockedUntil;
      const lockedUntil = lockedUntilValue ? new Date(lockedUntilValue) : null;
      const now = new Date();

      if (!lockedUntil || Number.isNaN(lockedUntil.getTime()) || lockedUntil <= now) {
        await db
          .update(users)
          .set({ status: 'active', lockedUntil: null, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      } else {
        const remainingMinutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / (60 * 1000)));
        return {
          allowed: false,
          reason: `登录失败次数过多，账号已被锁定 ${remainingMinutes} 分钟`,
        };
      }
    }

    // 计算时间窗口的开始时间
    const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000);

    // 统计最近的失败登录次数
    const failedAttemptsResult = await db
      .select({ count: count() })
      .from(loginLogs)
      .where(
        and(
          eq(loginLogs.userId, user.id),
          eq(loginLogs.status, 'failed'),
          gte(loginLogs.loginTime, windowStart)
        )
      );

    const failedAttempts = failedAttemptsResult[0]?.count || 0;

    // 检查是否超过限制
    if (failedAttempts >= config.maxAttempts) {
      // 锁定账号
      await db
        .update(users)
        .set({
          status: 'locked',
          lockedUntil: new Date(Date.now() + config.lockDurationMinutes * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return {
        allowed: false,
        reason: `登录失败次数过多，账号已被锁定 ${config.lockDurationMinutes} 分钟`,
      };
    }

    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - failedAttempts,
    };
  }

  /**
   * 记录登录尝试
   * @param userId 用户ID
   * @param status 登录状态
   * @param ip IP地址
   * @param userAgent 用户代理
   * @param failureReason 失败原因
   */
  static async logLoginAttempt(
    userId: string,
    status: 'success' | 'failed',
    ip?: string,
    userAgent?: string,
    failureReason?: string
  ): Promise<void> {
    const db = await getDb(schema);

    await db.insert(loginLogs).values({
      userId,
      loginTime: new Date(),
      status,
      ip,
      userAgent,
      failureReason,
      location: null, // 可以后续实现IP定位
      device: null, // 可以后续实现设备识别
    });
  }

  /**
   * 获取用户登录失败统计
   * @param userId 用户ID
   * @param minutes 统计时间范围（分钟）
   * @returns 失败次数
   */
  static async getFailedAttempts(
    userId: string,
    minutes: number = 15
  ): Promise<number> {
    const db = await getDb(schema);
    const windowStart = new Date(Date.now() - minutes * 60 * 1000);

    const result = await db
      .select({ count: count() })
      .from(loginLogs)
      .where(
        and(
          eq(loginLogs.userId, userId),
          eq(loginLogs.status, 'failed'),
          gte(loginLogs.loginTime, windowStart)
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * 解锁账号
   * @param userId 用户ID
   */
  static async unlockAccount(userId: string): Promise<void> {
    const db = await getDb(schema);

    await db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
