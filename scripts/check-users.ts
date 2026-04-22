import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '../src/storage/database/shared/schema';
import { users } from '../src/storage/database/shared/schema';
import bcrypt from 'bcrypt';

async function checkUsers() {
  console.log('检查数据库中的用户数据...\n');

  try {
    const db = await getDb(schema);

    // 获取所有用户
    const allUsers = await db.select().from(users);

    console.log(`总用户数: ${allUsers.length}`);

    if (allUsers.length === 0) {
      console.log('\n⚠️  数据库中没有用户！需要运行初始化脚本。');
      console.log('请访问: http://localhost:3000/api/init');
      return;
    }

    console.log('\n用户列表:');
    console.log('='.repeat(80));

    for (const user of allUsers) {
      console.log(`\n👤 用户: ${user.username}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   姓名: ${user.name}`);
      console.log(`   邮箱: ${user.email}`);
      console.log(`   角色: ${user.role}`);
      console.log(`   状态: ${user.status}`);
      console.log(`   租户ID: ${user.tenantId}`);
      console.log(`   创建时间: ${user.createdAt}`);
      console.log(`   最后登录: ${user.lastLoginAt || '从未登录'}`);
      console.log(`   登录次数: ${user.loginCount}`);
      console.log(`   密码哈希长度: ${user.password.length}`);

      // 测试密码验证
      const isValid = await bcrypt.compare('admin123456', user.password);
      console.log(`   密码 "admin123456" 验证: ${isValid ? '✅ 正确' : '❌ 错误'}`);

      // 尝试其他常见密码
      const testPasswords = ['admin', '123456', 'password'];
      for (const pwd of testPasswords) {
        const testValid = await bcrypt.compare(pwd, user.password);
        if (testValid) {
          console.log(`   ⚠️  发现有效密码: "${pwd}"`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ 检查完成！');

    // 检查 admin 用户是否存在
    const adminUser = allUsers.find(u => u.username === 'admin');
    if (!adminUser) {
      console.log('\n❌ 未找到 admin 用户！');
      console.log('请运行初始化脚本创建默认管理员。');
    } else {
      const isValid = await bcrypt.compare('admin123456', adminUser.password);
      if (isValid) {
        console.log('\n✅ admin 用户存在且密码正确！');
        console.log('   用户名: admin');
        console.log('   密码: admin123456');
      } else {
        console.log('\n❌ admin 用户存在但密码不匹配！');
        console.log('   可能需要重置密码。');
      }
    }

  } catch (error) {
    console.error('检查用户失败:', error);
  }
}

checkUsers();
