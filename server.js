const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, PageBreak
} = require('docx');
const { inline, strip, parse } = require('./markup');

const app = express();
app.use(express.json({ limit: '60mb' }));
app.use(express.static('public'));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules/pdfjs-dist/build')));

const KEY = process.env.GROQ_API_KEY;
const CODE = process.env.ACCESS_CODE;
const MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || MODEL;
const PORT = process.env.PORT || 3000;

app.use('/api', (req, res, next) => {
  if (CODE && req.headers['x-code'] !== CODE) return res.status(401).json({ error: 'Access code required' });
  next();
});

const MARKUP = `Output plain text in this markup and nothing else:
# Main heading
## Sub-heading
### Small heading
Normal paragraph on one line with **bold** and *italic* words.
- bullet
  - sub bullet (two spaces before the dash)
1. numbered item
> italic quote or slogan
[center] centered line (also works before a heading)
[right] right-aligned line
[gap] one visible empty space, such as above a signature
| col 1 | col 2 |
|---|---|
| cell | cell |
The |---| row marks the first table row as a header.
No code fences, no commentary.`;

const PRINTED = `You are converting a photo of a printed document page into an exact editable copy.
Copy the wording exactly. Do not summarize, rephrase or add anything. Ignore photos, logos, decoration, fingers and background.
Keep the layout of the original: heading levels, bold, italics, alignment, lists, tables and visible empty space.
If text is torn, covered or blurry, fill it from context only when you are certain, otherwise write [?].
Join lines that wrap inside one paragraph into a single line.

${MARKUP}`;

const HANDWRITTEN = `You are converting a photo of a handwritten page into editable text.
Read slowly, word by word, and use the sentence context to decide unclear letters. Keep the author's wording and order.
Underlined or emphasised words are **bold**. Write [?] for any word you cannot read. Do not invent text.
Keep lists, headings, tables and visible empty space as they appear. Join lines that wrap inside one paragraph into a single line.

${MARKUP}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clean(t) {
  return t
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^```\w*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

async function groq(messages, maxTokens, model) {
  if (!KEY) throw new Error('GROQ_API_KEY is not set');
  for (let a = 0; a < 5; a++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || MODEL, temperature: 0.1, max_tokens: maxTokens, messages })
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep((Number(res.headers.get('retry-after')) || 5 * (a + 1)) * 1000);
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || 'Groq error ' + res.status);
    return clean(data.choices[0].message.content || '');
  }
  throw new Error('Rate limited. Wait a minute and try again.');
}

const KINDS = {
  auto: 'whatever type of document the content suggests',
  letter: 'a formal letter',
  notes: 'clean study or meeting notes',
  report: 'a report',
  minutes: 'meeting minutes',
  essay: 'an essay',
  cv: 'a CV or resume',
  list: 'a structured list or checklist'
};

