import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { authenticateApi } from '@/lib/api-auth';

interface ParsedData {
  matchAnalysis?: {
    matchScore?: number;
    matchedItems?: Array<{ requirement: string; evidence: string }>;
    unmatchedItems?: Array<{ requirement: string; gap: string }>;
    strengths?: any[];
    weaknesses?: any[];
  };
  conflictMarkers?: Array<{ type: string; description: string }>;
  workExperience?: any[];
  education?: any;
  skills?: Array<{ name: string; level: string }>;
  projects?: any[];
  certificates?: any[];
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    age?: number;
    gender?: string;
    location?: string;
    workYears?: number;
    currentCompany?: string;
    currentPosition?: string;
    education?: string;
    major?: string;
    school?: string;
  };
}

interface ExportFile {
  fileName: string;
  parsedData?: ParsedData;
  selectedPositionId?: string;
  selectedPositionName?: string;  // 新增岗位名称
}

interface ExportRequest {
  files: ExportFile[];
}

export async function POST(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    const body: ExportRequest = await request.json();
    const { files } = body;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: '没有可导出的数据' },
        { status: 400 }
      );
    }

    // 准备Excel数据
    const excelData = files.map((file, index) => {
      const data = file.parsedData;
      const basicInfo = data?.basicInfo || {};
      const matchAnalysis = data?.matchAnalysis;

      return {
        '序号': index + 1,
        '文件名': file.fileName,
        '姓名': basicInfo.name || '',
        '手机号': basicInfo.phone || '',
        '邮箱': basicInfo.email || '',
        '年龄': basicInfo.age || '',
        '性别': basicInfo.gender || '',
        '现居地': basicInfo.location || '',
        '工作年限': basicInfo.workYears || '',
        '当前公司': basicInfo.currentCompany || '',
        '当前职位': basicInfo.currentPosition || '',
        '最高学历': basicInfo.education || data?.education?.degree || '',
        '专业': basicInfo.major || data?.education?.major || '',
        '毕业院校': basicInfo.school || data?.education?.school || '',
        '技能特长': data?.skills?.map(s => `${s.name}(${s.level})`).join('、') || '',
        '应聘岗位': file.selectedPositionName || '',
        '匹配度分数': matchAnalysis?.matchScore || '',
        '已匹配项': matchAnalysis?.matchedItems?.map(item => 
          `${item.requirement}: ${item.evidence}`
        ).join('；') || '',
        '未匹配项': matchAnalysis?.unmatchedItems?.map(item => 
          `${item.requirement}: ${item.gap}`
        ).join('；') || '',
        '候选人优势': matchAnalysis?.strengths?.map((s: any) => 
          typeof s === 'string' ? s : `${s.area}: ${s.description || ''}`
        ).join('；') || '',
        '潜在不足': matchAnalysis?.weaknesses?.map((w: any) =>
          typeof w === 'string' ? w : `${w.area}: ${w.description || ''}`
        ).join('；') || '',
        '冲突信息': data?.conflictMarkers?.map(m => `${m.type}: ${m.description}`).join('；') || '',
        '导出时间': new Date().toLocaleString('zh-CN'),
      };
    });

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    
    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 设置列宽
    const columnWidths = [
      { wch: 6 },   // 序号
      { wch: 30 },  // 文件名
      { wch: 12 },  // 姓名
      { wch: 15 },  // 手机号
      { wch: 25 },  // 邮箱
      { wch: 6 },   // 年龄
      { wch: 6 },   // 性别
      { wch: 20 },  // 现居地
      { wch: 10 },  // 工作年限
      { wch: 25 },  // 当前公司
      { wch: 20 },  // 当前职位
      { wch: 10 },  // 最高学历
      { wch: 15 },  // 专业
      { wch: 20 },  // 毕业院校
      { wch: 50 },  // 技能特长
      { wch: 15 },  // 应聘岗位
      { wch: 10 },  // 匹配度分数
      { wch: 60 },  // 已匹配项
      { wch: 60 },  // 未匹配项
      { wch: 50 },  // 候选人优势
      { wch: 50 },  // 潜在不足
      { wch: 50 },  // 冲突信息
      { wch: 20 },  // 导出时间
    ];
    worksheet['!cols'] = columnWidths;

    // 添加工作表到工作簿
    XLSX.utils.book_append_sheet(workbook, worksheet, '简历解析结果');

    // 生成Excel文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 返回Excel文件
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="resume_export_${Date.now()}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Excel导出失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { error: 'Excel导出失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
