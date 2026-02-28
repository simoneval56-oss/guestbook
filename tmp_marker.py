import pathlib
content = pathlib.Path('src/components/classico-editor-preview.tsx').read_text()
start_marker = '              {showStandardSubsections ? ('
end_marker = '              {iconKey ===  cosa visitare ? ('
print('start', content.find(start_marker))
print('end', content.find(end_marker))
