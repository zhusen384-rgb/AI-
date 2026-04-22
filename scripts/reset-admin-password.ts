import bcrypt from 'bcrypt';
import { getDb } from '../node_modules/coze-coding-dev-sdk/dist/database';
import { eq } from 'drizzle-orm';
import * as schema from '../src/storage/database/shared/schema';

async function resetPassword() {
  try {
    const db = await getDb(schema);

    // 生成新密码的哈希
    const hashedPassword = await bcrypt.hash('admin123456', 10);
    console.log('新密码哈希:', hashedPassword);

    // 更新 admin 用户密码
    await db
      .update(schema.users)
      .set({ 
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.username, 'admin'))
      .returning();

    console.log('✅ 密码重置成功！');
    console.log('用户名: admin');
    console.log('密码: admin123456');
  } catch (error) {
    console.error('❌ 密码重置失败:', error);
    process.exit(1);
  }
}

resetPassword();
