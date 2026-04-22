import { NextRequest, NextResponse } from 'next/server';

interface InterviewRound {
  interviewers?: string[];
  date?: string;
  notes?: string;
  result?: string;
  score?: number;
  evaluation?: string;
}

// 简历解析的实际数据结构（来自简历解析API）
interface ParsedResumeData {
  workExperience?: Array<{
    company: string;
    position: string;
    duration: string;
    responsibilities: string[];
    achievements: string[];
  }>;
  education?: {
    school: string;
    major: string;
    degree: string;
    gpa?: string;
    scholarships?: string[];
  };
  skills?: Array<{
    name: string;
    level: string;
  }>;
  certificates?: Array<{
    name: string;
    level?: string;
    date?: string;
  }>;
  projects?: Array<{
    name: string;
    duration: string;
    role: string;
    tasks: string[];
    results: string[];
    technologies: string[];
  }>;
  conflictMarkers?: Array<{
    type: string;
    description: string;
  }>;
  matchAnalysis?: {
    matchedItems?: Array<{
      requirement: string;
      evidence: string;
    }>;
    unmatchedItems?: Array<{
      requirement: string;
      gap: string;
    }>;
    strengths?: string[];
    weaknesses?: string[];
    matchScore?: number;
  };
}

// 候选人中存储的简历解析数据结构
interface ResumeParsedData {
  content?: string;
  parsedData?: ParsedResumeData & {
    basicInfo?: {
      gender?: string;
      age?: number | string;
      location?: string;
      workYears?: number | string;
      currentCompany?: string;
      currentPosition?: string;
    };
  };
  parsedAt?: string;
  error?: string;
}

interface Candidate {
  id: number;
  name: string;
  gender?: string;
  age?: string;
  phone: string;
  email: string;
  position: string;
  source: string;
  createdAt: string;
  interviewStage: string;
  initialInterviewPassed: string | null;
  secondInterviewPassed: string | null;
  finalInterviewPassed: string | null;
  initialInterviewTime: string | null;
  secondInterviewTime: string | null;
  finalInterviewTime: string | null;
  initialInterviewEvaluation?: string | null;
  secondInterviewEvaluation?: string | null;
  finalInterviewEvaluation?: string | null;
  initialInterviewData?: InterviewRound | null;
  secondInterviewData?: InterviewRound | null;
  finalInterviewData?: InterviewRound | null;
  resumeParsedData: ResumeParsedData | null;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: { candidate: Candidate } = await request.json();
    const { candidate } = body;

    if (!candidate) {
      return NextResponse.json(
        { error: '缺少候选人数据' },
        { status: 400 }
      );
    }

    // 生成 HTML 内容
    const htmlContent = generateCandidateHTML(candidate);

    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('生成候选人PDF失败:', error);
    return NextResponse.json(
      { error: '生成PDF失败' },
      { status: 500 }
    );
  }
}

