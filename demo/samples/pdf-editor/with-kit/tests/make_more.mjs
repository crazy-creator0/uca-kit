import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { PDFDocument, StandardFonts, PDFOperator, PDFNumber } = require('/opt/npm-tools/node_modules/pdf-lib');
import fs from 'fs';
const out = process.argv[2];
// 300 pages
{
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 300; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Chapter ${i}: the quick brown fox`, { x: 60, y: 760, size: 18, font: f });
    for (let l = 0; l < 30; l++) p.drawText(`Line ${l + 1} of page ${i}. Lorem text for size testing only.`, { x: 60, y: 720 - l * 20, size: 11, font: f });
  }
  fs.writeFileSync(`${out}/big300.pdf`, await doc.save());
}
// unbalanced graphics state: content leaves a scaled CTM behind
{
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.TimesRoman);
  const p = doc.addPage([400, 300]);
  p.drawText('Tricky page text', { x: 40, y: 200, size: 20, font: f });

  p.pushOperators(PDFOperator.of('cm', [0.5, 0, 0, 0.5, 100, 50].map(PDFNumber.of)));
  fs.writeFileSync(`${out}/tricky_raw.pdf`, await doc.save());
}
