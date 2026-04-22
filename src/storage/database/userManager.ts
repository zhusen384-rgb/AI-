import { eq, and, inArray, SQL, desc, sql, count, ilike, or } from "drizzle-orm";
import bcrypt from 'bcrypt';
import { getDb } from "coze-coding-dev-sdk";
import { users, insertUserSchema, updateUserSchema, loginLogs } from "./shared/schema";
import type { User, InsertUser, UpdateUser, InsertLoginLog, LoginLog } from "./shared/schema";
import * as schema from "./shared/schema";

export type UserFilters = Partial<Pick<User, 'id' | 'tenantId' | 'username' | 'email' | 'name' | 'role' | 'status'>> & {
  search?: string;
};
export type SafeUser = Omit<User, 'password'>;

function buildUserConditions(filters: UserFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.id !== undefined) {
    conditions.push(eq(users.id, filters.id));
  }
  if (filters.tenantId !== undefined) {
    conditions.push(eq(users.tenantId, filters.tenantId));
  }
  if (filters.username !== undefined) {
    conditions.push(eq(users.username, filters.username));
  }
  if (filters.email !== undefined) {
    conditions.push(eq(users.email, filters.email));
  }
  if (filters.name !== undefined) {
    conditions.push(eq(users.name, filters.name));
  }
  if (filters.role !== undefined) {
    conditions.push(eq(users.role, filters.role));
  }
  if (filters.status !== undefined) {
    conditions.push(eq(users.status, filters.status));
  }
  if (filters.search !== undefined && filters.search.trim()) {
    const keyword = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(users.username, keyword),
        ilike(users.email, keyword),
        ilike(users.name, keyword)
      )!
    );
  }

  return conditions;
}

export function sanitizeUser(user: User): SafeUser {
  const { password, ...safeUser } = user;
  void password;
  return safeUser;
}

export function sanitizeUsers(items: User[]): SafeUser[] {
  return items.map(sanitizeUser);
}

export class UserManager {
  async createUser(data: InsertUser): Promise<User> {
    const db = await getDb(schema);
    const validated = insertUserSchema.parse(data);
    
    // 密码加密
    const hashedPassword = await bcrypt.hash(validated.password, 10);
    
    const [user] = await db.insert(users).values({
      ...validated,
      password: hashedPassword,
      loginCount: 0,
    }).returning();
    return user;
  }

  async getUsers(options: {
    skip?: number;
    limit?: number;
    filters?: UserFilters;
  } = {}): Promise<User[]> {
    const { skip = 0, limit = 100, filters = {} } = options;
    const db = await getDb(schema);
    const conditions = buildUserConditions(filters);

    return db.select().from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(skip)
      .orderBy(desc(users.createdAt));
  }

  async countUsers(filters: UserFilters = {}): Promise<number> {
    const db = await getDb(schema);
    const conditions = buildUserConditions(filters);

    const [result] = await db
      .select({ count: count() })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return Number(result?.count ?? 0);
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    const db = await getDb(schema);
    return db.select().from(users).where(inArray(users.id, ids));
  }

  async getUserById(id: string): Promise<User | null> {
    const db = await getDb(schema);
    const results = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return results[0] || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const db = await getDb(schema);
    const results = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return results[0] || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const db = await getDb(schema);
    const results = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return results[0] || null;
  }

  async updateUser(id: string, data: UpdateUser): Promise<User | null> {
    const db = await getDb(schema);
    const validated = updateUserSchema.parse(data);
    
    const [user] = await db
      .update(users)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || null;
  }

  async updatePassword(id: string, newPassword: string): Promise<User | null> {
    const db = await getDb(schema);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [user] = await db
      .update(users)
      .set({ 
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user || null;
  }

  async updateLastLogin(id: string): Promise<void> {
    const db = await getDb(schema);
    await db
      .update(users)
      .set({ 
        lastLoginAt: new Date(),
        loginCount: sql`${users.loginCount} + 1`,
      })
      .where(eq(users.id, id));
  }

  async updateLastLoginWithIp(id: string, ip: string): Promise<void> {
    const db = await getDb(schema);
    await db
      .update(users)
      .set({ 
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        loginCount: sql`${users.loginCount} + 1`,
      })
      .where(eq(users.id, id));
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await getDb(schema);
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getUserOptions(tenantId?: string): Promise<{ id: string; name: string; username: string }[]> {
    const db = await getDb(schema);
    const query = db.select({
      id: users.id,
      name: users.name,
      username: users.username,
    }).from(users);

    if (tenantId) {
      query.where(eq(users.tenantId, tenantId));
    }

    return query.orderBy(users.name);
  }

  // 记录登录尝试
  async logLoginAttempt(
    userId: string,
    status: 'success' | 'failed',
    failureReason?: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const db = await getDb(schema);
    const logData: InsertLoginLog = {
      userId,
      status,
      failureReason,
      ip,
      userAgent,
    };

    await db.insert(loginLogs).values(logData);
  }

  // 获取用户登录日志
  async getUserLoginLogs(userId: string, limit: number = 50): Promise<LoginLog[]> {
    const db = await getDb(schema);
    return db
      .select()
      .from(loginLogs)
      .where(eq(loginLogs.userId, userId))
      .orderBy(desc(loginLogs.loginTime))
      .limit(limit);
  }

  // 获取用户登录统计
  async getUserLoginStats(userId: string, days: number = 30): Promise<{
    total: number;
    success: number;
    failed: number;
    lastLogin: Date | null;
  }> {
    const db = await getDb(schema);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await db
      .select()
      .from(loginLogs)
      .where(
        and(
          eq(loginLogs.userId, userId),
          sql`${loginLogs.loginTime} >= ${since}`
        )
      );

    const stats = {
      total: logs.length,
      success: logs.filter(l => l.status === 'success').length,
      failed: logs.filter(l => l.status === 'failed').length,
      lastLogin: logs[0]?.loginTime || null,
    };

    return stats;
  }

  // 检查账号是否被锁定（连续失败 5 次）
  async isAccountLocked(userId: string, maxAttempts: number = 5, lockMinutes: number = 30): Promise<boolean> {
    const db = await getDb(schema);
    const since = new Date();
    since.setMinutes(since.getMinutes() - lockMinutes);

    const failedAttempts = await db
      .select()
      .from(loginLogs)
      .where(
        and(
          eq(loginLogs.userId, userId),
          eq(loginLogs.status, 'failed'),
          sql`${loginLogs.loginTime} >= ${since}`
        )
      );

    return failedAttempts.length >= maxAttempts;
  }

  // 锁定账号
  async lockAccount(userId: string, reason: string = '多次登录失败'): Promise<User | null> {
    void reason;
    return this.updateUser(userId, {
      status: 'locked',
      lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
    } as any);
  }

  // 解锁账号
  async unlockAccount(userId: string): Promise<User | null> {
    return this.updateUser(userId, {
      status: 'active',
      lockedUntil: null,
    } as any);
  }
}

export const userManager = new UserManager();