function generateCandidateHTML(candidate: Candidate): string {
  const { name, position, interviewStage, resumeParsedData } = candidate;
  const basicInfo = resumeParsedData?.parsedData?.basicInfo;
  
  // 获取面试阶段的文本
  const getStageText = (stage: string) => {
    const stageMap: Record<string, string> = {
      'pending': '待处理',
      'initial': '待初试',
      'second': '待复试',
      'final': '待终试',
      'offer': '待入职',
      'hired': '已入职',
      'rejected': '已拒绝',
      'rejectedOffer': '拒绝入职',
    };
    return stageMap[stage] || stage;
  };

  // 获取面试结果文本
  const getResultText = (result: string | null) => {
    if (!result) return '未面试';
    const resultMap: Record<string, string> = {
      'pass': '通过',
      'fail': '未通过',
      'pending': '待定',
    };
    return resultMap[result] || result;
  };

  // 解析简历数据 - 从 parsedData 中提取
  const parsedData = resumeParsedData?.parsedData || {};
  const workExp = parsedData.workExperience || [];
  const education = parsedData.education;
  const skills = parsedData.skills || [];
  const projects = parsedData.projects || [];
  const certificates = parsedData.certificates || [];
  const matchAnalysis = parsedData.matchAnalysis;
  const resumeContent = resumeParsedData?.content || '';
  const candidateGender = candidate.gender || basicInfo?.gender || '-';
  const candidateAge =
    candidate.age ||
    (basicInfo?.age !== undefined && basicInfo?.age !== null ? String(basicInfo.age) : '-') ||
    '-';
  const candidateLocation = basicInfo?.location || '-';
  const candidateWorkYears =
    basicInfo?.workYears !== undefined && basicInfo?.workYears !== null
      ? String(basicInfo.workYears)
      : '-';

  const renderInterviewRecord = (
    title: string,
    result: string | null,
    interviewTime: string | null,
    evaluation: string | null | undefined,
    interviewData?: InterviewRound | null
  ) => {
    if (!interviewData && !interviewTime && !evaluation && !result) {
      return '<div class="empty-state">暂无记录</div>';
    }

    return `
    <div class="interview-card">
      <div class="interview-header">
        <span>${title}</span>
        <span class="badge ${result === 'pass' ? 'badge-pass' : result === 'fail' ? 'badge-fail' : 'badge-pending'}">
          ${getResultText(result)}
        </span>
      </div>
      <div class="interview-detail">
        ${interviewTime ? `<div><strong>面试时间:</strong> ${interviewTime}</div>` : ''}
        ${interviewData?.interviewers ? `<div><strong>面试官:</strong> ${interviewData.interviewers.join(', ')}</div>` : ''}
        ${interviewData?.score ? `<div><strong>评分:</strong> ${interviewData.score}/100</div>` : ''}
        ${interviewData?.result ? `<div><strong>结果:</strong> ${interviewData.result}</div>` : ''}
        ${evaluation || interviewData?.evaluation ? `<div><strong>评价:</strong> ${evaluation || interviewData?.evaluation}</div>` : ''}
        ${interviewData?.notes ? `<div><strong>备注:</strong> ${interviewData.notes}</div>` : ''}
      </div>
    </div>
    `;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>候选人详情 - ${name}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Microsoft YaHei', 'SimHei', 'PingFang SC', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333333;
      background: #ffffff;
    }
    .container {
      padding: 10px;
    }
    h1 {
      font-size: 22px;
      color: #0066cc;
      margin-bottom: 15px;
      text-align: center;
      font-weight: bold;
    }
    h2 {
      font-size: 16px;
      color: #0066cc;
      margin-top: 25px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #cce6ff;
      page-break-after: avoid;
      font-weight: bold;
    }
    h3 {
      font-size: 14px;
      margin-top: 15px;
      margin-bottom: 8px;
      color: #0066cc;
      page-break-after: avoid;
      font-weight: bold;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 3px solid #0066cc;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .info-table td {
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      vertical-align: top;
    }
    .info-table td:first-child {
      background-color: #f5f9ff;
      font-weight: bold;
      color: #0066cc;
      width: 120px;
      white-space: nowrap;
    }
    .info-table td:last-child {
      background-color: #ffffff;
    }
    .section {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .section-item {
      margin-bottom: 12px;
      padding-left: 15px;
      border-left: 3px solid #0066cc;
    }
    .section-title {
      font-weight: bold;
      color: #333333;
      margin-bottom: 5px;
    }
    .section-content {
      color: #666666;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      margin-right: 5px;
    }
    .badge-pass {
      background-color: #d4edda;
      color: #155724;
    }
    .badge-fail {
      background-color: #f8d7da;
      color: #721c24;
    }
    .badge-pending {
      background-color: #fff3cd;
      color: #856404;
    }
    .badge-info {
      background-color: #d1ecf1;
      color: #0c5460;
    }
    .interview-process {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .process-step {
      flex: 1;
      text-align: center;
      padding: 8px;
      border-radius: 6px;
      margin-right: 8px;
      background-color: #f5f5f5;
      border: 1px solid #dddddd;
    }
    .process-step.active {
      background-color: #0066cc;
      color: #ffffff;
      border-color: #0066cc;
    }
    .process-step.passed {
      background-color: #28a745;
      color: #ffffff;
      border-color: #28a745;
    }
    .process-step.failed {
      background-color: #dc3545;
      color: #ffffff;
      border-color: #dc3545;
    }
    .interview-card {
      margin-bottom: 15px;
      padding: 12px;
      background-color: #f8f9fa;
      border-left: 4px solid #0066cc;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .interview-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-weight: bold;
    }
    .interview-detail {
      color: #666666;
      font-size: 11px;
      line-height: 1.5;
    }
    .skill-item {
      display: inline-block;
      padding: 4px 10px;
      margin: 3px;
      background-color: #e3f2fd;
      color: #1976d2;
      border-radius: 12px;
      font-size: 11px;
    }
    .notes-section {
      margin-top: 15px;
      padding: 12px;
      background-color: #fff9e6;
      border: 1px solid #ffe066;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .notes-title {
      font-weight: bold;
      color: #856404;
      margin-bottom: 8px;
    }
    .notes-content {
      color: #666666;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .empty-state {
      color: #999999;
      font-style: italic;
    }
    .match-score {
      font-size: 24px;
      font-weight: bold;
      color: #0066cc;
    }
    .match-item {
      margin-bottom: 8px;
      padding: 8px;
      background-color: #f8f9fa;
      border-radius: 4px;
    }
    .match-label {
      font-weight: bold;
      color: #333333;
      margin-bottom: 3px;
    }
    .match-value {
      color: #666666;
      font-size: 11px;
    }
    ul {
      margin-left: 20px;
      margin-top: 5px;
      margin-bottom: 5px;
    }
    li {
      margin-bottom: 3px;
      color: #666666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>候选人详情报告</h1>
      <div style="color: #666666; font-size: 11px;">
        生成时间: ${new Date().toLocaleString('zh-CN')}
      </div>
    </div>

    <!-- 基本信息 -->
    <h2>基本信息</h2>
    <table class="info-table">
      <tr>
        <td>姓名</td>
        <td>${name || '-'}</td>
        <td>应聘岗位</td>
        <td>${position || '-'}</td>
      </tr>
      <tr>
        <td>性别</td>
        <td>${candidateGender}</td>
        <td>年龄</td>
        <td>${candidateAge}</td>
      </tr>
      <tr>
        <td>手机号</td>
        <td>${candidate.phone || '-'}</td>
        <td>邮箱</td>
        <td>${candidate.email || '-'}</td>
      </tr>
      <tr>
        <td>来源</td>
        <td>${candidate.source || '-'}</td>
        <td>面试阶段</td>
        <td>
          <span class="badge badge-info">${getStageText(interviewStage)}</span>
        </td>
      </tr>
      <tr>
        <td>创建时间</td>
        <td>${candidate.createdAt || '-'}</td>
        <td>简历状态</td>
        <td>
          <span class="badge ${resumeParsedData ? 'badge-pass' : 'badge-fail'}">
            ${resumeParsedData ? '已解析' : '未解析'}
          </span>
        </td>
      </tr>
      <tr>
        <td>所在地</td>
        <td>${candidateLocation}</td>
        <td>工作年限</td>
        <td>${candidateWorkYears}</td>
      </tr>
    </table>

    <!-- 面试流程 -->
    <h2>面试流程</h2>
    <div class="interview-process">
      <div class="process-step ${interviewStage === 'pending' ? 'active' : ''}">
        <div>待处理</div>
      </div>
      <div class="process-step ${['initial', 'second', 'final', 'offer', 'hired', 'rejected'].includes(interviewStage) ? 'passed' : ''} ${candidate.initialInterviewPassed === 'fail' ? 'failed' : ''}">
        <div>初试</div>
        <div style="font-size: 10px; margin-top: 2px;">${getResultText(candidate.initialInterviewPassed)}</div>
      </div>
      <div class="process-step ${['second', 'final', 'offer', 'hired', 'rejected'].includes(interviewStage) ? 'passed' : ''} ${candidate.secondInterviewPassed === 'fail' ? 'failed' : ''}">
        <div>复试</div>
        <div style="font-size: 10px; margin-top: 2px;">${getResultText(candidate.secondInterviewPassed)}</div>
      </div>
      <div class="process-step ${['final', 'offer', 'hired', 'rejected'].includes(interviewStage) ? 'passed' : ''} ${candidate.finalInterviewPassed === 'fail' ? 'failed' : ''}">
        <div>终试</div>
        <div style="font-size: 10px; margin-top: 2px;">${getResultText(candidate.finalInterviewPassed)}</div>
      </div>
      <div class="process-step ${interviewStage === 'offer' || interviewStage === 'hired' ? 'passed' : ''}">
        <div>入职</div>
      </div>
    </div>

    <!-- 面试记录 -->
    <h2>面试记录</h2>
    
    <!-- 初试记录 -->
    ${renderInterviewRecord(
      '初试',
      candidate.initialInterviewPassed,
      candidate.initialInterviewTime,
      candidate.initialInterviewEvaluation,
      candidate.initialInterviewData
    )}

    <!-- 复试记录 -->
    ${renderInterviewRecord(
      '复试',
      candidate.secondInterviewPassed,
      candidate.secondInterviewTime,
      candidate.secondInterviewEvaluation,
      candidate.secondInterviewData
    )}

    <!-- 终试记录 -->
    ${renderInterviewRecord(
      '终试',
      candidate.finalInterviewPassed,
      candidate.finalInterviewTime,
      candidate.finalInterviewEvaluation,
      candidate.finalInterviewData
    )}

    <!-- 简历信息 -->
    ${resumeParsedData ? `
    <h2>简历信息</h2>

    ${resumeContent ? `
    <div class="section">
      <h3>原始简历内容</h3>
      <div class="section-content" style="white-space: pre-wrap; line-height: 1.8; color: #333333;">
        ${resumeContent}
      </div>
    </div>
    ` : ''}

    <!-- 工作经历 -->
    ${workExp && workExp.length > 0 ? `
    <div class="section">
      <h3>工作经历</h3>
      ${workExp.map(exp => `
        <div class="section-item">
          <div class="section-title">${exp.company} - ${exp.position}</div>
          <div class="section-content">
            <div style="font-size: 11px; color: #999999; margin-bottom: 5px;">${exp.duration}</div>
            ${exp.responsibilities && exp.responsibilities.length > 0 ? `
              <div style="margin-bottom: 5px;">
                <strong>核心职责:</strong>
                <ul>
                  ${exp.responsibilities.map(r => `<li>${r}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${exp.achievements && exp.achievements.length > 0 ? `
              <div>
                <strong>成果数据:</strong>
                <ul>
                  ${exp.achievements.map(a => `<li>${a}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- 教育背景 -->
    ${education ? `
    <div class="section">
      <h3>教育背景</h3>
      <div class="section-item">
        <div class="section-title">${education.school}</div>
        <div class="section-content">
          <div>${education.major} - ${education.degree}</div>
          ${education.gpa ? `<div style="font-size: 11px; color: #999999;">GPA: ${education.gpa}</div>` : ''}
          ${education.scholarships && education.scholarships.length > 0 ? `
            <div style="margin-top: 5px;">
              <strong>获奖情况:</strong>
              <ul>
                ${education.scholarships.map(s => `<li>${s}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- 技能专长 -->
    ${skills && skills.length > 0 ? `
    <div class="section">
      <h3>技能专长</h3>
      <div style="margin-bottom: 15px;">
        ${skills.map(skill => `
          <span class="skill-item">${skill.name} (${skill.level})</span>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- 项目经验 -->
    ${projects && projects.length > 0 ? `
    <div class="section">
      <h3>项目经验</h3>
      ${projects.map(project => `
        <div class="section-item">
          <div class="section-title">${project.name}</div>
          <div class="section-content">
            <div style="font-size: 11px; color: #999999; margin-bottom: 5px;">${project.duration} - ${project.role}</div>
            ${project.tasks && project.tasks.length > 0 ? `
              <div style="margin-bottom: 5px;">
                <strong>核心任务:</strong>
                <ul>
                  ${project.tasks.map(t => `<li>${t}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${project.results && project.results.length > 0 ? `
              <div style="margin-bottom: 5px;">
                <strong>关键成果:</strong>
                <ul>
                  ${project.results.map(r => `<li>${r}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            ${project.technologies && project.technologies.length > 0 ? `
              <div>
                <strong>技术栈:</strong>
                <span>${project.technologies.join(', ')}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- 证书资质 -->
    ${certificates && certificates.length > 0 ? `
    <div class="section">
      <h3>证书资质</h3>
      ${certificates.map(cert => `
        <div class="section-item">
          <div class="section-title">${cert.name}</div>
          <div class="section-content">
            ${cert.level ? `<span>等级: ${cert.level}</span>` : ''}
            ${cert.date ? `<span style="margin-left: 10px;">获取时间: ${cert.date}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- 岗位匹配分析 -->
    ${matchAnalysis ? `
    <div class="section">
      <h3>岗位匹配分析</h3>
      ${matchAnalysis.matchScore !== undefined ? `
        <div style="text-align: center; margin: 15px 0; padding: 20px; background-color: #f5f9ff; border-radius: 8px;">
          <div style="font-size: 14px; color: #666666; margin-bottom: 5px;">综合匹配度</div>
          <div class="match-score">${matchAnalysis.matchScore}%</div>
        </div>
      ` : ''}
      
      ${matchAnalysis.matchedItems && matchAnalysis.matchedItems.length > 0 ? `
        <div style="margin-bottom: 15px;">
          <h4 style="font-size: 13px; color: #28a745; margin-bottom: 10px;">✓ 匹配项</h4>
          ${matchAnalysis.matchedItems.map(item => `
            <div class="match-item" style="border-left: 3px solid #28a745;">
              <div class="match-label">${item.requirement}</div>
              <div class="match-value">${item.evidence}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${matchAnalysis.unmatchedItems && matchAnalysis.unmatchedItems.length > 0 ? `
        <div style="margin-bottom: 15px;">
          <h4 style="font-size: 13px; color: #dc3545; margin-bottom: 10px;">✗ 待补充项</h4>
          ${matchAnalysis.unmatchedItems.map(item => `
            <div class="match-item" style="border-left: 3px solid #dc3545;">
              <div class="match-label">${item.requirement}</div>
              <div class="match-value">${item.gap}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${matchAnalysis.strengths && matchAnalysis.strengths.length > 0 ? `
        <div style="margin-bottom: 15px;">
          <h4 style="font-size: 13px; color: #0066cc; margin-bottom: 10px;">★ 候选人优势</h4>
          <ul>
            ${matchAnalysis.strengths.map((s: any) => `<li>${typeof s === 'string' ? s : `${s.area || ''}${s.description ? ': ' + s.description : ''}${s.evidence ? ' (证据: ' + s.evidence + ')' : ''}`}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${matchAnalysis.weaknesses && matchAnalysis.weaknesses.length > 0 ? `
        <div style="margin-bottom: 15px;">
          <h4 style="font-size: 13px; color: #ffc107; margin-bottom: 10px;">! 潜在不足</h4>
          <ul>
            ${matchAnalysis.weaknesses.map((w: any) => `<li>${typeof w === 'string' ? w : `${w.area || ''}${w.description ? ': ' + w.description : ''}${w.gap ? ' (缺失: ' + w.gap + ')' : ''}`}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
    ` : ''}
    ` : '<div class="empty-state">暂无简历信息</div>'}

    <!-- 备注 -->
    ${candidate.notes ? `
    <div class="notes-section">
      <div class="notes-title">备注信息</div>
      <div class="notes-content">${candidate.notes}</div>
    </div>
    ` : ''}

  </div>
</body>
</html>`;
}
