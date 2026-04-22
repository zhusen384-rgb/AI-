const fs = require('fs');
const content = fs.readFileSync('/workspace/projects/src/app/full-ai-interview/share/page.tsx', 'utf-8');

const lines = content.split('\n');

// 从第 755 行（try {）到第 843 行（};）
const startLine = 755;
const endLine = 843;

let curlyBalance = 0;
const stack = [];

console.log(`Tracing braces from line ${startLine} to ${endLine}...`);

for (let i = startLine - 1; i < endLine; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      curlyBalance++;
      stack.push({ line: i + 1, column: j + 1, char: '{', balance: curlyBalance });
    } else if (char === '}') {
      if (stack.length > 0) {
        const openBrace = stack.pop();
        console.log(`Line ${i + 1}, col ${j + 1}: } matches Line ${openBrace.line}, col ${openBrace.column}`);
      } else {
        console.log(`Line ${i + 1}, col ${j + 1}: } has no matching {`);
      }
      curlyBalance--;
    }
  }
}

console.log(`\nFinal balance: ${curlyBalance}`);
if (stack.length > 0) {
  console.log(`\nUnmatched { braces:`);
  stack.forEach((item, idx) => {
    console.log(`${idx + 1}. Line ${item.line}, col ${item.column}, balance: ${item.balance}`);
  });
}