app.post('/api/read', async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!image || !image.startsWith('data:image/')) throw new Error('No image received');
    const text = await groq([{
      role: 'user',
      content: [
        { type: 'text', text: mode === 'handwritten' ? HANDWRITTEN : PRINTED },
        { type: 'image_url', image_url: { url: image } }
      ]
    }], 4000);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/polish', async (req, res) => {
  try {
    const kind = KINDS[req.body.kind] || KINDS.auto;
    const prompt = `Below is a transcription of handwritten pages, written in a simple markup.
Turn it into the best possible typed document: ${kind}.
Fix spelling, punctuation, capital letters and grammar. Organise it with a clear title, headings, short paragraphs, lists, and tables where the content is tabular. Join text that was split between pages.
Keep every fact, name, number and the author's meaning. Do not invent anything. Keep [?] where a word was unreadable.

${MARKUP}

TRANSCRIPTION:
${req.body.text}`;
    const text = await groq([{ role: 'user', content: prompt }], 8000, TEXT_MODEL);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/compose', async (req, res) => {
  try {
    const kind = KINDS[req.body.kind] || KINDS.auto;
    const tone = req.body.tone || 'professional';
    const prompt = `The user gives rough notes or an instruction. Write a complete, polished typed document: ${kind}. Tone: ${tone}.
Use a clear structure with a title, headings, short paragraphs, lists, and tables where useful. Fix spelling and grammar.
Do not invent facts such as names, dates, amounts or addresses. Where information is missing, use a placeholder in square brackets such as [Your name].

${MARKUP}

USER INPUT:
${req.body.text}`;
    const text = await groq([{ role: 'user', content: prompt }], 8000, TEXT_MODEL);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const FONT = (b, i) => (b && i ? 'Helvetica-BoldOblique' : b ? 'Helvetica-Bold' : i ? 'Helvetica-Oblique' : 'Helvetica');

function runs(doc, segs, size, opts, bold, color) {
  segs.forEach((g, k) => {
    doc.font(FONT(bold || g.b, g.i)).fontSize(size).fillColor(color || '#111111')
      .text(g.s, Object.assign({ lineGap: 2 }, opts, { continued: k < segs.length - 1 }));
  });
}

function drawTable(doc, t, L, W) {
  const cols = Math.max(...t.rows.map((r) => r.length));
  const cw = W / cols;
  const pad = 5;
  t.rows.forEach((row, ri) => {
    const head = t.header && ri === 0;
    doc.font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const texts = [];
    for (let c = 0; c < cols; c++) texts.push(strip(row[c] || ''));
    const h = Math.max(...texts.map((s) => doc.heightOfString(s, { width: cw - pad * 2 }))) + pad * 2;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    texts.forEach((s, c) => {
      if (head) doc.rect(L + c * cw, y, cw, h).fillAndStroke('#eeeeee', '#999999');
      else doc.rect(L + c * cw, y, cw, h).stroke('#999999');
      doc.fillColor('#111111').text(s, L + c * cw + pad, y + pad, { width: cw - pad * 2 });
    });
    doc.y = y + h;
    doc.x = L;
  });
  doc.moveDown(0.5);
}

function buildPdf(title, blocks, res) {
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 56, bottom: 56, left: 60, right: 60 },
    info: { Title: title || 'Document' }
  });
  doc.pipe(res);
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const room = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  if (title) {
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#111111').text(title, L, doc.y, { width: W });
    doc.moveDown(0.4);
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(1).strokeColor('#bbbbbb').stroke();
    doc.moveDown(0.8);
  }
  const sizes = { h1: 18, h2: 14, h3: 12 };
  for (const b of blocks) {
    doc.x = L;
    if (b.t === 'page') { doc.addPage(); continue; }
    if (b.t === 'gap') { doc.y += 16; continue; }
    if (sizes[b.t]) {
      room(sizes[b.t] * 3);
      doc.moveDown(0.5);
      runs(doc, inline(b.s), sizes[b.t], { align: b.align, width: W }, true);
      doc.moveDown(0.3);
    } else if (b.t === 'bullet' || b.t === 'sub' || b.t === 'num') {
      const ind = b.t === 'sub' ? 30 : 12;
      room(24);
      const y = doc.y;
      doc.font('Helvetica').fontSize(11).fillColor('#111111')
        .text(b.t === 'num' ? b.n + '.' : '\u2022', L + ind, y, { width: 20, lineBreak: false });
      doc.x = L + ind + 18;
      doc.y = y;
      runs(doc, inline(b.s), 11, { width: W - ind - 18 });
      doc.x = L;
      doc.moveDown(0.2);
    } else if (b.t === 'table') {
      drawTable(doc, b, L, W);
    } else if (b.t === 'note') {
      runs(doc, inline(b.s).map((g) => Object.assign({}, g, { i: true })), 11, { align: b.align, width: W });
      doc.moveDown(0.4);
    } else {
      runs(doc, inline(b.s), 11, { align: b.align, width: W });
      doc.moveDown(0.4);
    }
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bm = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text('Page ' + (i + 1) + ' of ' + range.count, 0, doc.page.height - 36, { width: doc.page.width, align: 'center', lineBreak: false });
    doc.page.margins.bottom = bm;
  }
  doc.end();
}

