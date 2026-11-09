function inline(s) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ s: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ s: tok.slice(2, -2), b: true });
    else out.push({ s: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ s: s.slice(last) });
  return out.length ? out : [{ s: '' }];
}

function strip(s) {
  return s.replace(/\*+/g, '');
}

function splitRow(r) {
  return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function isSep(r) {
  return splitRow(r).every((c) => /^:?-+:?$/.test(c));
}

function parse(text) {
  const blocks = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].replace(/\s+$/, '');
    i++;
    if (!line.trim()) continue;
    if (line.trim() === '[gap]') { blocks.push({ t: 'gap' }); continue; }
    if (line.trim() === '[page]') { blocks.push({ t: 'page' }); continue; }
    if (line.trim().startsWith('|')) {
      const rows = [line.trim()];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const header = rows.length > 1 && isSep(rows[1]);
      blocks.push({ t: 'table', header, rows: rows.filter((r) => !isSep(r)).map(splitRow) });
      continue;
    }
    let align = 'left';
    const am = line.match(/^\[(center|right)\]\s*/);
    if (am) { align = am[1]; line = line.slice(am[0].length); }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) blocks.push({ t: 'h' + m[1].length, s: m[2], align });
    else if (/^\s+-\s/.test(line)) blocks.push({ t: 'sub', s: line.replace(/^\s+-\s+/, '') });
    else if (/^-\s/.test(line)) blocks.push({ t: 'bullet', s: line.replace(/^-\s+/, '') });
    else if ((m = line.match(/^(\d+)[.)]\s+(.*)/))) blocks.push({ t: 'num', n: m[1], s: m[2] });
    else if (/^>\s?/.test(line)) blocks.push({ t: 'note', s: line.replace(/^>\s?/, ''), align });
    else blocks.push({ t: 'p', s: line, align });
  }
  return blocks;
}

module.exports = { inline, strip, parse };
