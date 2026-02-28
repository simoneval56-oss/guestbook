import pathlib
content = pathlib.Path('src/components/classico-editor-preview.tsx').read_text()
marker = '              {showStandardSubsections ? ('
print(content.find(marker))
