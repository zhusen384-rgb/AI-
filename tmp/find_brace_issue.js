const fs = require('fs');
const content = fs.readFileSync('/workspace/projects/src/app/full-ai-interview/share/page.tsx', 'utf-8');

const lines = content.split('\n');

let curlyBalance = 0;
const stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') {
      curlyBalance++;
      stack.push({ line: i + 1, column: j + 1, char: '{' });
    } else if (char === '}') {
      if (stack.length > 0) {
        stack.pop();
      }
      curlyBalance--;
      if (curlyBalance < 0) {
        console.log(`[ERROR] Unmatched } at line ${i + 1}, column ${j + 1}`);
        console.log(`[INFO] Line content: ${line.trim()}`);
        console.log(`[INFO] Balance before: -1, Balance after: ${curlyBalance}`);
        console.log(`\n[INFO] Last 5 unmatched { positions:`);
        const last5 = stack.slice(-5);
        if (last5.length > 0) {
          last5.forEach((item, idx) => {
            console.log(`${idx + 1}. Line ${item.line}, column ${item.column}`);
          });
        } else {
          console.log("No unmatched { found before this }");
        }
        process.exit(1);
      }
    }
  }
}

console.log(`[INFO] Curly braces balance: ${curlyBalance}`);
console.log(`[INFO] File has ${lines.length} lines`);

if (stack.length > 0) {
  console.log(`\n[WARNING] There are ${stack.length} unmatched { remaining:`);
  stack.forEach((item, idx) => {
    console.log(`${idx + 1}. Line ${item.line}, column ${item.column}`);
  });
}
