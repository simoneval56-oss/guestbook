const fs = require('fs');
const lines = fs.readFileSync('src/components/classico-editor-preview.tsx', 'utf8').split(/\r?\n/);
for (let i = 3955; i <= 3970; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
