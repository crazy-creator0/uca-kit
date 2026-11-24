// Makes the test PDFs in this folder. password.pdf was then made with:
//   qpdf --encrypt userpw ownerpw 256 -- three-pages.pdf password.pdf
// pdf-lib 1.17.1 from npm; set PDFLIB to its path if Node cannot find it.
const { PDFDocument, StandardFonts, rgb } = await import(process.env.PDFLIB || "pdf-lib");
import fs from "node:fs";
async function make(pages, name) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Invoice 2026-${String(i).padStart(3, "0")}`, { x: 60, y: 760, size: 22, font });
    page.drawText(`Customer: Asha Raman`, { x: 60, y: 720, size: 14, font });
    page.drawText(`Total due: Rs 12,500 by 30 November`, { x: 60, y: 690, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Page ${i} of ${pages}`, { x: 60, y: 60, size: 10, font });
  }
  fs.writeFileSync(name, await doc.save());
}
await make(3, "three-pages.pdf");
await make(300, "three-hundred-pages.pdf");
fs.writeFileSync("broken.pdf", "%PDF-1.7\nthis is not really a pdf\n%%EOF\n");
