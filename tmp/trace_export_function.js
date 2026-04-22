const fs = require('fs');
const content = fs.readFileSync('/workspace/projects/src/app/full-ai-interview/share/page.tsx', 'utf-8');

const lines = content.split('\n');

// 找到 export default function 的开始行
let functionStartLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default async function')) {
    functionStartLine = i + 1;
    break;
  }
}

if (functionStartLine === -1) {
  console.log('Did not find export default async function');
  process.exit(1);
}

console.log(`[INFO] Function starts at line ${functionStartLine}`);

// 从函数开始行开始，找到对应的结束位置
let curlyBalance = 0;
let functionStarted = false;

for (let i = functionStartLine - 1; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      if (!functionStarted) {
        functionStarted = true;
        console.log(`[START] Function body starts at line ${i + 1}, column ${j + 1}`);
      }
      curlyBalance++;
    } else if (char === '}') {
      curlyBalance--;
      if (functionStarted && curlyBalance === 0) {
        console.log(`[END] Function body ends at line ${i + 1}, column ${j + 1}`);
        console.log(`\n[INFO] Function spans from line ${functionStartLine} to line ${i + 1}`);
        console.log(`[INFO] Total lines: ${i + 1 - functionStartLine + 1}`);
        console.log(`[INFO] File has ${lines.length} lines`);

        if (i + 1 < lines.length) {
          console.log(`\n[WARNING] There are ${lines.length - (i + 1)} lines after the function end`);
          console.log(`[INFO] Lines ${i + 2}-${lines.length} are outside the function`);
        }
        process.exit(0);
      }
    }
  }
}

console.log(`[ERROR] Did not find function end. Current balance: ${curlyBalance}`);
console.log(`[INFO] File has ${lines.length} lines`);
