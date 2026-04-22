/**
 * 密码强度检查器
 */
export interface PasswordStrengthResult {
  score: number; // 0-100
  level: 'weak' | 'medium' | 'strong' | 'very-strong';
  feedback: string[];
}

export class PasswordStrengthChecker {
  /**
   * 检查密码强度
   * @param password 密码
   * @returns 强度检查结果
   */
  static check(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    // 1. 长度检查
    if (password.length >= 8) {
      score += 20;
    } else {
      feedback.push('密码长度至少需要8位');
    }

    if (password.length >= 12) {
      score += 10;
    }

    // 2. 大小写字母检查
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      score += 15;
    } else {
      feedback.push('密码应包含大小写字母');
    }

    // 3. 数字检查
    if (/\d/.test(password)) {
      score += 15;
    } else {
      feedback.push('密码应包含数字');
    }

    // 4. 特殊字符检查
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 20;
    } else {
      feedback.push('密码应包含特殊字符');
    }

    // 5. 复杂性检查
    const uniqueChars = new Set(password).size;
    if (uniqueChars >= password.length * 0.6) {
      score += 20;
    } else {
      feedback.push('密码应包含更多不同的字符');
    }

    // 计算强度级别
    let level: PasswordStrengthResult['level'];
    if (score < 40) {
      level = 'weak';
    } else if (score < 60) {
      level = 'medium';
    } else if (score < 80) {
      level = 'strong';
    } else {
      level = 'very-strong';
    }

    return {
      score: Math.min(score, 100),
      level,
      feedback,
    };
  }

  /**
   * 检查密码是否满足最低要求
   * @param password 密码
   * @returns 是否满足
   */
  static isAcceptable(password: string): boolean {
    const result = this.check(password);
    return result.score >= 40; // 至少中等强度
  }

  /**
   * 获取密码强度建议
   * @param password 密码
   * @returns 建议文本
   */
  static getSuggestion(password: string): string {
    const result = this.check(password);
    
    if (result.level === 'weak') {
      return '密码强度较弱，建议：' + result.feedback.join('、');
    } else if (result.level === 'medium') {
      return '密码强度中等，可以更强：' + result.feedback.join('、');
    } else if (result.level === 'strong') {
      return '密码强度良好';
    } else {
      return '密码强度非常强';
    }
  }
}
