from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import textwrap
md = Path('policy-checklist.md').read_text(encoding='utf-8')
text = md.replace('#','').strip()
lines = text.splitlines()
c = canvas.Canvas('policy-checklist.pdf', pagesize=letter)
width, height = letter
y = height - 40
for line in lines:
    if not line.strip():
        y -= 12
        continue
    for chunk in textwrap.wrap(line, width=90):
        if y < 40:
            c.showPage()
            y = height - 40
        c.drawString(40, y, chunk)
        y -= 14
c.save()
