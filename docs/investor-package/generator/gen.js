const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Numbering, LevelFormat, convertInchesToTwip,
} = require('docx');

const OUT_DIR = '/home/user/RideShare-Genesis/docs/investor-package/documents';

// ---------- shared helpers ----------

const COLORS = {
  ink: '15142B',
  brass: 'A67C1E',
  muted: '5B5875',
  danger: 'B23A3A',
};

const numbering = {
  config: [
    {
      reference: 'bullet-list',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.7), hanging: convertInchesToTwip(0.2) } } } },
      ],
    },
    {
      reference: 'numbered-list',
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.25) } } } },
      ],
    },
  ],
};

function title(text, subtitle) {
  const paras = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: 'RIDESHARE GENESIS', bold: true, color: COLORS.brass, size: 20, font: 'IBM Plex Mono' })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text, bold: true, size: 56, color: COLORS.ink })],
    }),
  ];
  if (subtitle) {
    paras.push(new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: subtitle, italics: true, color: COLORS.muted, size: 24 })] }));
  }
  return paras;
}

function draftBanner(text) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'FBEAEA' },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.danger }, bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.danger }, left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.danger }, right: { style: BorderStyle.SINGLE, size: 6, color: COLORS.danger } },
    spacing: { before: 120, after: 400 },
    children: [new TextRun({ text, bold: true, color: COLORS.danger, size: 20 })],
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text })] });
}
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text, ...opts })] });
}
function pRuns(runs) {
  return new Paragraph({ spacing: { after: 160 }, children: runs });
}
function bullet(text, level = 0) {
  return new Paragraph({ numbering: { reference: 'bullet-list', level }, spacing: { after: 80 }, children: [new TextRun({ text })] });
}
function numbered(text) {
  return new Paragraph({ numbering: { reference: 'numbered-list', level: 0 }, spacing: { after: 100 }, children: [new TextRun({ text })] });
}

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: '15142B' } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.header, color: opts.header ? 'FFFFFF' : COLORS.ink, size: 20 })] })],
  });
}

function table(headerRow, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headerRow.map((t, i) => cell(t, { header: true, width: widths[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { width: widths[i] })) })),
    ],
  });
}

function footerNote(text) {
  return new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } }, children: [new TextRun({ text, italics: true, color: COLORS.muted, size: 18 })] });
}

async function write(doc, filename) {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT_DIR, filename), buf);
  console.log('wrote', filename, buf.length, 'bytes');
}

const baseStyles = {
  default: {
    document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 300 } } },
    heading1: { run: { font: 'Georgia', bold: true, size: 32, color: COLORS.ink }, paragraph: { spacing: { before: 360, after: 160 } } },
    heading2: { run: { font: 'Georgia', bold: true, size: 26, color: COLORS.ink }, paragraph: { spacing: { before: 240, after: 120 } } },
  },
};

module.exports = {
  title, draftBanner, h1, h2, p, pRuns, bullet, numbered, table, footerNote, write, numbering, baseStyles, COLORS,
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak: require('docx').PageBreak,
};
