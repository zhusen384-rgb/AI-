/**
 * 匹配引擎 - 核心匹配逻辑
 * 
 * 负责候选人与岗位的智能匹配，包括：
 * - 技能匹配
 * - 经验匹配
 * - 地域匹配
 * - 薪资匹配
 * - 意向匹配
 */

import type {
  JobPosition,
  CandidateProfile,
  MatchResult,
  MatchFactors,
  Platform,
} from './types';
import {
  SKILL_SYNONYMS,
  WELL_KNOWN_COMPANIES,
  SALARY_RANGES,
} from './constants';

/**
 * 主匹配函数
 */
export function matchCandidate(
  candidate: CandidateProfile,
  job: JobPosition
): MatchResult {
  const factors: MatchFactors = {
    skills: calculateSkillMatch(candidate, job),
    experience: calculateExperienceMatch(candidate, job),
    location: calculateLocationMatch(candidate, job),
    salary: calculateSalaryMatch(candidate, job),
    intent: calculateIntentMatch(candidate),
  };

  // 加权计算总分
  const weights = {
    skills: 0.35,
    experience: 0.25,
    location: 0.15,
    salary: 0.15,
    intent: 0.10,
  };

  const totalScore =
    factors.skills * weights.skills +
    factors.experience * weights.experience +
    factors.location * weights.location +
    factors.salary * weights.salary +
    factors.intent * weights.intent;

  // 判断是否匹配
  const matched = totalScore >= job.matchThreshold;

  // 生成匹配原因
  const reasons = generateMatchReasons(factors, job.matchThreshold);

  // 生成推荐话术变量
  const templateVariables = generateTemplateVariables(candidate, job, factors);

  return {
    matched,
    score: Math.round(totalScore * 100) / 100,
    factors,
    reasons,
    templateVariables,
  };
}

/**
 * 技能匹配计算
 */
function calculateSkillMatch(
  candidate: CandidateProfile,
  job: JobPosition
): number {
  const jobSkills = job.requirements.skills || [];
  if (jobSkills.length === 0) return 100;

  // 扩展技能列表（包含同义词）
  const expandedJobSkills = new Set<string>();
  jobSkills.forEach(skill => {
    expandedJobSkills.add(skill.toLowerCase());
    const synonyms = SKILL_SYNONYMS[skill] || [];
    synonyms.forEach(s => expandedJobSkills.add(s.toLowerCase()));
  });

  // 候选人技能
  const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase());

  // 计算匹配数
  let matchCount = 0;
  candidateSkills.forEach(skill => {
    if (expandedJobSkills.has(skill)) {
      matchCount++;
    }
  });

  // 匹配率
  const matchRate = matchCount / jobSkills.length;
  
  // 如果候选人技能数量远超过要求，给予加分
  const skillBonus = Math.min(candidateSkills.length / jobSkills.length, 1.5) * 10;
  
  return Math.min(100, matchRate * 100 + skillBonus);
}

/**
 * 经验匹配计算
 */
function calculateExperienceMatch(
  candidate: CandidateProfile,
  job: JobPosition
): number {
  const requiredYears = job.requirements.experience?.min || 0;
  const candidateYears = candidate.workYears || candidate.experience || 0;

  if (requiredYears === 0) return 100;

  // 经验年限匹配
  let yearsScore = 100;
  if (candidateYears < requiredYears) {
    // 经验不足，按比例扣分
    yearsScore = (candidateYears / requiredYears) * 80;
  } else if (candidateYears > requiredYears * 2) {
    // 经验过多，轻微扣分（可能资历过高）
    yearsScore = Math.max(70, 100 - (candidateYears - requiredYears * 2) * 5);
  }

  // 公司背景加分
  let companyBonus = 0;
  const companies = candidate.workHistory || [];
  companies.forEach((company: { companyName: string }) => {
    if (WELL_KNOWN_COMPANIES.some((known: string) => 
      company.companyName?.toLowerCase().includes(known.toLowerCase())
    )) {
      companyBonus += 10;
    }
  });

  return Math.min(100, yearsScore + companyBonus);
}

/**
 * 地域匹配计算
 */
function calculateLocationMatch(
  candidate: CandidateProfile,
  job: JobPosition
): number {
  if (!job.location) return 100;

  const jobLocation = job.location.toLowerCase();
  const candidateLocation = (candidate.location || '').toLowerCase();

  // 完全匹配
  if (candidateLocation.includes(jobLocation) || jobLocation.includes(candidateLocation)) {
    return 100;
  }

  // 同城匹配（提取城市名）
  const jobCity = extractCity(jobLocation);
  const candidateCity = extractCity(candidateLocation);
  
  if (jobCity && candidateCity && jobCity === candidateCity) {
    return 100;
  }

  // 异地但愿意
  if (candidate.willingToRelocate) {
    return 60;
  }

  // 异地
  return 30;
}

/**
 * 薪资匹配计算
 */
