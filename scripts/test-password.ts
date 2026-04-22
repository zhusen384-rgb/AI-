import bcrypt from 'bcrypt';
import { getDb } from '../node_modules/coze-coding-dev-sdk/dist/database';
import { eq } from 'drizzle-orm';
import * as schema from '../src/storage/database/shared/schema';

async function testPassword() {
  try {
    const db = await getDb(schema);

    // 获取 admin 用户
    const results = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'admin'))
      .limit(1);

    if (results.length === 0) {
      console.error('❌ 未找到 admin 用户');
      return;
    }

    const user = results[0];
    console.log('用户信息:', {
      username: user.username,
      name: user.name,
      role: user.role,
      status: user.status,
    });

    console.log('数据库密码哈希:', user.password);
    console.log('密码长度:', user.password.length);

    // 测试不同的密码
    const testPasswords = ['admin123456', 'admin123', 'admin', 'password', '123456'];
    
    console.log('\n开始测试密码验证...');
    for (const testPwd of testPasswords) {
      const isValid = await bcrypt.compare(testPwd, user.password);
      console.log(`  "${testPwd}" -> ${isValid ? '✅ 正确' : '❌ 错误'}`);
    }

    // 生成新的密码哈希
    console.log('\n生成新的 admin123456 哈希...');
    const newHash = await bcrypt.hash('admin123456', 10);
    console.log('新哈希:', newHash);
    console.log('新哈希长度:', newHash.length);

    // 测试新哈希
    const isNewHashValid = await bcrypt.compare('admin123456', newHash);
    console.log('新哈希验证:', isNewHashValid ? '✅ 正确' : '❌ 错误');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testPassword();
