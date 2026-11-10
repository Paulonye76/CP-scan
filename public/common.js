var LOGO = '<svg viewBox="0 0 48 48" fill="none"><path d="M10 17v-5a2 2 0 0 1 2-2h5M31 10h5a2 2 0 0 1 2 2v5M38 31v5a2 2 0 0 1-2 2h-5M17 38h-5a2 2 0 0 1-2-2v-5" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><text x="24" y="29.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="15" fill="#ffffff">CP</text></svg>';
var ICONS = {
  scanner: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  photo: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><circle cx="10" cy="12" r="1.4"/><path d="M8 19l3-3 2 2 2-2 2 2"/>',
  word: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  write: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'
};
var NAV = [
  ['scanner.html', 'Scanner', 'scanner'], ['reader.html', 'Photo', 'photo'], ['image-to-pdf.html', 'To PDF', 'pdf'],
  ['pdf-to-word.html', 'To Word', 'word'], ['write.html', 'Write', 'write']
];
var XICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
var DLICON = '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>';

function $(id) { return document.getElementById(id); }
function byName(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

function status(t) {
  var s = $('status');
  s.textContent = t;
  s.classList.toggle('busy', /\.\.\.$/.test(t));
}

function progress(p) {
  var b = document.querySelector('.pbar');
  if (!b) return;
  b.classList.toggle('on', p > 0 && p < 100);
  $('pfill').style.width = p + '%';
}

function nav() {
  var cur = location.pathname.split('/').pop() || 'index.html';
  $('nav').innerHTML = '<div class="top"><a class="brand" href="index.html"><span class="logo">' + LOGO + '</span><b>CP Scan</b></a></div>';
  var t = document.createElement('nav');
  t.className = 'tabs';
  t.innerHTML = NAV.map(function (p) {
    return '<a href="' + p[0] + '"' + (p[0] === cur ? ' class="on"' : '') + '><svg viewBox="0 0 24 24">' + ICONS[p[2]] + '</svg><span>' + p[1] + '</span></a>';
  }).join('');
  document.body.appendChild(t);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-code': localStorage.getItem('cpcode') || '' },
    body: JSON.stringify(body)
  }).then(function (r) {
    if (r.status !== 401) return r;
    var c = prompt('Enter the access code');
    if (!c) return r;
    localStorage.setItem('cpcode', c);
    return post(url, body);
  });
}

function saveBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function loadImage(src) {
  return new Promise(function (ok, no) {
    var i = new Image();
    i.onload = function () { ok(i); };
    i.onerror = no;
    i.src = src;
  });
}

async function fileToDataUrl(file, maxSide, q) {
  var bmp = await createImageBitmap(file);
  var s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  var c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function shrinkData(src, maxSide, q) {
  var img = await loadImage(src);
  var s = Math.min(1, maxSide / Math.max(img.width, img.height));
  var c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function readImages(images, mode) {
  var out = [];
  for (var i = 0; i < images.length; i++) {
    status('Reading page ' + (i + 1) + ' of ' + images.length + '...');
    progress((i / images.length) * 100);
    try {
      var r = await post('/api/read', { image: images[i], mode: mode });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error);
      out.push(d.text);
    } catch (e) {
      out.push('[FAILED: ' + e.message + ']');
    }
  }
  progress(100);
  return out;
}

async function polishAll(texts, kind) {
  var chunks = [], cur = '';
  texts.forEach(function (t) {
    if (cur && (cur.length + t.length) > 8000) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + t;
  });
  if (cur) chunks.push(cur);
  var out = [];
  for (var i = 0; i < chunks.length; i++) {
    status('Typing up part ' + (i + 1) + ' of ' + chunks.length + '...');
    progress((i / chunks.length) * 100);
    try {
      var r = await post('/api/polish', { text: chunks[i], kind: kind });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error);
      out.push(d.text);
    } catch (e) {
      out.push(chunks[i]);
    }
  }
  progress(100);
  return out;
}

function ensurePdfjs() {
  return new Promise(function (ok, no) {
    if (window.pdfjsLib) return ok();
    var s = document.createElement('script');
    s.src = '/vendor/pdfjs/pdf.min.js';
    s.onload = function () { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; ok(); };
    s.onerror = function () { no(new Error('Preview library did not load.')); };
    document.head.appendChild(s);
  });
}

function actionSheet(title, items) {
  var a = document.createElement('div');
  a.className = 'actions';
  var html = '<div class="actions-box"><div class="actions-group"><div class="actions-title"></div>';
  items.forEach(function (it, i) { html += '<button data-i="' + i + '">' + it.label + '</button>'; });
  html += '</div><div class="actions-group"><button data-i="x" class="cancel">Cancel</button></div></div>';
  a.innerHTML = html;
  a.querySelector('.actions-title').textContent = title;
  document.body.appendChild(a);
  requestAnimationFrame(function () { a.classList.add('open'); });
  a.onclick = function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-i');
    if (!k && e.target !== a) return;
    a.remove();
    if (k && k !== 'x') items[+k].run();
  };
}

async function preview(o) {
  var sheet = document.createElement('div');
  sheet.className = 'sheet over';
  sheet.innerHTML = '<div class="sheet-head"><button class="x" aria-label="Close">' + XICON + '</button><div class="sheet-title"></div><span class="sp"></span></div>' +
    '<div class="sheet-body"><div class="sheet-wait"><i class="spin"></i><span>Preparing preview...</span></div></div>' +
    '<div class="sheet-foot"><button class="dl" disabled>' + DLICON + 'Download</button></div>';
  sheet.querySelector('.sheet-title').textContent = o.name + '.pdf';
  document.body.appendChild(sheet);
  requestAnimationFrame(function () { sheet.classList.add('open'); });
  sheet.querySelector('.x').onclick = function () {
    sheet.classList.remove('open');
    setTimeout(function () { sheet.remove(); }, 350);
  };
  var body = sheet.querySelector('.sheet-body'), dl = sheet.querySelector('.dl');
  try {
    var blob = await o.pdf();
    await ensurePdfjs();
    var pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
    body.innerHTML = '';
    var w = Math.min(body.clientWidth - 20, 860), dpr = window.devicePixelRatio || 1;
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var v1 = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: (w / v1.width) * dpr });
      var c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      c.style.width = w + 'px';
      c.style.height = Math.round(vp.height / dpr) + 'px';
      body.appendChild(c);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
    var n = document.createElement('div');
    n.className = 'sheet-count';
    n.textContent = pdf.numPages + (pdf.numPages === 1 ? ' page' : ' pages');
    body.appendChild(n);
    dl.disabled = false;
    dl.onclick = function () {
      if (!o.docx) { saveBlob(blob, o.name + '.pdf'); return; }
      actionSheet('Download as', [
        { label: 'PDF document', run: function () { saveBlob(blob, o.name + '.pdf'); } },
        { label: 'Word document', run: async function () { try { saveBlob(await o.docx(), o.name + '.docx'); } catch (e) {} } }
      ]);
    };
  } catch (e) {
    body.innerHTML = '';
    var m = document.createElement('div');
    m.className = 'sheet-wait';
    m.textContent = 'Could not build the preview. ' + (e.message || '');
    body.appendChild(m);
  }
}
