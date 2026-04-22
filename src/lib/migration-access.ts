import type { NextRequest } from "next/server";

export interface MigrationAccessError {
  message: string;
  status: number;
}

export function validateMigrationAccess(request: NextRequest): MigrationAccessError | null {
  const configuredToken = process.env.MIGRATION_API_KEY?.trim();

  if (!configuredToken) {
    if (process.env.NODE_ENV === "production") {
      return {
        message: "生产环境未配置 MIGRATION_API_KEY，迁移接口已禁用",
        status: 503,
      };
    }

    return null;
  }

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader !== `Bearer ${configuredToken}`) {
    return {
      message: "迁移令牌无效",
      status: 403,
    };
  }

  return null;
}
