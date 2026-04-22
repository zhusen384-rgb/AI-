import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { validateMigrationAccess } from '@/lib/migration-access';

/**
 * 修复数据的 tenantId 和 userId
 * 为所有 tenantId 或 userId 为 NULL 的记录设置默认值
 * 
 * 使用方法：
 * POST /api/migrate-fix-data
 */
export async function POST(request: NextRequest) {
  try {
    const accessError = validateMigrationAccess(request);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    console.log('开始修复数据的 tenantId 和 userId...');

    const db = await getDb(schema);

    // 获取默认租户ID和管理员用户ID
    const defaultTenant = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.code, 'default'))
      .limit(1);

    const adminUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, 'admin'))
      .limit(1);

    if (defaultTenant.length === 0) {
      return NextResponse.json(
        { error: '未找到默认租户' },
        { status: 404 }
      );
    }

    const defaultTenantId = defaultTenant[0].id;
    
    // 获取超级管理员或管理员用户ID
    const superAdminUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, 'super_admin'))
      .limit(1);
    
    let adminUserId = null;
    if (superAdminUser.length > 0) {
      adminUserId = superAdminUser[0].id;
    } else {
      const adminUser = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, 'admin'))
        .limit(1);
      
      if (adminUser.length > 0) {
        adminUserId = adminUser[0].id;
      }
    }

    console.log(`默认租户ID: ${defaultTenantId}`);
    console.log(`超级管理员用户ID: ${adminUserId}`);

    const results = {
      fullAiInterviewConfigs: 0,
      fullAiInterviewResults: 0,
      interviewSessions: 0,
    };

    // 修复 fullAiInterviewConfigs 表
    try {
      const configsResult = await db.execute(`
        UPDATE full_ai_interview_configs 
        SET tenant_id = '${defaultTenantId}' 
        WHERE tenant_id IS NULL
      ` as any);
      
      if (adminUserId) {
        await db.execute(`
          UPDATE full_ai_interview_configs 
          SET user_id = '${adminUserId}' 
          WHERE user_id IS NULL
        ` as any);
      }
      
      const configs = await db
        .select()
        .from(schema.fullAiInterviewConfigs)
        .where(eq(schema.fullAiInterviewConfigs.tenantId, defaultTenantId));
      
      results.fullAiInterviewConfigs = configs.length;
      console.log(`✓ fullAiInterviewConfigs 修复完成，共 ${configs.length} 条记录`);
    } catch (error: any) {
      console.error('✗ fullAiInterviewConfigs 修复失败:', error);
    }

    // 修复 fullAiInterviewResults 表
    try {
      if (adminUserId) {
        await db.execute(`
          UPDATE full_ai_interview_results 
          SET user_id = '${adminUserId}' 
          WHERE user_id IS NULL
        ` as any);
      }
      
      const resultsList = await db
        .select()
        .from(schema.fullAiInterviewResults)
        .where(eq(schema.fullAiInterviewResults.tenantId, defaultTenantId));
      
      results.fullAiInterviewResults = resultsList.length;
      console.log(`✓ fullAiInterviewResults 修复完成，共 ${resultsList.length} 条记录`);
    } catch (error: any) {
      console.error('✗ fullAiInterviewResults 修复失败:', error);
    }

    // 修复 interviewSessions 表
    try {
      await db.execute(`
        UPDATE interview_sessions 
        SET tenant_id = '${defaultTenantId}' 
        WHERE tenant_id IS NULL
      ` as any);
      
      if (adminUserId) {
        await db.execute(`
          UPDATE interview_sessions 
          SET user_id = '${adminUserId}' 
          WHERE user_id IS NULL
        ` as any);
      }
      
      const sessions = await db
        .select()
        .from(schema.interviewSessions)
        .where(eq(schema.interviewSessions.tenantId, defaultTenantId));
      
      results.interviewSessions = sessions.length;
      console.log(`✓ interviewSessions 修复完成，共 ${sessions.length} 条记录`);
    } catch (error: any) {
      console.error('✗ interviewSessions 修复失败:', error);
    }

    console.log('✅ 数据修复完成！');

    return NextResponse.json({
      success: true,
      message: '数据修复成功完成',
      data: {
        defaultTenantId,
        adminUserId,
        ...results,
      }
    });
  } catch (error) {
    console.error('❌ 数据修复失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '数据修复失败',
      },
      { status: 500 }
    );
  }
}
