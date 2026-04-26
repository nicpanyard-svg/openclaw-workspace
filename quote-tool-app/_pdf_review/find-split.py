from pathlib import Path
import subprocess
from pypdf import PdfReader

root = Path(r'C:\Users\IkeFl\.openclaw\workspace\quote-tool-app')
out_dir = root / '_pdf_review' / 'search'
out_dir.mkdir(parents=True, exist_ok=True)

for customer in range(0, 13):
    for bill in range(0, 13):
        tag = f'c{customer}-b{bill}'
        cmd = ['node', '_pdf_review\\address-break-repro.js', str(out_dir), tag, 'original', str(customer), str(bill)]
        subprocess.run(cmd, cwd=root, check=True, capture_output=True, text=True)
        pdf = out_dir / f'{tag}.pdf'
        reader = PdfReader(str(pdf))
        pages = [(p.extract_text() or '').replace('\n', ' ') for p in reader.pages]
        page_with_bill = next((i for i, text in enumerate(pages) if 'BILL TO' in text), None)
        if page_with_bill is None:
            continue
        current = pages[page_with_bill]
        nxt = pages[page_with_bill + 1] if page_with_bill + 1 < len(pages) else ''
        split = ('BILL TO' in current and 'Same as Bill To' not in current and ('Bill extra line' in nxt or 'Kansas City, Kansas 66117' in nxt or 'United States' in nxt))
        if split:
            print(f'SPLIT customer={customer} bill={bill} page={page_with_bill+1}')
            print('CURRENT:', current[:1500])
            print('NEXT:', nxt[:900])
            raise SystemExit(0)
print('NO_SPLIT_FOUND')
