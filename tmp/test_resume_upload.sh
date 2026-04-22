#!/bin/bash

# 简历上传解析测试脚本

echo "========================================="
echo "简历上传解析测试"
echo "========================================="

# 测试1: PDF文件提取
echo ""
echo "测试1: PDF文件内容提取"
echo "-----------------------------------------"
curl -s -X POST \
  -F "file=@/workspace/projects/node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/test/data/01-valid.pdf" \
  http://localhost:5000/api/resume/extract \
  | python3 -c "import sys, json; data = json.load(sys.stdin); print('成功:', data.get('success')); print('内容长度:', len(data.get('content', ''))); print('内容预览:', data.get('content', '')[:200])" 2>&1

echo ""
echo ""

# 测试2: 文本文件提取
echo "测试2: 文本文件内容提取"
echo "-----------------------------------------"
curl -s -X POST \
  -F "file=@/tmp/test_resume.txt" \
  http://localhost:5000/api/resume/extract \
  | python3 -c "import sys, json; data = json.load(sys.stdin); print('成功:', data.get('success')); print('内容长度:', len(data.get('content', ''))); print('内容预览:', data.get('content', '')[:200])" 2>&1

echo ""
echo ""

# 测试3: 模拟简历上传（仅上传，不解析）
echo "测试3: 简历文件上传到对象存储"
echo "-----------------------------------------"
curl -s -X POST \
  -F "file=@/tmp/test_resume.txt" \
  http://localhost:5000/api/resume/upload \
  | python3 -c "import sys, json; data = json.load(sys.stdin); print('成功:', data.get('success')); print('文件Key:', data.get('fileKey')); print('文件名:', data.get('fileName'))" 2>&1

echo ""
echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
