// Builds form.pdf: a one-page form with a filled text field, a ticked checkbox, a radio group and a dropdown.
import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { PDFDocument, StandardFonts } = require('/opt/npm-tools/node_modules/pdf-lib');
import fs from 'fs';
const doc = await PDFDocument.create();
const f = await doc.embedFont(StandardFonts.Helvetica);
const p = doc.addPage([595, 842]);
p.drawText('Application form', { x: 60, y: 780, size: 20, font: f });
p.drawText('Full name:', { x: 60, y: 720, size: 12, font: f });
const form = doc.getForm();
const t = form.createTextField('fullname'); t.setText('Filled Value Zed'); t.addToPage(p, { x: 150, y: 712, width: 250, height: 22 });
p.drawText('Agree:', { x: 60, y: 680, size: 12, font: f });
const c = form.createCheckBox('agree'); c.addToPage(p, { x: 150, y: 676, width: 16, height: 16 }); c.check();
const r = form.createRadioGroup('size'); r.addOptionToPage('small', p, { x: 150, y: 640, width: 14, height: 14 }); r.addOptionToPage('large', p, { x: 200, y: 640, width: 14, height: 14 }); r.select('large');
const d = form.createDropdown('city'); d.addOptions(['Chennai', 'Delhi', 'Mumbai']); d.select('Delhi'); d.addToPage(p, { x: 150, y: 600, width: 150, height: 22 });
form.updateFieldAppearances(f);
fs.writeFileSync(process.argv[2], await doc.save());
