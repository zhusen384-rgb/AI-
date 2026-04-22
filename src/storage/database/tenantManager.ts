import { eq, and, SQL, count } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import { tenants, insertTenantSchema } from "./shared/schema";
import type { Tenant, InsertTenant } from "./shared/schema";
import * as schema from "./shared/schema";

export class TenantManager {
  async createTenant(data: InsertTenant): Promise<Tenant> {
    const db = await getDb(schema);
    const validated = insertTenantSchema.parse(data);
    const [tenant] = await db.insert(tenants).values(validated).returning();
    return tenant;
  }

  async getTenants(options: {
    skip?: number;
    limit?: number;
    filters?: Partial<Pick<Tenant, 'id' | 'code' | 'status'>>;
  } = {}): Promise<Tenant[]> {
    const { skip = 0, limit = 100, filters = {} } = options;
    const db = await getDb(schema);

    const conditions: SQL[] = [];
    if (filters.id !== undefined) {
      conditions.push(eq(tenants.id, filters.id));
    }
    if (filters.code !== undefined) {
      conditions.push(eq(tenants.code, filters.code));
    }
    if (filters.status !== undefined) {
      conditions.push(eq(tenants.status, filters.status));
    }

    return db.select().from(tenants)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(skip);
  }

  async countTenants(
    filters: Partial<Pick<Tenant, 'id' | 'code' | 'status'>> = {}
  ): Promise<number> {
    const db = await getDb(schema);

    const conditions: SQL[] = [];
    if (filters.id !== undefined) {
      conditions.push(eq(tenants.id, filters.id));
    }
    if (filters.code !== undefined) {
      conditions.push(eq(tenants.code, filters.code));
    }
    if (filters.status !== undefined) {
      conditions.push(eq(tenants.status, filters.status));
    }

    const [result] = await db
      .select({ count: count() })
      .from(tenants)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return Number(result?.count ?? 0);
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    const db = await getDb(schema);
    const results = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return results[0] || null;
  }

  async getTenantByCode(code: string): Promise<Tenant | null> {
    const db = await getDb(schema);
    const results = await db.select().from(tenants).where(eq(tenants.code, code)).limit(1);
    return results[0] || null;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | null> {
    const db = await getDb(schema);
    const [tenant] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return tenant || null;
  }

  async deleteTenant(id: string): Promise<boolean> {
    const db = await getDb(schema);
    const result = await db.delete(tenants).where(eq(tenants.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getTenantOptions(): Promise<{ id: string; name: string; code: string }[]> {
    const db = await getDb(schema);
    return db.select({
      id: tenants.id,
      name: tenants.name,
      code: tenants.code,
    }).from(tenants).orderBy(tenants.name);
  }
}

export const tenantManager = new TenantManager();
