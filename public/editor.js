var ED = null;

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inlineHtml(s) {
  return esc(s)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\s][^*]*)\*/g, '<i>$1</i>');
}

function splitRow(r) { return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
function isSep(r) { return splitRow(r).every(function (c) { return /^:?-+:?$/.test(c); }); }

function parseMarkup(text) {
  var blocks = [], lines = text.split('\n'), i = 0, m;
  while (i < lines.length) {
    var line = lines[i].replace(/\s+$/, '');
    i++;
    if (!line.trim()) continue;
    if (line.trim() === '[gap]') { blocks.push({ t: 'gap' }); continue; }
    if (line.trim() === '[page]') { blocks.push({ t: 'page' }); continue; }
    if (line.trim().charAt(0) === '|') {
      var rows = [line.trim()];
      while (i < lines.length && lines[i].trim().charAt(0) === '|') rows.push(lines[i++].trim());
      blocks.push({ t: 'table', header: rows.length > 1 && isSep(rows[1]), rows: rows.filter(function (r) { return !isSep(r); }).map(splitRow) });
      continue;
    }
    var align = 'left', am = line.match(/^\[(center|right)\]\s*/);
    if (am) { align = am[1]; line = line.slice(am[0].length); }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) blocks.push({ t: 'h' + m[1].length, s: m[2], align: align });
    else if (/^\s+-\s/.test(line)) blocks.push({ t: 'sub', s: line.replace(/^\s+-\s+/, '') });
    else if (/^-\s/.test(line)) blocks.push({ t: 'bullet', s: line.replace(/^-\s+/, '') });
    else if ((m = line.match(/^(\d+)[.)]\s+(.*)/))) blocks.push({ t: 'num', n: m[1], s: m[2] });
    else if (/^>\s?/.test(line)) blocks.push({ t: 'note', s: line.replace(/^>\s?/, ''), align: align });
    else blocks.push({ t: 'p', s: line, align: align });
  }
  return blocks;
}

function markupToHtml(text) {
  var blocks = parseMarkup(text), html = '', i = 0, b;
  function st(a) { return a && a !== 'left' ? ' style="text-align:' + a + '"' : ''; }
  while (i < blocks.length) {
    b = blocks[i];
    if (b.t === 'bullet' || b.t === 'sub') {
      var ul = '<ul>', open = false;
      while (i < blocks.length && (blocks[i].t === 'bullet' || blocks[i].t === 'sub')) {
        var x = blocks[i];
        if (x.t === 'bullet') { if (open) ul += '</li>'; ul += '<li>' + inlineHtml(x.s); open = true; }
        else { if (!open) { ul += '<li style="list-style:none">'; open = true; } ul += '<ul><li>' + inlineHtml(x.s) + '</li></ul>'; }
        i++;
      }
      html += ul + (open ? '</li>' : '') + '</ul>';
      continue;
    }
    if (b.t === 'num') {
      var ol = '<ol start="' + b.n + '">';
      while (i < blocks.length && blocks[i].t === 'num') { ol += '<li>' + inlineHtml(blocks[i].s) + '</li>'; i++; }
      html += ol + '</ol>';
      continue;
    }
    if (/^h[1-3]$/.test(b.t)) html += '<' + b.t + st(b.align) + '>' + inlineHtml(b.s) + '</' + b.t + '>';
    else if (b.t === 'note') html += '<blockquote' + st(b.align) + '>' + inlineHtml(b.s) + '</blockquote>';
    else if (b.t === 'gap') html += '<p class="gap"><br></p>';
    else if (b.t === 'page') html += '<div class="pb" contenteditable="false">Page break</div>';
    else if (b.t === 'table') {
      html += '<table>' + b.rows.map(function (r, ri) {
        var tag = b.header && ri === 0 ? 'th' : 'td';
        return '<tr>' + r.map(function (c) { return '<' + tag + '>' + inlineHtml(c) + '</' + tag + '>'; }).join('') + '</tr>';
      }).join('') + '</table><p><br></p>';
    } else html += '<p' + st(b.align) + '>' + inlineHtml(b.s) + '</p>';
    i++;
  }
  return html || '<p><br></p>';
}

