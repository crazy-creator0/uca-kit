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
// a form with a text box, a tick box, a choice of two (radio) and a drop-down list
{
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]);
  const form = doc.getForm();
  p.drawText('Application form', { x: 60, y: 780, size: 20, font: f });
  p.drawText('Full name:', { x: 60, y: 724, size: 12, font: f });
  form.createTextField('fullname').addToPage(p, { x: 140, y: 716, width: 250, height: 22 });
  p.drawText('I agree:', { x: 60, y: 684, size: 12, font: f });
  form.createCheckBox('agree').addToPage(p, { x: 140, y: 680, width: 16, height: 16 });
  p.drawText('Size:  small        large', { x: 60, y: 644, size: 12, font: f });
  const rg = form.createRadioGroup('size');
  rg.addOptionToPage('small', p, { x: 140, y: 640, width: 14, height: 14 });
  rg.addOptionToPage('large', p, { x: 196, y: 640, width: 14, height: 14 });
  p.drawText('City:', { x: 60, y: 604, size: 12, font: f });
  const dd = form.createDropdown('city');
  dd.addOptions(['Chennai', 'Delhi', 'Mumbai']);
  dd.addToPage(p, { x: 140, y: 598, width: 150, height: 20 });
  doc.addPage([595, 842]).drawText('Second page of the form', { x: 60, y: 780, size: 14, font: f });
  fs.writeFileSync(`${out}/form.pdf`, await doc.save());
}
