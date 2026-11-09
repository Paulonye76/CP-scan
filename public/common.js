var NAV = [
  ['index.html', 'Home'], ['reader.html', 'Photo to Document'], ['image-to-pdf.html', 'Image to PDF'],
  ['pdf-to-word.html', 'PDF to Word'], ['scanner.html', 'Scanner'], ['write.html', 'Write Document']
];
var LOGO = '<svg viewBox="0 0 48 48" fill="none"><path d="M10 17v-5a2 2 0 0 1 2-2h5M31 10h5a2 2 0 0 1 2 2v5M38 31v5a2 2 0 0 1-2 2h-5M17 38h-5a2 2 0 0 1-2-2v-5" stroke="#0b1226" stroke-width="3" stroke-linecap="round"/><text x="24" y="29.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="15" fill="#0b1226">CP</text></svg>';
var reviewPages = [];

function $(id) { return document.getElementById(id); }
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
function byName(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }

function nav() {
  var cur = location.pathname.split('/').pop() || 'index.html';
  $('nav').innerHTML = '<div class="top"><a class="brand" href="index.html"><span class="logo">' + LOGO +
    '</span><span><b>CP Scan</b><small>Scan. Convert. Done.</small></span></a></div><nav class="pills">' +
    NAV.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === cur ? ' class="on"' : '') + '>' + p[1] + '</a>';
    }).join('') + '</nav>';
  var on = document.querySelector('.pills a.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  var f = document.createElement('footer');
  f.textContent = 'CP Scan';
  document.body.appendChild(f);
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

function enhance(c, mode) {
  if (mode === 'original') return;
  var ctx = c.getContext('2d');
  var W = c.width, H = c.height, n = W * H;
  var img = ctx.getImageData(0, 0, W, H);
  var d = img.data;
  var gray = new Uint8ClampedArray(n);
  var hist = new Array(256).fill(0);
  for (var i = 0; i < n; i++) {
    var g = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) | 0;
    gray[i] = g;
    hist[g]++;
  }
  if (mode === 'document') {
    var lo = 0, hi = 255, acc = 0, v;
    for (v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
    acc = 0;
    for (v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
    if (hi - lo < 20) { lo = 0; hi = 255; }
    for (i = 0; i < n; i++) {
      var s = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / (hi - lo)));
      d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = s;
    }
  } else {
    var integ = new Uint32Array((W + 1) * (H + 1));
    for (var y = 0; y < H; y++) {
      var row = 0;
      for (var x = 0; x < W; x++) {
        row += gray[y * W + x];
        integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row;
      }
    }
    var r = Math.max(8, (W / 32) | 0);
    for (y = 0; y < H; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(H - 1, y + r);
      for (x = 0; x < W; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(W - 1, x + r);
        var sum = integ[(y1 + 1) * (W + 1) + x1 + 1] - integ[y0 * (W + 1) + x1 + 1] - integ[(y1 + 1) * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
        var mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
        var o = (gray[y * W + x] < mean * 0.88) ? 0 : 255;
        var k = 4 * (y * W + x);
        d[k] = d[k + 1] = d[k + 2] = o;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

async function transform(src, mode, rot) {
  var img = await loadImage(src);
  var c = document.createElement('canvas');
  var odd = rot % 2 === 1;
  c.width = odd ? img.height : img.width;
  c.height = odd ? img.width : img.height;
  var x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate(rot * Math.PI / 2);
  x.drawImage(img, -img.width / 2, -img.height / 2);
  enhance(c, mode);
  return c.toDataURL('image/jpeg', 0.9);
}

function Pager(box) {
  var self = { items: [], mode: 'original' };
  self.add = async function (src) {
    self.items.push({ src: src, rot: 0, out: await transform(src, self.mode, 0) });
    self.render();
  };
  self.refresh = async function () {
    for (var i = 0; i < self.items.length; i++) {
      self.items[i].out = await transform(self.items[i].src, self.mode, self.items[i].rot);
    }
    self.render();
  };
  self.render = function () {
    box.innerHTML = '';
    self.items.forEach(function (it, i) {
      var d = document.createElement('div');
      d.className = 'thumb';
      var nb = document.createElement('span');
      nb.className = 'n';
      nb.textContent = i + 1;
      d.appendChild(nb);
      var im = document.createElement('img');
      im.src = it.out;
      d.appendChild(im);
      var acts = [
        ['Up', function () { swap(i, i - 1); }],
        ['Down', function () { swap(i, i + 1); }],
        ['Rotate', async function () { it.rot = (it.rot + 1) % 4; it.out = await transform(it.src, self.mode, it.rot); self.render(); }],
        ['Remove', function () { self.items.splice(i, 1); self.render(); }]
      ];
      acts.forEach(function (a) {
        var b = document.createElement('button');
        b.textContent = a[0];
        b.onclick = a[1];
        d.appendChild(b);
      });
      box.appendChild(d);
    });
  };
  function swap(i, j) {
    if (j < 0 || j >= self.items.length) return;
    var t = self.items[i]; self.items[i] = self.items[j]; self.items[j] = t;
    self.render();
  }
  return self;
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

async function polishAll(list, kind) {
  var chunks = [], cur = '';
  list.forEach(function (p) {
    if (cur && (cur.length + p.text.length) > 8000) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + p.text;
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
      out.push({ name: 'Typed part ' + (i + 1), text: d.text });
    } catch (e) {
      out.push({ name: 'Part ' + (i + 1) + ' (not polished: ' + e.message + ')', text: chunks[i] });
    }
  }
  progress(100);
  return out;
}

function mountOutput() {
  $('out').innerHTML = '<div id="pages"></div>' +
    '<div class="bar"><label>Title (optional)</label><input type="text" id="title">' +
    '<label class="inline"><input type="checkbox" id="newpage"> Start each part on a new page</label>' +
    '<button class="primary" onclick="download(\'pdf\')">Download PDF</button>' +
    '<button class="primary" onclick="download(\'docx\')">Download Word</button>' +
    '<details><summary>Text format</summary><pre># heading\n## sub-heading\nParagraph with **bold** and *italic*\n- bullet\n  - sub bullet\n1. numbered\n&gt; italic line\n[center] centered\n[right] right aligned\n[gap]\n| a | b |\n|---|---|\n| 1 | 2 |</pre></details></div>';
}

function showPages(list) {
  reviewPages = list;
  renderPages();
  $('out').hidden = false;
}

function movePage(i, j) {
  if (j < 0 || j >= reviewPages.length) return;
  var t = reviewPages[i]; reviewPages[i] = reviewPages[j]; reviewPages[j] = t;
  renderPages();
}

function renderPages() {
  var box = $('pages');
  box.innerHTML = '';
  reviewPages.forEach(function (p, i) {
    var div = document.createElement('div');
    div.className = 'page';
    var head = document.createElement('div');
    head.className = 'head';
    head.appendChild(document.createTextNode((i + 1) + '. ' + p.name + ' '));
    [['Up', function () { movePage(i, i - 1); }], ['Down', function () { movePage(i, i + 1); }],
     ['Remove', function () { reviewPages.splice(i, 1); renderPages(); }]].forEach(function (a) {
      var b = document.createElement('button');
      b.textContent = a[0];
      b.onclick = a[1];
      head.appendChild(b);
    });
    var ta = document.createElement('textarea');
    ta.value = p.text;
    ta.oninput = function () { p.text = ta.value; };
    div.appendChild(head);
    div.appendChild(ta);
    box.appendChild(div);
  });
}

async function download(kind) {
  var title = $('title').value;
  var r = await post('/api/' + kind, {
    title: title,
    pages: reviewPages.map(function (p) { return p.text; }),
    pageBreaks: $('newpage').checked
  });
  if (!r.ok) { status('Download failed.'); return; }
  saveBlob(await r.blob(), (title || 'document') + (kind === 'pdf' ? '.pdf' : '.docx'));
}
