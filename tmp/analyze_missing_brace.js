const fs = require('fs');
const content = fs.readFileSync('/workspace/projects/src/app/full-ai-interview/share/page.tsx', 'utf-8');

const lines = content.split('\n');

// 检查第 463 行的 toggleListening 函数
let curlyBalance = 0;
let functionStarted = false;
let functionStartLine = 463;
let functionEndLine = -1;

for (let i = functionStartLine - 1; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      if (!functionStarted) {
        functionStarted = true;
        console.log(`[START] toggleListening function starts at line ${i + 1}, column ${j + 1}`);
      }
      curlyBalance++;
    } else if (char === '}') {
      curlyBalance--;
      if (functionStarted && curlyBalance === 0) {
        console.log(`[END] toggleListening function ends at line ${i + 1}, column ${j + 1}`);
        functionEndLine = i + 1;
        break;
      }
    }
  }
  if (functionEndLine !== -1) break;
}

console.log(`\n[INFO] toggleListening function spans from line ${functionStartLine} to line ${functionEndLine}`);
console.log(`[INFO] Total lines: ${functionEndLine - functionStartLine + 1}`);

// 检查第 105 行的 export default function
curlyBalance = 0;
functionStarted = false;
functionStartLine = 105;
functionEndLine = -1;

for (let i = functionStartLine - 1; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      if (!functionStarted) {
        functionStarted = true;
        console.log(`\n[START] export default function starts at line ${i + 1}, column ${j + 1}`);
      }
      curlyBalance++;
    } else if (char === '}') {
      curlyBalance--;
      if (functionStarted && curlyBalance === 0) {
        console.log(`[END] export default function ends at line ${i + 1}, column ${j + 1}`);
        functionEndLine = i + 1;
        break;
      }
    }
  }
  if (functionEndLine !== -1) break;
}

console.log(`\n[INFO] export default function spans from line ${functionStartLine} to line ${functionEndLine}`);
console.log(`[INFO] Total lines: ${functionEndLine - functionStartLine + 1}`);
console.log(`[INFO] File has ${lines.length} lines`);