function calculateSalaryMatch(
  candidate: CandidateProfile,
  job: JobPosition
): number {
  const jobMin = job.salaryMin || 0;
  const jobMax = job.salaryMax || 0;
  
  // 处理期望薪资（可能是对象或字符串）
  let candidateMin = 0;
  let candidateMax = 0;
  if (candidate.expectedSalary) {
    if (typeof candidate.expectedSalary === 'object') {
      candidateMin = candidate.expectedSalary.min || 0;
      candidateMax = candidate.expectedSalary.max || 0;
    }
    // 如果是字符串，尝试解析
  }

  // 如果没有薪资要求，默认匹配
  if (candidateMin === 0 && candidateMax === 0) return 80;
  if (jobMin === 0 && jobMax === 0) return 80;

  // 计算区间重叠
  const overlap = calculateOverlap(
    jobMin, jobMax,
    candidateMin, candidateMax
  );

  if (overlap <= 0) {
    // 无重叠，根据差距扣分
    const gap = candidateMin > jobMax
      ? (candidateMin - jobMax) / jobMax
      : (jobMin - candidateMax) / candidateMax;
    return Math.max(0, 50 - gap * 50);
  }

  // 有重叠，根据重叠比例打分
  const overlapRatio = overlap / (jobMax - jobMin || 1);
  return Math.min(100, 60 + overlapRatio * 40);
}

/**
 * 意向匹配计算
 */
function calculateIntentMatch(candidate: CandidateProfile): number {
  const intent = candidate.intentLevel;
  
  const intentScores: Record<string, number> = {
    'high': 100,
    'medium': 70,
    'low': 40,
    'unknown': 50,
  };

  return intentScores[intent || 'unknown'] || 50;
}

/**
 * 辅助函数：提取城市名
 */
function extractCity(location: string): string | null {
  const cities = [
    '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京',
    '苏州', '西安', '重庆', '天津', '长沙', '郑州', '青岛', '无锡',
    '宁波', '厦门', '福州', '济南', '合肥', '哈尔滨', '沈阳', '大连',
  ];

  for (const city of cities) {
    if (location.includes(city)) {
      return city;
    }
  }

  return null;
}

/**
 * 辅助函数：计算区间重叠
 */
function calculateOverlap(
  min1: number, max1: number,
  min2: number, max2: number
): number {
  const overlap = Math.min(max1, max2) - Math.max(min1, min2);
  return Math.max(0, overlap);
}

/**
 * 生成匹配原因
 */
function generateMatchReasons(
  factors: MatchFactors,
  threshold: number
): string[] {
  const reasons: string[] = [];

  if (factors.skills >= 80) {
    reasons.push('技能匹配度高');
  } else if (factors.skills >= 60) {
    reasons.push('技能基本匹配');
  }

  if (factors.experience >= 80) {
    reasons.push('经验符合要求');
  } else if (factors.experience >= 60) {
    reasons.push('经验基本符合');
  }

  if (factors.location >= 80) {
    reasons.push('地理位置匹配');
  }

  if (factors.salary >= 70) {
    reasons.push('薪资期望合理');
  }

  if (factors.intent >= 80) {
    reasons.push('求职意向强烈');
  }

  return reasons;
}

/**
 * 生成话术模板变量
 */
function generateTemplateVariables(
  candidate: CandidateProfile,
  job: JobPosition,
  factors: MatchFactors
): Record<string, string> {
  return {
    candidateName: candidate.name || '候选人',
    candidateTitle: candidate.title || candidate.currentPosition || '工程师',
    candidateCompany: candidate.currentCompany || '',
    candidateYears: String(candidate.workYears || candidate.experience || 0),
    candidateLocation: candidate.location || candidate.currentCity || '',
    candidateSkills: (candidate.skills || []).slice(0, 3).join('、'),
    
    jobTitle: job.name,
    jobDepartment: job.department || '',
    jobLocation: job.location,
    jobSalaryRange: `${job.salaryMin || 0}-${job.salaryMax || 0}K`,
    jobHighlights: (job.highlights || []).slice(0, 3).join('、'),
    
    matchScore: String(Math.round(factors.skills)),
    matchReason: factors.skills >= 80 ? '技能高度匹配' : '技能基本匹配',
  };
}

/**
 * 批量匹配
 */
export function batchMatch(
  candidates: CandidateProfile[],
  job: JobPosition
): Array<{ candidate: CandidateProfile; result: MatchResult }> {
  return candidates
    .map(candidate => ({
      candidate,
      result: matchCandidate(candidate, job),
    }))
    .filter(item => item.result.matched)
    .sort((a, b) => b.result.score - a.result.score);
}

/**
 * 根据平台获取适合的打招呼时段
 */
export function getGreetingTimeSlots(platform: Platform): Array<{
  start: string;
  end: string;
  priority: number;
}> {
  const timeSlots: Record<Platform, Array<{ start: string; end: string; priority: number }>> = {
    boss: [
      { start: '09:00', end: '10:30', priority: 90 },
      { start: '14:00', end: '15:30', priority: 80 },
      { start: '19:00', end: '20:30', priority: 70 },
    ],
    liepin: [
      { start: '09:30', end: '11:00', priority: 85 },
      { start: '14:30', end: '16:00', priority: 75 },
      { start: '20:00', end: '21:30', priority: 65 },
    ],
    '51job': [
      { start: '09:00', end: '10:00', priority: 80 },
      { start: '13:30', end: '15:00', priority: 70 },
    ],
    zhilian: [
      { start: '09:30', end: '11:00', priority: 85 },
      { start: '14:00', end: '16:00', priority: 75 },
    ],
  };

  return timeSlots[platform] || timeSlots.boss;
}
