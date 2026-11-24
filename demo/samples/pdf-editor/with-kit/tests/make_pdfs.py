import sys, asyncio
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter
out = sys.argv[1]
HTML = """<html><body style="margin:40px;font-family:'Liberation Serif',serif;font-size:14pt">
<h1 style="font-family:'Liberation Sans',sans-serif">Invoice 2041 for Meera Traders</h1>
<p>Customer name: <b>Ravi Kumar</b></p>
<p style="color:#b40000">Amount due: Rs 12,450 by 30 November 2026</p>
<p style="background:#fff3c4;padding:4px">Secret account note: ACCT-778899</p>
<p lang="hi" style="font-family:'Noto Sans Devanagari','Lohit Devanagari',sans-serif">नमस्ते, धन्यवाद</p>
<p style="font-family:'Liberation Mono',monospace">Ref code: QX-55</p>
<div style="page-break-after:always"></div>
<p>Page two says hello. Ravi Kumar appears again here.</p>
<div style="page-break-after:always"></div>
<p>Page three will be rotated. Ravi Kumar.</p>
</body></html>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page()
        await pg.set_content(HTML)
        await pg.pdf(path=f"{out}/invoice_base.pdf", format="A4", print_background=True)
        await b.close()
asyncio.run(main())
r = PdfReader(f"{out}/invoice_base.pdf")
w = PdfWriter()
for i, page in enumerate(r.pages):
    if i == 2: page.rotate(90)
    w.add_page(page)
w.add_metadata({"/Title": "Invoice test"})
with open(f"{out}/invoice.pdf", "wb") as f: w.write(f)
