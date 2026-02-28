import pathlib
lines = pathlib.Path('src/components/classico-editor-preview.tsx').read_text().splitlines()
print(repr(lines[3965]))
