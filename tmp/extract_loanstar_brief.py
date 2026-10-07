import sys
import pdfplumber

path = sys.argv[1]
with pdfplumber.open(path) as document:
    print(f"PAGES {len(document.pages)}")
    for index, page in enumerate(document.pages, start=1):
        print(f"--- PAGE {index} ---")
        print(page.extract_text() or "")
