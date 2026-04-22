/**
 * 系统配置 API
 * 
 * GET /api/auto-greeting/settings - 获取配置
 * POST /api/auto-greeting/settings - 保存配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from 'coze-coding-dev-sdk';
import { ensureAutoGreetingRuntimeTables } from '@/lib/db/ensure-auto-greeting-runtime-tables';
import { isAutoGreetingAdmin, requireAutoGreetingAuth } from '@/lib/auto-greeting/auth';

// 配置表名
const CONFIG_TABLE = 'ag_system_config';

/**
 * 获取配置
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }
    if (!isAutoGreetingAdmin(authResult.auth.role)) {
      return NextResponse.json(
        { success: false, error: '仅管理员可查看系统配置' },
        { status: 403 }
      );
    }

    await ensureAutoGreetingRuntimeTables();
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category'); // general, risk, matching, conversation, etc.

    const client = await getClient();
    const params: string[] = [];
    const condition = category ? 'WHERE category = $1' : '';
    if (category) {
      params.push(category);
    }

    const result = await client.query(
      `SELECT * FROM ${CONFIG_TABLE} ${condition}`,
      params
    );

    client.release();

    // 转换为对象格式
    const config: Record<string, any> = {};
    result.rows.forEach((row: any) => {
      if (!config[row.category]) {
        config[row.category] = {};
      }
      try {
        config[row.category][row.key] = JSON.parse(row.value);
      } catch {
        config[row.category][row.key] = row.value;
      }
    });

    return NextResponse.json({
      success: true,
      data: config,
    });

  } catch (error) {
    console.error('获取配置失败:', error);
    return NextResponse.json(
      { success: false, error: '获取配置失败' },
      { status: 500 }
    );
  }
}

/**
 * 保存配置
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }
    if (!isAutoGreetingAdmin(authResult.auth.role)) {
      return NextResponse.json(
        { success: false, error: '仅管理员可修改系统配置' },
        { status: 403 }
      );
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await request.json();

    const client = await getClient();

    // 开启事务
    await client.query('BEGIN');

    try {
      // 保存各分类配置
      const categories = ['general', 'risk', 'matching', 'conversation', 'platforms', 'sensitiveWords', 'notification'];

      for (const category of categories) {
        const config = body[category];
        if (!config) continue;

        if (category === 'platforms' && Array.isArray(config)) {
          // 平台配置特殊处理
          for (const platform of config) {
            await client.query(`
              INSERT INTO ${CONFIG_TABLE} (category, key, value, created_by_id, updated_at)
              VALUES ('platforms', $1, $2, $3, NOW())
              ON CONFLICT (category, key) DO UPDATE SET value = $2, created_by_id = $3, updated_at = NOW()
            `, [platform.id, JSON.stringify(platform), authResult.auth.userId]);
          }
        } else if (category === 'sensitiveWords' && Array.isArray(config)) {
          // 敏感词特殊处理
          await client.query(`
            INSERT INTO ${CONFIG_TABLE} (category, key, value, created_by_id, updated_at)
            VALUES ('sensitiveWords', 'words', $1, $2, NOW())
            ON CONFLICT (category, key) DO UPDATE SET value = $1, created_by_id = $2, updated_at = NOW()
          `, [JSON.stringify(config), authResult.auth.userId]);
        } else if (typeof config === 'object') {
          // 其他对象配置
          for (const [key, value] of Object.entries(config)) {
            await client.query(`
              INSERT INTO ${CONFIG_TABLE} (category, key, value, created_by_id, updated_at)
              VALUES ($1, $2, $3, $4, NOW())
              ON CONFLICT (category, key) DO UPDATE SET value = $3, created_by_id = $4, updated_at = NOW()
            `, [category, key, JSON.stringify(value), authResult.auth.userId]);
          }
        }
      }

      await client.query('COMMIT');
      client.release();

      return NextResponse.json({
        success: true,
        data: { message: '配置保存成功' },
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('保存配置失败:', error);
    return NextResponse.json(
      { success: false, error: '保存配置失败' },
      { status: 500 }
    );
  }
}

/**
 * 重置配置
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAutoGreetingAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }
    if (!isAutoGreetingAdmin(authResult.auth.role)) {
      return NextResponse.json(
        { success: false, error: '仅管理员可重置系统配置' },
        { status: 403 }
      );
    }

    await ensureAutoGreetingRuntimeTables();
    const body = await request.json();
    const { category } = body;

    const client = await getClient();
    if (category) {
      await client.query(`DELETE FROM ${CONFIG_TABLE} WHERE category = $1`, [category]);
    } else {
      await client.query(`DELETE FROM ${CONFIG_TABLE}`);
    }

    client.release();

    return NextResponse.json({
      success: true,
      data: { message: '配置已重置' },
    });

  } catch (error) {
    console.error('重置配置失败:', error);
    return NextResponse.json(
      { success: false, error: '重置配置失败' },
      { status: 500 }
    );
  }
}
