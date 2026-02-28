const fs = require('fs');
const ts = require('typescript');
const path = 'src/components/classico-editor-preview.tsx';
const source = fs.readFileSync(path, 'utf8');
const res = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
if (res.parseDiagnostics.length) {
  for (const d of res.parseDiagnostics) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(d.messageText, 'line ' + (line + 1) + ':' + (character + 1));
  }
  process.exit(1);
}
console.log('ok');