function runsOf(n, b, i, out) {
  if (n.nodeType === 3) {
    var t = n.nodeValue.replace(/\*/g, '').replace(/\u00a0/g, ' ');
    if (t) out.push({ t: t, b: b, i: i });
    return;
  }
  if (n.nodeType !== 1) return;
  var tag = n.tagName;
  if (tag === 'BR') { out.push({ t: ' ', b: false, i: false }); return; }
  var st = n.style || {};
  var nb = b || tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600;
  var ni = i || tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
  Array.prototype.forEach.call(n.childNodes, function (c) { runsOf(c, nb, ni, out); });
}

function inlineMd(n) {
  var runs = [];
  Array.prototype.forEach.call(n.childNodes, function (c) { runsOf(c, false, false, runs); });
  var merged = [];
  runs.forEach(function (r) {
    var l = merged[merged.length - 1];
    if (l && l.b === r.b && l.i === r.i) l.t += r.t; else merged.push({ t: r.t, b: r.b, i: r.i });
  });
  return merged.map(function (r) {
    var core = r.t.trim();
    if (!core) return r.t;
    var lead = r.t.slice(0, r.t.indexOf(core)), trail = r.t.slice(lead.length + core.length);
    var m = r.b && r.i ? '***' : r.b ? '**' : r.i ? '*' : '';
    return lead + m + core + m + trail;
  }).join('');
}

function alignOf(n) {
  var a = (n.style && n.style.textAlign) || (n.getAttribute && n.getAttribute('align')) || '';
  return a === 'center' ? '[center] ' : a === 'right' ? '[right] ' : '';
}

function listMd(n, level, out) {
  var ol = n.tagName === 'OL', k = parseInt(n.getAttribute('start') || '1', 10);
  Array.prototype.forEach.call(n.childNodes, function (li) {
    if (li.nodeType !== 1 || li.tagName !== 'LI') return;
    var clone = li.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('ul,ol'), function (x) { x.remove(); });
    var t = inlineMd(clone).trim();
    if (t) out.push(level ? '  - ' + t : (ol ? (k++) + '. ' : '- ') + t);
    Array.prototype.forEach.call(li.childNodes, function (c) {
      if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) listMd(c, level + 1, out);
    });
  });
}

function hasBlock(n) {
  return Array.prototype.some.call(n.childNodes, function (c) {
    return c.nodeType === 1 && /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|HR)$/.test(c.tagName);
  });
}

function blockMd(n, out) {
  if (n.nodeType === 3) { var tx = n.nodeValue.replace(/\*/g, '').trim(); if (tx) out.push(tx); return; }
  if (n.nodeType !== 1) return;
  var tag = n.tagName, t;
  if (n.classList && n.classList.contains('pb')) { out.push('[page]'); return; }
  if (tag === 'HR') { out.push('[page]'); return; }
  if (/^H[1-6]$/.test(tag)) {
    t = inlineMd(n).trim();
    if (t) out.push(alignOf(n) + new Array(Math.min(3, +tag.charAt(1)) + 1).join('#') + ' ' + t);
    return;
  }
  if (tag === 'UL' || tag === 'OL') { listMd(n, 0, out); return; }
  if (tag === 'TABLE') {
    var rows = Array.prototype.slice.call(n.rows);
    rows.forEach(function (r, ri) {
      var cells = Array.prototype.map.call(r.cells, function (c) { return inlineMd(c).trim().replace(/\|/g, '/'); });
      out.push('| ' + cells.join(' | ') + ' |');
      if (ri === 0 && r.cells[0] && r.cells[0].tagName === 'TH') out.push('|' + cells.map(function () { return '---'; }).join('|') + '|');
    });
    return;
  }
  if (tag === 'BLOCKQUOTE') { t = inlineMd(n).trim(); if (t) out.push('> ' + t); return; }
  if ((tag === 'DIV' || tag === 'P') && hasBlock(n)) {
    Array.prototype.forEach.call(n.childNodes, function (c) { blockMd(c, out); });
    return;
  }
  t = inlineMd(n).trim();
  if (!t) {
    var afterTable = n.previousElementSibling && n.previousElementSibling.tagName === 'TABLE';
    if ((tag === 'P' || tag === 'DIV') && !afterTable) out.push('[gap]');
    return;
  }
  out.push(alignOf(n) + t);
}

function htmlToMarkup(root) {
  var out = [];
  Array.prototype.forEach.call(root.childNodes, function (c) { blockMd(c, out); });
  while (out.length && out[out.length - 1] === '[gap]') out.pop();
  return out.join('\n');
}

