function canvasOf(src, w, h) {
  var c = document.createElement('canvas');
  c.width = w || src.width;
  c.height = h || src.height;
  var x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function boxBlur(src, w, h, r) {
  var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, acc, cnt, row, add, rem;
  for (y = 0; y < h; y++) {
    acc = 0; cnt = 0; row = y * w;
    for (x = 0; x <= r && x < w; x++) { acc += src[row + x]; cnt++; }
    for (x = 0; x < w; x++) {
      tmp[row + x] = acc / cnt;
      add = x + r + 1; rem = x - r;
      if (add < w) { acc += src[row + add]; cnt++; }
      if (rem >= 0) { acc -= src[row + rem]; cnt--; }
    }
  }
  for (x = 0; x < w; x++) {
    acc = 0; cnt = 0;
    for (y = 0; y <= r && y < h; y++) { acc += tmp[y * w + x]; cnt++; }
    for (y = 0; y < h; y++) {
      out[y * w + x] = acc / cnt;
      add = y + r + 1; rem = y - r;
      if (add < h) { acc += tmp[add * w + x]; cnt++; }
      if (rem >= 0) { acc -= tmp[rem * w + x]; cnt--; }
    }
  }
  return out;
}

function maxFilter(src, w, h, r) {
  var tmp = new Uint8ClampedArray(w * h), out = new Uint8ClampedArray(w * h), x, y, k, m, p;
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    m = 0;
    for (k = -r; k <= r; k++) { p = x + k; if (p >= 0 && p < w && src[y * w + p] > m) m = src[y * w + p]; }
    tmp[y * w + x] = m;
  }
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    m = 0;
    for (k = -r; k <= r; k++) { p = y + k; if (p >= 0 && p < h && tmp[p * w + x] > m) m = tmp[p * w + x]; }
    out[y * w + x] = m;
  }
  return out;
}

function largest(mask, w, h) {
  var n = w * h, lab = new Int32Array(n), q = new Int32Array(n), id = 0, best = 0, bestN = 0, i, head, tail, cnt, k, x, y;
  for (i = 0; i < n; i++) {
    if (!mask[i] || lab[i]) continue;
    id++; cnt = 0; head = 0; tail = 0; q[tail++] = i; lab[i] = id;
    while (head < tail) {
      k = q[head++]; cnt++; x = k % w; y = (k / w) | 0;
      if (x > 0 && mask[k - 1] && !lab[k - 1]) { lab[k - 1] = id; q[tail++] = k - 1; }
      if (x < w - 1 && mask[k + 1] && !lab[k + 1]) { lab[k + 1] = id; q[tail++] = k + 1; }
      if (y > 0 && mask[k - w] && !lab[k - w]) { lab[k - w] = id; q[tail++] = k - w; }
      if (y < h - 1 && mask[k + w] && !lab[k + w]) { lab[k + w] = id; q[tail++] = k + w; }
    }
    if (cnt > bestN) { bestN = cnt; best = id; }
  }
  if (!best) return null;
  var comp = new Uint8Array(n);
  for (i = 0; i < n; i++) comp[i] = lab[i] === best ? 1 : 0;
  return comp;
}

function fillHoles(comp, w, h) {
  var n = w * h, out = new Uint8Array(n), q = new Int32Array(n), head = 0, tail = 0, i, k, x, y;
  function push(j) { if (!comp[j] && !out[j]) { out[j] = 1; q[tail++] = j; } }
  for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    k = q[head++]; x = k % w; y = (k / w) | 0;
    if (x > 0) push(k - 1);
    if (x < w - 1) push(k + 1);
    if (y > 0) push(k - w);
    if (y < h - 1) push(k + w);
  }
  for (i = 0; i < n; i++) if (!comp[i] && !out[i]) comp[i] = 1;
}

