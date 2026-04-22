import { NextRequest, NextResponse } from 'next/server';
import { authenticateApi } from '@/lib/api-auth';

interface MatchAnalysis {
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
}

interface ParsedResume {
  matchAnalysis?: MatchAnalysis;
  conflictMarkers?: Array<{
    type: string;
    description: string;
  }>;
  skills?: Array<{
    name: string;
    level: string;
  }>;
}

interface Position {
  title: string;
  department: string;
}

interface ExportRequest {
  parsedData: ParsedResume;
  selectedPosition?: Position;
}

export async function POST(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    const body: ExportRequest = await request.json();
    const { parsedData, selectedPosition } = body;

    if (!parsedData) {
      return NextResponse.json(
        { error: '缺少解析数据' },
        { status: 400 }
      );
    }

    // 生成 HTML 内容 - 使用纯 hex/rgb 颜色，不使用 lab()
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>简历分析报告</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333333;
      background: #ffffff;
    }
    .container {
      padding: 20px;
    }
    h1 {
      font-size: 28px;
      color: #0066cc;
      margin-bottom: 10px;
      text-align: center;
    }
    h2 {
      font-size: 20px;
      color: #0066cc;
      margin-top: 30px;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #cce6ff;
      page-break-after: avoid;
    }
    h3 {
      font-size: 16px;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .match-score {
      display: inline-block;
      background: #e6f3ff;
      color: #0066cc;
      padding: 5px 10px;
      border-radius: 4px;
      margin-left: 10px;
    }
    .section {
      page-break-inside: avoid;
    }
    .strength-item, .weakness-item, .matched-item, .unmatched-item, .conflict-item {
      margin-bottom: 10px;
      padding: 12px;
      border-left: 4px solid;
      border-radius: 4px;
      background: #f9f9f9;
      page-break-inside: avoid;
    }
    .strength-item {
      border-color: #52c41a;
      background: #f6ffed;
    }
    .weakness-item {
      border-color: #fa8c16;
      background: #fff7e6;
    }
    .matched-item {
      border-color: #0066cc;
      background: #e6f3ff;
    }
    .unmatched-item {
      border-color: #ff4d4f;
      background: #fff1f0;
    }
    .conflict-item {
      border-color: #fa8c16;
      background: #fff7e6;
    }
    .conflict-type {
      display: inline-block;
      background: #ffe7ba;
      color: #d48806;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 12px;
      margin-right: 8px;
    }
    .skill-tag {
      display: inline-block;
      background: #e6f3ff;
      color: #0066cc;
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid #69b1ff;
      margin: 4px;
      page-break-inside: avoid;
    }
    .footer {
      text-align: center;
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e8e8e8;
      color: #999999;
      font-size: 12px;
    }
    .requirement {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .evidence {
      color: #666666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>简历分析报告</h1>
      <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
      ${selectedPosition ? `<p>目标岗位：${selectedPosition.title} - ${selectedPosition.department}</p>` : ''}
    </div>

    ${parsedData.matchAnalysis ? `
    <div class="section">
      <h2>
        岗位匹配分析
        ${parsedData.matchAnalysis.matchScore !== undefined ? `<span class="match-score">匹配度：${parsedData.matchAnalysis.matchScore}%</span>` : ''}
      </h2>

      ${parsedData.matchAnalysis.strengths && parsedData.matchAnalysis.strengths.length > 0 ? `
      <h3 style="color: #52c41a;">候选人优势</h3>
      ${parsedData.matchAnalysis.strengths.map((strength: any) => `
        <div class="strength-item">${typeof strength === 'string' ? strength : `${strength.area || ''}${strength.description ? ': ' + strength.description : ''}${strength.evidence ? ' (证据: ' + strength.evidence + ')' : ''}`}</div>
      `).join('')}
      ` : ''}

      ${parsedData.matchAnalysis.weaknesses && parsedData.matchAnalysis.weaknesses.length > 0 ? `
      <h3 style="color: #fa8c16;">潜在不足</h3>
      ${parsedData.matchAnalysis.weaknesses.map((weakness: any) => `
        <div class="weakness-item">${typeof weakness === 'string' ? weakness : `${weakness.area || ''}${weakness.description ? ': ' + weakness.description : ''}${weakness.gap ? ' (缺失: ' + weakness.gap + ')' : ''}`}</div>
      `).join('')}
      ` : ''}

      ${parsedData.matchAnalysis.matchedItems && parsedData.matchAnalysis.matchedItems.length > 0 ? `
      <h3 style="color: #0066cc;">已匹配项</h3>
      ${parsedData.matchAnalysis.matchedItems.map(item => `
        <div class="matched-item">
          <div class="requirement" style="color: #0066cc;">${item.requirement}</div>
          <div class="evidence">${item.evidence}</div>
        </div>
      `).join('')}
      ` : ''}

      ${parsedData.matchAnalysis.unmatchedItems && parsedData.matchAnalysis.unmatchedItems.length > 0 ? `
      <h3 style="color: #ff4d4f;">未匹配项</h3>
      ${parsedData.matchAnalysis.unmatchedItems.map(item => `
        <div class="unmatched-item">
          <div class="requirement" style="color: #ff4d4f;">${item.requirement}</div>
          <div class="evidence">${item.gap}</div>
        </div>
      `).join('')}
      ` : ''}
    </div>
    ` : ''}

    ${parsedData.conflictMarkers && parsedData.conflictMarkers.length > 0 ? `
    <div class="section">
      <h2 style="color: #d48806; border-color: #ffe7ba;">冲突信息标记</h2>
      ${parsedData.conflictMarkers.map(marker => `
        <div class="conflict-item">
          <span class="conflict-type">${marker.type}</span>
          ${marker.description}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${parsedData.skills && parsedData.skills.length > 0 ? `
    <div class="section">
      <h2>技能特长</h2>
      <div>
        ${parsedData.skills.map(skill => `
          <span class="skill-tag">${skill.name} (${skill.level})</span>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <strong>本报告由 AI 智能面试系统自动生成</strong>
      <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
    </div>
  </div>
</body>
</html>`;

    // 返回 HTML 内容
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="resume-report.html"`,
      },
    });
  } catch (error) {
    console.error('生成报告失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: '生成报告失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
