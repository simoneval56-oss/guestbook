const fs = require('fs');
const parser = require('@babel/parser');
const code = fs.readFileSync('src/components/classico-editor-preview.tsx','utf8');
try {
  parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  console.log('parsed successfully');
} catch (error) {
  console.error(error.message);
  if (error.codeFrame) {
    console.error(error.codeFrame);
  }
}