function convexHull(P) {
  P.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  var lo = [], up = [], i;
  for (i = 0; i < P.length; i++) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], P[i]) <= 0) lo.pop();
    lo.push(P[i]);
  }
  for (i = P.length - 1; i >= 0; i--) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], P[i]) <= 0) up.pop();
    up.push(P[i]);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

function bestQuad(H) {
  var n = H.length, bi = 0, bj = 1, bd = -1, i, j, dx, dy, dd;
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
    dx = H[i][0] - H[j][0]; dy = H[i][1] - H[j][1]; dd = dx * dx + dy * dy;
    if (dd > bd) { bd = dd; bi = i; bj = j; }
  }
  var A = H[bi], C = H[bj], B = null, D = null, bm = 0, dm = 0, cr;
  for (i = 0; i < n; i++) {
    cr = (C[0] - A[0]) * (H[i][1] - A[1]) - (C[1] - A[1]) * (H[i][0] - A[0]);
    if (cr > bm) { bm = cr; B = H[i]; }
    if (-cr > dm) { dm = -cr; D = H[i]; }
  }
  return B && D ? [A, B, C, D] : null;
}

function quadArea(q) {
  var a = 0, i, j;
  for (i = 0; i < 4; i++) { j = (i + 1) % 4; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; }
  return Math.abs(a) / 2;
}