function nameFrom(markup, fallback) {
  var m = markup.match(/^#\s+(.+)$/m);
  var n = m ? m[1].replace(/\*/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) : '';
  return n || fallback || 'document';
}

function mountResult() {
  $('out').innerHTML = '<button class="primary block" onclick="showEditor()">Open editor</button>';
}

function newDoc(markup, fallbackName) {
  ED = { html: markupToHtml(markup), name: nameFrom(markup, fallbackName) };
  $('out').hidden = false;
  showEditor();
}

function showEditor() {
  if (!ED) return;
  var sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = '<div class="sheet-head"><button class="x" aria-label="Close">' + XICON + '</button><input class="sheet-name" spellcheck="false"><button class="go">Download</button></div>' +
    '<div class="tbar">' +
    '<button data-c="bold"><b>B</b></button><button data-c="italic"><i>I</i></button>' +
    '<button data-c="h1">Title</button><button data-c="h2">Heading</button><button data-c="h3">Subheading</button><button data-c="p">Text</button>' +
    '<button data-c="ul">Bullets</button><button data-c="ol">Numbers</button>' +
    '<button data-c="left">Left</button><button data-c="center">Center</button><button data-c="right">Right</button>' +
    '<button data-c="table">Table</button><button data-c="pb">Page break</button>' +
    '<button data-c="undo">Undo</button><button data-c="redo">Redo</button><button data-c="view">Page view</button></div>' +
    '<div class="sheet-body ed-body"><div class="paper" contenteditable="true" spellcheck="true"></div></div>';
  var paper = sheet.querySelector('.paper'), nameIn = sheet.querySelector('.sheet-name'), tbar = sheet.querySelector('.tbar');
  paper.innerHTML = ED.html;
  nameIn.value = ED.name;
  document.body.appendChild(sheet);
  document.body.classList.add('locked');
  requestAnimationFrame(function () { sheet.classList.add('open'); });

  function save() { ED.html = paper.innerHTML; ED.name = nameIn.value.trim() || 'document'; }
  function build(kind) {
    return post('/api/' + kind, { title: '', pages: [htmlToMarkup(paper)], pageBreaks: false }).then(function (r) {
      if (!r.ok) throw new Error('Could not build the file.');
      return r.blob();
    });
  }
  function exec(c) {
    paper.focus();
    var map = {
      bold: ['bold'], italic: ['italic'], h1: ['formatBlock', '<h1>'], h2: ['formatBlock', '<h2>'], h3: ['formatBlock', '<h3>'], p: ['formatBlock', '<p>'],
      ul: ['insertUnorderedList'], ol: ['insertOrderedList'], left: ['justifyLeft'], center: ['justifyCenter'], right: ['justifyRight'], undo: ['undo'], redo: ['redo']
    };
    if (map[c]) document.execCommand(map[c][0], false, map[c][1] || null);
    else if (c === 'table') document.execCommand('insertHTML', false, '<table><tr><th>Heading</th><th>Heading</th></tr><tr><td>Text</td><td>Text</td></tr><tr><td>Text</td><td>Text</td></tr></table><p><br></p>');
    else if (c === 'pb') document.execCommand('insertHTML', false, '<div class="pb" contenteditable="false">Page break</div><p><br></p>');
    else if (c === 'view') { save(); preview({ name: ED.name, pdf: function () { return build('pdf'); }, docx: function () { return build('docx'); } }); }
  }
  tbar.addEventListener('pointerdown', function (e) { e.preventDefault(); });
  tbar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b) exec(b.getAttribute('data-c'));
  });
  paper.addEventListener('paste', function (e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  function mark() {
    ['bold', 'italic'].forEach(function (c) {
      var b = tbar.querySelector('[data-c="' + c + '"]');
      var on = false;
      try { on = document.queryCommandState(c); } catch (e) {}
      b.classList.toggle('on', on && paper.contains(document.getSelection().anchorNode));
    });
  }
  document.addEventListener('selectionchange', mark);
  sheet.querySelector('.x').onclick = function () {
    save();
    document.removeEventListener('selectionchange', mark);
    document.body.classList.remove('locked');
    sheet.classList.remove('open');
    setTimeout(function () { sheet.remove(); }, 350);
  };
  sheet.querySelector('.go').onclick = function () {
    save();
    actionSheet('Download as', [
      { label: 'PDF document', run: async function () { try { saveBlob(await build('pdf'), ED.name + '.pdf'); } catch (e) { alert(e.message); } } },
      { label: 'Word document', run: async function () { try { saveBlob(await build('docx'), ED.name + '.docx'); } catch (e) { alert(e.message); } } }
    ]);
  };
}
