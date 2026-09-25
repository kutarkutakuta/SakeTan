import hashlib
import difflib
import json
import pathlib
import sys

import pdfplumber


result = []
for raw_path in sys.argv[1:]:
    path = pathlib.Path(raw_path)
    with pdfplumber.open(path) as document:
        texts = ["\n".join((page.extract_text() or "").split()) for page in document.pages]
    result.append(
        {
            "file": path.name,
            "pdf_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "text_sha256": hashlib.sha256("\n".join(texts).encode()).hexdigest(),
            "page_text_sha256": [hashlib.sha256(text.encode()).hexdigest() for text in texts],
        }
    )

print(json.dumps(result, ensure_ascii=False))

if len(sys.argv) == 3:
    with pdfplumber.open(sys.argv[1]) as left, pdfplumber.open(sys.argv[2]) as right:
        for page_number, (left_page, right_page) in enumerate(zip(left.pages, right.pages), 1):
            left_lines = (left_page.extract_text() or "").splitlines()
            right_lines = (right_page.extract_text() or "").splitlines()
            if left_lines != right_lines:
                print(f"PAGE {page_number}")
                print("\n".join(difflib.unified_diff(right_lines, left_lines, fromfile="2026.4", tofile="2026.6", n=2)))