function detectQuad(img) {
  var s = Math.min(1, 320 / Math.max(img.width, img.height));
  var w = Math.max(16, Math.round(img.width * s)), h = Math.max(16, Math.round(img.height * s));
  var d = canvasOf(img, w, h).getContext('2d').getImageData(0, 0, w, h).data;
  var n = w * h, g0 = new Float32Array(n), i, t;
  for (i = 0; i < n; i++) g0[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  var g = boxBlur(g0, w, h, 2);
  var hist = new Array(256).fill(0), sum = 0;
  for (i = 0; i < n; i++) hist[g[i] | 0]++;
  for (t = 0; t < 256; t++) sum += t * hist[t];
  var sumB = 0, wB = 0, best = -1, thr = 128;
  for (t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    var wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    var mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  for (var pol = 1; pol >= 0; pol--) {
    var mask = new Uint8Array(n);
    for (i = 0; i < n; i++) mask[i] = (g[i] > thr ? 1 : 0) === pol ? 1 : 0;
    var comp = largest(mask, w, h);
    if (!comp) continue;
    fillHoles(comp, w, h);
    var area = 0;
    for (i = 0; i < n; i++) area += comp[i];
    if (area < n * 0.12 || area > n * 0.97) continue;
    var pts = [], x, y, k;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      k = y * w + x;
      if (!comp[k]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !comp[k - 1] || !comp[k + 1] || !comp[k - w] || !comp[k + w]) pts.push([x, y]);
    }
    var hull = convexHull(pts);
    if (hull.length < 4) continue;
    var q = bestQuad(hull);
    if (!q || quadArea(q) < n * 0.1) continue;
    var ratio = area / quadArea(q);
    if (ratio < 0.7 || ratio > 1.3) continue;
    var cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    q.sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    var tl = 0;
    for (i = 1; i < 4; i++) if (q[i][0] + q[i][1] < q[tl][0] + q[tl][1]) tl = i;
    q = [q[tl], q[(tl + 1) % 4], q[(tl + 2) % 4], q[(tl + 3) % 4]];
    return q.map(function (p) {
      var px = p[0] + (cx - p[0]) * 0.012, py = p[1] + (cy - p[1]) * 0.012;
      return [Math.min(1, Math.max(0, px / w)), Math.min(1, Math.max(0, py / h))];
    });
  }
  return null;
}

function homography(from, to) {
  var A = [], i, x, y, u, v;
  for (i = 0; i < 4; i++) {
    x = from[i][0]; y = from[i][1]; u = to[i][0]; v = to[i][1];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  var c, r, p, t, f, k;
  for (c = 0; c < 8; c++) {
    p = c;
    for (r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    t = A[c]; A[c] = A[p]; A[p] = t;
    for (r = c + 1; r < 8; r++) {
      f = A[r][c] / A[c][c];
      for (k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  var h = new Array(8), s, j;
  for (i = 7; i >= 0; i--) {
    s = A[i][8];
    for (j = i + 1; j < 8; j++) s -= A[i][j] * h[j];
    h[i] = s / A[i][i];
  }
  return h;
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function warp(img, q, maxSide) {
  var P = q.map(function (p) { return [p[0] * img.width, p[1] * img.height]; });
  var wd = Math.max(dist(P[0], P[1]), dist(P[3], P[2])), ht = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
  var r = ht / wd, A4 = 1.4142;
  if (Math.abs(r - A4) < 0.09) ht = wd * A4;
  else if (Math.abs(1 / r - A4) < 0.09) wd = ht * A4;
  var s = Math.min(1, (maxSide || 2339) / Math.max(wd, ht));
  wd = Math.max(2, Math.round(wd * s));
  ht = Math.max(2, Math.round(ht * s));
  var H = homography([[0, 0], [wd, 0], [wd, ht], [0, ht]], P);
  var sw = img.width, sh = img.height;
  var src = canvasOf(img).getContext('2d').getImageData(0, 0, sw, sh).data;
  var out = document.createElement('canvas');
  out.width = wd; out.height = ht;
  var ctx = out.getContext('2d'), od = ctx.createImageData(wd, ht), o = od.data;
  var x, y, c, den, u, v, x0, y0, fx, fy, i00, i10, i01, i11, k;
  for (y = 0; y < ht; y++) for (x = 0; x < wd; x++) {
    den = H[6] * x + H[7] * y + 1;
    u = (H[0] * x + H[1] * y + H[2]) / den;
    v = (H[3] * x + H[4] * y + H[5]) / den;
    x0 = Math.floor(u); y0 = Math.floor(v);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x0 > sw - 2) x0 = sw - 2; if (y0 > sh - 2) y0 = sh - 2;
    fx = Math.min(1, Math.max(0, u - x0)); fy = Math.min(1, Math.max(0, v - y0));
    i00 = (y0 * sw + x0) * 4; i10 = i00 + 4; i01 = i00 + sw * 4; i11 = i01 + 4;
    k = (y * wd + x) * 4;
    for (c = 0; c < 3; c++) {
      o[k + c] = src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) + src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy;
    }
    o[k + 3] = 255;
  }
  ctx.putImageData(od, 0, 0);
  return out;
}

function rotateCanvas(c, rot) {
  if (!rot) return c;
  var odd = rot % 2 === 1, o = document.createElement('canvas');
  o.width = odd ? c.height : c.width;
  o.height = odd ? c.width : c.height;
  var x = o.getContext('2d');
  x.translate(o.width / 2, o.height / 2);
  x.rotate(rot * Math.PI / 2);
  x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

function sharpen(c, a) {
  var W = c.width, H = c.height, ctx = c.getContext('2d'), im = ctx.getImageData(0, 0, W, H), s = im.data, o = new Uint8ClampedArray(s);
  var x, y, k, ch;
  for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
    k = (y * W + x) * 4;
    for (ch = 0; ch < 3; ch++) o[k + ch] = s[k + ch] * (1 + 4 * a) - a * (s[k - 4 + ch] + s[k + 4 + ch] + s[k - W * 4 + ch] + s[k + W * 4 + ch]);
  }
  im.data.set(o);
  ctx.putImageData(im, 0, 0);
}

function skinMask(d, w, h) {
  var n = w * h, lum = new Float32Array(n), i, k;
  for (i = 0; i < n; i++) lum[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  var cut = Float32Array.from(lum).sort()[(n * 0.6) | 0], pr = 0, pg = 0, pb = 0, cn = 0;
  for (i = 0; i < n; i++) if (lum[i] >= cut) { pr += d[4 * i]; pg += d[4 * i + 1]; pb += d[4 * i + 2]; cn++; }
  pr = pr / cn || 1; pg = pg / cn || 1; pb = pb / cn || 1;
  var m = new Uint8Array(n), cnt = 0, rr, gg, bb;
  for (i = 0; i < n; i++) {
    rr = d[4 * i] / pr; gg = d[4 * i + 1] / pg; bb = d[4 * i + 2] / pb;
    if (rr > 0.35 && rr < 1.0 && rr - gg > 0.04 && rr - gg < 0.5 && gg - bb > 0.04 && rr - bb > 0.2 && rr - bb < 0.75) { m[i] = 1; cnt++; }
  }
  if (cnt < n * 0.004) return null;
  var lab = new Uint8Array(n), q = new Int32Array(n), keep = new Uint8Array(n), kept = 0, head, tail, x, y, touch, e;
  for (i = 0; i < n; i++) {
    if (!m[i] || lab[i]) continue;
    head = 0; tail = 0; q[tail++] = i; lab[i] = 1; touch = false;
    while (head < tail) {
      k = q[head++]; x = k % w; y = (k / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
      if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = 1; q[tail++] = k - 1; }
      if (x < w - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = 1; q[tail++] = k + 1; }
      if (y > 0 && m[k - w] && !lab[k - w]) { lab[k - w] = 1; q[tail++] = k - w; }
      if (y < h - 1 && m[k + w] && !lab[k + w]) { lab[k + w] = 1; q[tail++] = k + w; }
    }
    if (touch && tail >= n * 0.003) { for (e = 0; e < tail; e++) keep[q[e]] = 1; kept += tail; }
  }
  if (!kept || kept > n * 0.4) return null;
  return maxFilter(keep, w, h, 2);
}

function despeckle(c, maxA, faint) {
  var W = c.width, H = c.height, ctx = c.getContext('2d'), im = ctx.getImageData(0, 0, W, H), d = im.data, n = W * H;
  var dark = new Uint8Array(n), seen = new Uint8Array(n), q = new Int32Array(n), i, j, k, x, y, head, tail, dx, dy, nx, ny, nk, mn, changed = false;
  for (i = 0; i < n; i++) dark[i] = d[4 * i + 1] < 150 ? 1 : 0;
  for (i = 0; i < n; i++) {
    if (!dark[i] || seen[i]) continue;
    head = 0; tail = 0; q[tail++] = i; seen[i] = 1; mn = 255;
    while (head < tail) {
      k = q[head++]; x = k % W; y = (k / W) | 0;
      if (d[4 * k + 1] < mn) mn = d[4 * k + 1];
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        nx = x + dx; ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        nk = ny * W + nx;
        if (dark[nk] && !seen[nk]) { seen[nk] = 1; q[tail++] = nk; }
      }
    }
    if (tail <= maxA || (faint && tail <= faint && mn > 90)) {
      for (j = 0; j < tail; j++) { k = q[j]; d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = 255; }
      changed = true;
    }
  }
  if (changed) ctx.putImageData(im, 0, 0);
}

function autoDeskew(c) {
  var sc0 = Math.min(1, 700 / Math.max(c.width, c.height));
  var w = Math.max(8, Math.round(c.width * sc0)), h = Math.max(8, Math.round(c.height * sc0));
  var d = canvasOf(c, w, h).getContext('2d').getImageData(0, 0, w, h).data, xs = [], ys = [], i;
  for (i = 0; i < w * h; i++) if (d[4 * i + 1] < 140) { xs.push(i % w); ys.push((i / w) | 0); }
  if (xs.length < 200) return c;
  function score(a) {
    var cs = Math.cos(a), sn = Math.sin(a), bins = new Float32Array(h + 2 * w + 4), j, sum = 0;
    for (j = 0; j < xs.length; j++) bins[Math.round(ys[j] * cs - xs[j] * sn) + w]++;
    for (j = 0; j < bins.length; j++) sum += bins[j] * bins[j];
    return sum;
  }
  var best = 0, bs = -1, a, v;
  for (a = -4; a <= 4; a += 0.5) { v = score(a * Math.PI / 180); if (v > bs) { bs = v; best = a; } }
  var fine = best;
  for (a = best - 0.5; a <= best + 0.5; a += 0.1) { v = score(a * Math.PI / 180); if (v > bs) { bs = v; fine = a; } }
  if (Math.abs(fine) < 0.25) return c;
  var o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  var x = o.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, o.width, o.height);
  x.translate(o.width / 2, o.height / 2);
  x.rotate(-fine * Math.PI / 180);
  x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

function cleanCanvas(c, mode, fix) {
  if (!mode || mode === 'original') return;
  var W = c.width, H = c.height, ctx = c.getContext('2d');
  var sw = Math.max(24, Math.round(W / 8)), sh = Math.max(24, Math.round(H / 8));
  var sm = canvasOf(c, sw, sh), smx = sm.getContext('2d'), sd = smx.getImageData(0, 0, sw, sh);
  var skin = fix ? skinMask(sd.data, sw, sh) : null;
  var r = Math.max(3, Math.round(sw / 40)), ch, i, pl, bl;
  for (ch = 0; ch < 3; ch++) {
    pl = new Uint8ClampedArray(sw * sh);
    for (i = 0; i < sw * sh; i++) pl[i] = sd.data[4 * i + ch];
    pl = maxFilter(pl, sw, sh, r);
    bl = boxBlur(pl, sw, sh, r);
    for (i = 0; i < sw * sh; i++) sd.data[4 * i + ch] = bl[i];
  }
  smx.putImageData(sd, 0, 0);
  var bg = canvasOf(sm, W, H).getContext('2d').getImageData(0, 0, W, H).data;
  var im = ctx.getImageData(0, 0, W, H), d = im.data, k, a, b, e, l, x, y, sy;
  var scan = mode === 'scan', lo = scan ? 75 : 40, span = scan ? 120 : 192;
  var lut = new Uint8ClampedArray(256);
  for (i = 0; i < 256; i++) lut[i] = scan ? 255 * Math.pow(i / 255, 1.3) : i;
  for (y = 0; y < H; y++) {
    sy = Math.min(sh - 1, (y * sh / H) | 0) * sw;
    for (x = 0; x < W; x++) {
      k = 4 * (y * W + x);
      if (skin && skin[sy + Math.min(sw - 1, (x * sw / W) | 0)]) { d[k] = d[k + 1] = d[k + 2] = 255; continue; }
      a = (d[k] * 255 / Math.max(bg[k], 30) - lo) * 255 / span;
      b = (d[k + 1] * 255 / Math.max(bg[k + 1], 30) - lo) * 255 / span;
      e = (d[k + 2] * 255 / Math.max(bg[k + 2], 30) - lo) * 255 / span;
      if (mode === 'magic') { d[k] = a; d[k + 1] = b; d[k + 2] = e; }
      else {
        l = 0.299 * a + 0.587 * b + 0.114 * e;
        if (mode === 'bw') l = (l - 120) * 255 / 65;
        else if (scan) l = lut[l < 0 ? 0 : l > 255 ? 255 : l | 0];
        d[k] = d[k + 1] = d[k + 2] = l;
      }
    }
  }
  ctx.putImageData(im, 0, 0);
  if (mode !== 'bw') sharpen(c, scan ? 0.8 : 0.5);
  despeckle(c, Math.min(30, Math.max(3, Math.round(W * H / 250000))), fix && (scan || mode === 'gray') ? 2500 : 0);
}

function Pager(box, opts) {
  opts = opts || {};
  var self = { items: [], mode: opts.mode || 'original', auto: !!opts.auto, fix: !!opts.fix };

  async function build(it) {
    var img = await loadImage(it.src);
    var c = it.quad ? warp(img, it.quad, opts.maxSide || 3000) : canvasOf(img);
    c = rotateCanvas(c, it.rot);
    cleanCanvas(c, self.mode, self.fix);
    if (self.mode !== 'original') c = autoDeskew(c);
    it.out = c.toDataURL('image/jpeg', 0.92);
  }

  self.add = async function (src) {
    var it = { src: src, rot: 0, quad: null };
    if (self.auto) it.quad = detectQuad(await loadImage(src));
    await build(it);
    self.items.push(it);
    self.render();
  };

  self.refresh = async function () {
    for (var i = 0; i < self.items.length; i++) {
      status('Updating page ' + (i + 1) + ' of ' + self.items.length + '...');
      await tick();
      await build(self.items[i]);
    }
    status('');
    self.render();
  };

  function swap(i, j) {
    if (j < 0 || j >= self.items.length) return;
    var t = self.items[i]; self.items[i] = self.items[j]; self.items[j] = t;
    self.render();
  }

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
      [
        ['Crop', function () {
          cropEditor(it, async function () {
            status('Updating page...');
            await tick();
            await build(it);
            status('');
            self.render();
          });
        }],
        ['Rotate', async function () { it.rot = (it.rot + 1) % 4; await build(it); self.render(); }],
        ['Up', function () { swap(i, i - 1); }],
        ['Down', function () { swap(i, i + 1); }],
        ['Remove', function () { self.items.splice(i, 1); self.render(); }]
      ].forEach(function (a) {
        var b = document.createElement('button');
        b.textContent = a[0];
        b.onclick = a[1];
        d.appendChild(b);
      });
      box.appendChild(d);
    });
  };
  return self;
}

async function cropEditor(it, done) {
  var img = await loadImage(it.src);
  var q = (it.quad || [[0, 0], [1, 0], [1, 1], [0, 1]]).map(function (p) { return p.slice(); });
  var sheet = document.createElement('div');
  sheet.className = 'sheet over';
  sheet.innerHTML = '<div class="sheet-head"><button class="x" aria-label="Close">' + XICON + '</button><div class="sheet-title">Crop</div><button class="go">Done</button></div>' +
    '<div class="crop-stage"><div class="crop-box"><img><svg viewBox="0 0 1 1" preserveAspectRatio="none"><polygon></polygon></svg></div></div>' +
    '<div class="crop-foot"><button class="auto">Auto detect</button><button class="reset">Full page</button></div>';
  sheet.querySelector('img').src = it.src;
  document.body.appendChild(sheet);
  requestAnimationFrame(function () { sheet.classList.add('open'); });
  var box = sheet.querySelector('.crop-box'), poly = sheet.querySelector('polygon'), handles = [];
  function draw() {
    poly.setAttribute('points', q.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
    handles.forEach(function (h, i) { h.style.left = q[i][0] * 100 + '%'; h.style.top = q[i][1] * 100 + '%'; });
  }
  q.forEach(function (p, i) {
    var h = document.createElement('div');
    h.className = 'handle';
    h.onpointerdown = function (e) {
      h.setPointerCapture(e.pointerId);
      h.onpointermove = function (ev) {
        var r = box.getBoundingClientRect();
        q[i] = [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
        draw();
      };
      h.onpointerup = function () { h.onpointermove = null; };
    };
    box.appendChild(h);
    handles.push(h);
  });
  draw();
  function close() {
    sheet.classList.remove('open');
    setTimeout(function () { sheet.remove(); }, 350);
  }
  sheet.querySelector('.x').onclick = close;
  sheet.querySelector('.go').onclick = function () { it.quad = q; close(); done(); };
  sheet.querySelector('.auto').onclick = function () {
    var f = detectQuad(img);
    if (f) { q = f; draw(); } else { alert('No page edges found. Drag the corners by hand.'); }
  };
  sheet.querySelector('.reset').onclick = function () { q = [[0, 0], [1, 0], [1, 1], [0, 1]]; draw(); };
}
