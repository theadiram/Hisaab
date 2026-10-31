import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
export async function packetPdf(draft: string, kind: 'complaint' | 'rti', demo: boolean) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(path.join(process.cwd(), 'assets/fonts/NotoSans.ttf')),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  if ([...draft].some((c) => !['\n', '\r', '\t'].includes(c) && !supported.has(c.codePointAt(0)!)))
    throw new Error(
      'Some characters are not supported in PDF export yet. Download the text draft instead.',
    );
  doc.setTitle('Hisaab citizen draft');
  doc.setAuthor('Hisaab');
  doc.setCreator('Hisaab');
  let page = doc.addPage([595.28, 841.89]),
    y = 750;
  function newPage() {
    page = doc.addPage([595.28, 841.89]);
    y = 750;
  }
  function line(text: string, size = 10, color = rgb(0.15, 0.2, 0.28)) {
    if (y < 65) newPage();
    page.drawText(text, { x: 50, y, size, font, color });
    y -= size === 10 ? 16 : 24;
  }
  function paragraph(text: string) {
    for (const raw of text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
      if (!raw) {
        line('');
        continue;
      }
      let current = '';
      for (const char of raw) {
        if (font.widthOfTextAtSize(current + char, 10) > 495) {
          const space = current.lastIndexOf(' ');
          if (space > 0) {
            line(current.slice(0, space));
            current = current.slice(space + 1);
          } else {
            line(current);
            current = '';
          }
        }
        current += char;
      }
      if (current) line(current);
    }
  }
  line('hisaab.', 24, rgb(0.08, 0.35, 0.75));
  line(
    kind === 'rti'
      ? 'REQUEST FOR RECORDS - CITIZEN DRAFT'
      : 'REQUEST FOR INSPECTION - CITIZEN DRAFT',
    12,
  );
  y -= 6;
  paragraph(
    demo
      ? 'DESIGN DEMONSTRATION: fictional work facts. Do not file this draft.'
      : 'Citizen-supplied draft. Review the facts, destination and requirements before filing.',
  );
  paragraph('This document has not been submitted to an authority.');
  y -= 14;
  paragraph(draft);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: 50, y: 44 },
      end: { x: 545, y: 44 },
      thickness: 0.5,
      color: rgb(0.8, 0.84, 0.88),
    });
    p.drawText(`Private draft | Hisaab | ${i + 1} / ${pages.length}`, {
      x: 50,
      y: 28,
      size: 8,
      font,
      color: rgb(0.4, 0.45, 0.52),
    });
  });
  return doc.save();
}
