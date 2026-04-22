import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/auth-api";

export interface AutoGreetingAuthContext {
  userId: string;
  tenantId?: string;
  role?: string;
}

export function isAutoGreetingAdmin(role?: string): boolean {
  return role === "super_admin" || role === "admin" || role === "tenant_admin";
}

export function isAutoGreetingSuperAdmin(role?: string): boolean {
  return role === "super_admin";
}

interface QueryableClient {
  query: (
    query: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export async function requireAutoGreetingAuth(
  request: NextRequest
): Promise<
  | { success: true; auth: AutoGreetingAuthContext }
  | { success: false; response: NextResponse }
> {
  const payload = await authenticateApi(request);

  if (!payload.success || !payload.userId) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: payload.error || "未登录" },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    auth: {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    },
  };
}

export async function getAccessibleAutoGreetingJobIds(
  client: QueryableClient,
  auth: AutoGreetingAuthContext
): Promise<string[] | null> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return null;
  }

  const result = await client.query(
    `
      SELECT id
      FROM ag_job_positions
      WHERE created_by_id = $1
    `,
    [auth.userId]
  );

  return result.rows.map(row => String(row.id));
}

export async function canAccessAutoGreetingJob(
  client: QueryableClient,
  jobId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT id
      FROM ag_job_positions
      WHERE id = $1
        AND created_by_id = $2
      LIMIT 1
    `,
    [jobId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canManageAutoGreetingJob(
  client: QueryableClient,
  jobId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT id
      FROM ag_job_positions
      WHERE id = $1
        AND created_by_id = $2
      LIMIT 1
    `,
    [jobId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canAccessAutoGreetingTemplate(
  client: QueryableClient,
  templateId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT t.id
      FROM ag_greeting_templates t
      INNER JOIN ag_job_positions j ON j.id = t.job_id
      WHERE t.id = $1
        AND j.created_by_id = $2
      LIMIT 1
    `,
    [templateId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canManageAutoGreetingTemplate(
  client: QueryableClient,
  templateId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT t.id
      FROM ag_greeting_templates t
      INNER JOIN ag_job_positions j ON j.id = t.job_id
      WHERE t.id = $1
        AND j.created_by_id = $2
      LIMIT 1
    `,
    [templateId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canAccessAutoGreetingTask(
  client: QueryableClient,
  taskId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT id
      FROM ag_automation_tasks
      WHERE id = $1
        AND created_by_id = $2
      LIMIT 1
    `,
    [taskId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canAccessAutoGreetingAccount(
  client: QueryableClient,
  accountId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT id
      FROM ag_platform_accounts
      WHERE id = $1
        AND created_by_id = $2
      LIMIT 1
    `,
    [accountId, auth.userId]
  );

  return result.rows.length > 0;
}

export async function canManageAutoGreetingCommunication(
  client: QueryableClient,
  communicationId: string,
  auth: AutoGreetingAuthContext
): Promise<boolean> {
  if (isAutoGreetingSuperAdmin(auth.role)) {
    return true;
  }

  const result = await client.query(
    `
      SELECT c.id
      FROM ag_candidate_communications c
      INNER JOIN ag_job_positions j ON j.id = c.job_id
      WHERE c.id = $1
        AND j.created_by_id = $2
      LIMIT 1
    `,
    [communicationId, auth.userId]
  );

  return result.rows.length > 0;
}