const AL = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };

function dRuns(s, extra) {
  return inline(s).map((g) => new TextRun(Object.assign({ text: g.s, bold: !!g.b, italics: !!g.i }, extra || {})));
}

function buildDocx(title, blocks) {
  const kids = [];
  const sp = { after: 120 };
  if (title) kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }));
  const heads = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };
  for (const b of blocks) {
    if (heads[b.t]) kids.push(new Paragraph({ heading: heads[b.t], alignment: AL[b.align], children: dRuns(b.s) }));
    else if (b.t === 'gap') kids.push(new Paragraph({ children: [new TextRun('')] }));
    else if (b.t === 'page') kids.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.t === 'bullet') kids.push(new Paragraph({ bullet: { level: 0 }, spacing: sp, children: dRuns(b.s) }));
    else if (b.t === 'sub') kids.push(new Paragraph({ bullet: { level: 1 }, spacing: sp, children: dRuns(b.s) }));
    else if (b.t === 'num') {
      kids.push(new Paragraph({
        indent: { left: 720, hanging: 360 }, spacing: sp,
        children: [new TextRun(b.n + '.  ')].concat(dRuns(b.s))
      }));
    } else if (b.t === 'note') {
      kids.push(new Paragraph({ alignment: AL[b.align], spacing: sp, children: dRuns(b.s, { italics: true }) }));
    } else if (b.t === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.length));
      kids.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map((r, ri) => new TableRow({
          children: Array.from({ length: cols }, (_, c) => new TableCell({
            children: [new Paragraph({ children: dRuns(r[c] || '', { bold: b.header && ri === 0 }) })]
          }))
        }))
      }));
      kids.push(new Paragraph({ children: [new TextRun('')] }));
    } else {
      kids.push(new Paragraph({ alignment: AL[b.align], spacing: sp, children: dRuns(b.s) }));
    }
  }
  return Packer.toBuffer(new Document({
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 44, bold: true, color: '111111', font: 'Calibri' }, paragraph: { spacing: { after: 240 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: '111111', font: 'Calibri' }, paragraph: { spacing: { before: 320, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '111111', font: 'Calibri' }, paragraph: { spacing: { before: 240, after: 100 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '111111', font: 'Calibri' }, paragraph: { spacing: { before: 200, after: 80 } } }
      ]
    },
    sections: [{ children: kids }]
  }));
}

function joinPages(pages, pageBreaks) {
  return (pages || []).join(pageBreaks ? '\n[page]\n' : '\n');
}

app.post('/api/pdf', (req, res) => {
  const { title, pages, pageBreaks } = req.body;
  res.setHeader('Content-Type', 'application/pdf');
  buildPdf(title, parse(joinPages(pages, pageBreaks)), res);
});

app.post('/api/docx', async (req, res) => {
  try {
    const { title, pages, pageBreaks } = req.body;
    const buf = await buildDocx(title, parse(joinPages(pages, pageBreaks)));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/images-to-pdf', (req, res) => {
  try {
    const { images, size } = req.body;
    if (!images || !images.length) throw new Error('No images');
    const doc = new PDFDocument({ autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    for (const dataUrl of images) {
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const img = doc.openImage(buf);
      if (size === 'fit') {
        const w = 595;
        const h = Math.round((img.height * w) / img.width);
        doc.addPage({ size: [w, h], margin: 0 });
        doc.image(img, 0, 0, { width: w, height: h });
      } else {
        doc.addPage({ size: 'A4', margin: 0 });
        doc.image(img, 20, 20, { fit: [555, 802], align: 'center', valign: 'center' });
      }
    }
    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log('CP Scan running at http://localhost:' + PORT));
