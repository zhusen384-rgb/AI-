const fs = require('fs');
const content = fs.readFileSync('/workspace/projects/src/app/full-ai-interview/share/page.tsx', 'utf-8');

const lines = content.split('\n');
const startLine = 463; // toggleListening 函数开始行
const endLine = 848;   // toggleListening 函数结束行

let curlyBalance = 0;
let unbalancedLine = -1;

console.log(`Analyzing lines ${startLine}-${endLine}...`);

for (let i = startLine - 1; i < endLine; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      curlyBalance++;
    } else if (char === '}') {
      curlyBalance--;
      if (curlyBalance < 0) {
        console.log(`Unmatched } at line ${i + 1}, column ${j + 1}`);
        console.log(`Line content: ${line.trim()}`);
        console.log(`Balance before: ${curlyBalance + 1}, Balance after: ${curlyBalance}`);
        unbalancedLine = i + 1;
        break;
      }
    }
  }
  if (unbalancedLine !== -1) break;
}

if (unbalancedLine === -1) {
  console.log(`All braces matched within lines ${startLine}-${endLine}`);
  console.log(`Final balance: ${curlyBalance}`);
  console.log(`Expected balance: 0`);
  if (curlyBalance === 0) {
    console.log(`✓ toggleListening function is correctly closed`);
  } else {
    console.log(`✗ toggleListening function has ${curlyBalance} unmatched braces`);
  }
}
