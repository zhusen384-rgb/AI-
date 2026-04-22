import { pgTable, serial, text, timestamp, jsonb, varchar, index } from "drizzle-orm/pg-core";

// 审计日志表
export const auditLogs = pgTable("audit_logs", {
  id: serial().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  tenantId: text("tenant_id"),
  action: text("action").notNull(), // 操作类型：create, update, delete, login, logout, etc.
  resource: text("resource").notNull(), // 资源类型：user, tenant, interview, etc.
  resourceId: text("resource_id"), // 资源ID
  changes: jsonb("changes"), // 变更内容
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default('success'), // success, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("idx_audit_logs_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_audit_logs_tenant").using("btree", table.tenantId.asc().nullsLast().op("text_ops")),
  index("idx_audit_logs_action").using("btree", table.action.asc().nullsLast().op("text_ops")),
  index("idx_audit_logs_resource").using("btree", table.resource.asc().nullsLast().op("text_ops")),
  index("idx_audit_logs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
