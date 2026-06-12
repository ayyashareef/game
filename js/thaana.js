/* Thaana (Haa Shaviyani) letter-tracing game for kids.
   Trace over the faint letter; when enough of it is covered, you win stars! */
(function () {
  // ---- the 24 base Thaana letters in alphabet order ----
  const LETTERS = [
    { c: "ހ", name: "Haa",        s: "h"  },
    { c: "ށ", name: "Shaviyani",  s: "sh" },
    { c: "ނ", name: "Noonu",      s: "n"  },
    { c: "ރ", name: "Raa",        s: "r"  },
    { c: "ބ", name: "Baa",        s: "b"  },
    { c: "ޅ", name: "Lhaviyani",  s: "lh" },
    { c: "ކ", name: "Kaafu",      s: "k"  },
    { c: "އ", name: "Alifu",      s: "a"  },
    { c: "ވ", name: "Vaavu",      s: "v"  },
    { c: "މ", name: "Meemu",      s: "m"  },
    { c: "ފ", name: "Faafu",      s: "f"  },
    { c: "ދ", name: "Dhaalu",     s: "dh" },
    { c: "ތ", name: "Thaa",       s: "th" },
    { c: "ލ", name: "Laamu",      s: "l"  },
    { c: "ގ", name: "Gaafu",      s: "g"  },
    { c: "ޏ", name: "Gnaviyani",  s: "gn" },
    { c: "ސ", name: "Seenu",      s: "s"  },
    { c: "ޑ", name: "Daviyani",   s: "d"  },
    { c: "ޒ", name: "Zaviyani",   s: "z"  },
    { c: "ޓ", name: "Taviyani",   s: "t"  },
    { c: "ޔ", name: "Yaa",        s: "y"  },
    { c: "ޕ", name: "Paviyani",   s: "p"  },
    { c: "ޖ", name: "Javiyani",   s: "j"  },
    { c: "ޗ", name: "Chaviyani",  s: "ch" },
  ];

  const SIZE = 420;
  const FONT = '"Faruma", "Noto Sans Thaana", "MV Boli", sans-serif';
  const PEN = 7;             // the child's tracing pen
  const DETECT = 26;         // how close the pen must be to the line to "hit" it
  const DOT_GAP = 13;        // spacing of the dashed centre-line dots
  const DOT_R = 3;           // centre-line dot radius
  const END_R = 9;           // big start/end dot radius

  // ---- tiny storage ----
  const KEY = "thaana_trace_v1";
  let save = (() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  })();
  save.done = save.done || {};
  if (save.muted === undefined) save.muted = false;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  // ---- tiny sound ----
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function beep(f, d, type, vol) {
    if (save.muted || !ac()) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.start(t); o.stop(t + d + 0.02);
  }
  const Snd = {
    click() { beep(660, 0.08, "square", 0.18); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, "triangle", 0.28), i * 120)); },
    next() { beep(880, 0.1, "sine", 0.22); },
  };

  // ---- DOM ----
  const el = (id) => document.getElementById(id);
  const canvas = el("trace");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // offscreen layers
  const maskTarget = document.createElement("canvas"); maskTarget.width = maskTarget.height = SIZE;
  const mtx = maskTarget.getContext("2d", { willReadFrequently: true });
  const maskInk = document.createElement("canvas"); maskInk.width = maskInk.height = SIZE;
  const itx = maskInk.getContext("2d", { willReadFrequently: true });

  let index = 0;
  let strokes = [];            // [{points:[{x,y}]}]
  let drawing = false;
  let targetPixels = null;     // Uint8Array — the dotted skeleton we must trace
  let targetCount = 0;
  let skelDots = [];           // skeleton points -> the blue centre line to trace
  let endDots = [];            // skeleton endpoints -> the big start/end dots
  let solved = false;
  let moveTick = 0;
  let fontReady = false;
  let vOff = 0;                 // vertical offset so each letter is centred on the midline

  // ---- glyph rendering ----
  function glyphFontSize() { return 300; }

  function paintGlyph(c, color) {
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "700 " + glyphFontSize() + "px " + FONT;
    c.fillText(LETTERS[index].c, SIZE / 2, SIZE / 2 + vOff);
  }
  function drawGlyph(c, color) {
    c.clearRect(0, 0, SIZE, SIZE);
    paintGlyph(c, color);
  }

  /* Zhang-Suen thinning: reduce the filled letter to a 1px centre-line ("skeleton"). */
  function thin(g, w, h) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : g[y * w + x];
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        const rem = [];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            if (!g[y * w + x]) continue;
            const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1),
                  p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let A = 0;
            for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
            if (A !== 1) continue;
            if (step === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; }
            else { if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue; }
            rem.push(y * w + x);
          }
        }
        if (rem.length) { changed = true; for (const i of rem) g[i] = 0; }
      }
    }
    return g;
  }

  function buildTarget() {
    // pass 1: draw at centre, measure the letter's vertical bounds
    vOff = 0;
    drawGlyph(mtx, "#000");
    let data = mtx.getImageData(0, 0, SIZE, SIZE).data;
    let minY = SIZE, maxY = 0, any = false;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (data[(y * SIZE + x) * 4 + 3] > 60) { any = true; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (any) vOff = Math.round(SIZE / 2 - (minY + maxY) / 2);

    // pass 2: redraw centred, then build the mask from that
    drawGlyph(mtx, "#000");
    data = mtx.getImageData(0, 0, SIZE, SIZE).data;
    const fill = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) if (data[i * 4 + 3] > 60) fill[i] = 1;

    // skeleton = the dotted centre-line the child traces
    const skel = fill.slice();
    thin(skel, SIZE, SIZE);

    targetPixels = skel;
    targetCount = 0;
    for (let i = 0; i < skel.length; i++) if (skel[i]) targetCount++;

    // collect skeleton points, then keep only ones spaced >= DOT_GAP apart
    // (even spacing -> clean dotted line instead of a messy cluster)
    const pts = [];
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (skel[y * SIZE + x]) pts.push({ x, y });

    skelDots = [];
    const minSq = DOT_GAP * DOT_GAP;
    for (const p of pts) {
      let ok = true;
      for (const d of skelDots) {
        const dx = d.x - p.x, dy = d.y - p.y;
        if (dx * dx + dy * dy < minSq) { ok = false; break; }
      }
      if (ok) skelDots.push(p);
    }

    // endpoints = skeleton pixels with a single neighbour (the start/end of strokes)
    const isSkel = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE) ? 0 : skel[y * SIZE + x];
    const ends = [];
    for (const p of pts) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (!(dx === 0 && dy === 0)) n += isSkel(p.x + dx, p.y + dy);
      if (n === 1) ends.push(p);
    }
    // keep endpoints that are well separated, so we get clean single dots
    endDots = [];
    for (const p of ends) {
      let ok = true;
      for (const d of endDots) {
        const dx = d.x - p.x, dy = d.y - p.y;
        if (dx * dx + dy * dy < 30 * 30) { ok = false; break; }
      }
      if (ok) endDots.push(p);
    }
  }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIZE, SIZE);
    // lined paper
    ctx.strokeStyle = "rgba(44,59,102,0.07)"; ctx.lineWidth = 1.5;
    for (let y = SIZE * 0.13; y < SIZE - 1; y += SIZE * 0.13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke(); }

    // the letter guide: faint fill + a single dashed centre line
    paintGlyph(ctx, "rgba(44,59,102,0.12)");
    ctx.fillStyle = "rgba(44,59,102,0.40)";
    for (const d of skelDots) { ctx.beginPath(); ctx.arc(d.x, d.y, 2.6, 0, 7); ctx.fill(); }

    // the child's pen
    ctx.strokeStyle = "#e8513a"; ctx.lineWidth = PEN;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const st of strokes) {
      if (st.points.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
      if (st.points.length === 1) ctx.lineTo(st.points[0].x + 0.1, st.points[0].y);
      ctx.stroke();
    }
  }

  // ---- pointer handling ----
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return { x: (cx - r.left) / r.width * SIZE, y: (cy - r.top) / r.height * SIZE };
  }

  function start(e) {
    if (solved) return;
    e.preventDefault(); ac();
    drawing = true;
    strokes.push({ points: [] });
    addPoint(pos(e));
    el("hint").style.opacity = "0";
  }
  function move(e) {
    if (!drawing || solved) return;
    e.preventDefault();
    addPoint(pos(e));
    render();
  }
  function end() {
    if (!drawing) return;
    drawing = false;
  }

  function addPoint(p) {
    const st = strokes[strokes.length - 1];
    const last = st.points[st.points.length - 1];
    st.points.push(p);
    // stamp onto ink mask at the detection width (a little fatter than the visible pen)
    itx.strokeStyle = "#fff"; itx.lineWidth = DETECT;
    itx.lineCap = "round"; itx.lineJoin = "round";
    itx.beginPath();
    if (last) itx.moveTo(last.x, last.y); else itx.moveTo(p.x, p.y);
    itx.lineTo(p.x, p.y); itx.stroke();
  }

  // how much of the dotted line did the pen cover? (0..1)
  function computeCoverage() {
    if (!targetPixels || targetCount === 0) return 0;
    const ink = itx.getImageData(0, 0, SIZE, SIZE).data;
    let covered = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (targetPixels[i] && ink[i * 4 + 3] > 40) covered++;
    }
    return covered / targetCount;
  }

  // analyse the trace and award stars: >=90% -> 3, >=50% -> 2, >=40% -> 1
  function grade() {
    if (strokes.length === 0) { loadLetter(index + 1); return; }
    const coverage = computeCoverage();
    let stars = 0;
    if (coverage >= 0.9) stars = 3;
    else if (coverage >= 0.5) stars = 2;
    else if (coverage >= 0.4) stars = 1;

    solved = true;
    if (stars > 0) { save.done[index] = Math.max(save.done[index] || 0, stars); persist(); Snd.win(); }
    else Snd.click();

    document.querySelector(".success-stars").textContent = "⭐⭐⭐".slice(0, stars) + "☆☆☆".slice(0, 3 - stars);
    el("successLetter").textContent = LETTERS[index].c;
    const msg = stars === 3 ? "Perfect! 🌟" : stars === 2 ? "Great job!" : stars === 1 ? "Good try!" : "Keep practicing!";
    el("successText").textContent = LETTERS[index].name + " — " + msg;
    el("success").classList.remove("hidden");
    updateProgress();
  }

  // ---- navigation ----
  function loadLetter(i) {
    index = (i + LETTERS.length) % LETTERS.length;
    strokes = [];
    solved = false;
    moveTick = 0;
    itx.clearRect(0, 0, SIZE, SIZE);
    el("letterName").textContent = LETTERS[index].name;
    el("letterSub").textContent = 'Sound: "' + LETTERS[index].s + '"  •  Trace it!';
    el("bigLetter").textContent = LETTERS[index].c;
    el("hint").style.opacity = "1";
    el("success").classList.add("hidden");
    buildTarget();
    render();
    updateProgress();
  }

  function clearInk() {
    strokes = []; solved = false; moveTick = 0;
    itx.clearRect(0, 0, SIZE, SIZE);
    el("hint").style.opacity = "1";
    render();
  }

  // ---- progress UI ----
  function updateProgress() {
    const bar = el("progressBar");
    bar.innerHTML = "";
    LETTERS.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "dot" + (save.done[i] ? " done" : "") + (i === index ? " current" : "");
      bar.appendChild(d);
    });
  }

  function buildPicker() {
    const grid = el("pickerGrid");
    grid.innerHTML = "";
    LETTERS.forEach((lv, i) => {
      const cell = document.createElement("div");
      cell.className = "picker-cell thaana-font" + (save.done[i] ? " done" : "") + (i === index ? " current" : "");
      cell.innerHTML = lv.c + (save.done[i] ? '<span class="check">✓</span>' : "");
      cell.addEventListener("click", () => {
        Snd.click(); el("picker").classList.add("hidden"); loadLetter(i);
      });
      grid.appendChild(cell);
    });
  }

  // ---- wire buttons ----
  el("btnPrev").addEventListener("click", () => { Snd.click(); loadLetter(index - 1); });
  el("btnNext").addEventListener("click", () => { Snd.click(); grade(); });
  el("btnClear").addEventListener("click", () => { Snd.click(); clearInk(); });
  el("btnAgain").addEventListener("click", () => { Snd.click(); clearInk(); el("success").classList.add("hidden"); });
  el("btnNext2").addEventListener("click", () => { Snd.next(); loadLetter(index + 1); });
  el("btnGrid").addEventListener("click", () => { Snd.click(); buildPicker(); el("picker").classList.remove("hidden"); });
  el("btnClosePicker").addEventListener("click", () => { Snd.click(); el("picker").classList.add("hidden"); });

  const soundBtn = el("btnSound");
  function refreshSound() { soundBtn.textContent = save.muted ? "🔇" : "🔊"; }
  soundBtn.addEventListener("click", () => { save.muted = !save.muted; persist(); refreshSound(); if (!save.muted) Snd.click(); });
  refreshSound();

  // pointer + touch events
  canvas.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);

  // ---- boot (wait for the Thaana font so the mask is correct) ----
  function boot() {
    loadLetter(0);
  }
  if (document.fonts && document.fonts.load) {
    const glyphs = LETTERS.map(l => l.c).join("");
    Promise.all([
      document.fonts.load('700 300px "Faruma"', glyphs).catch(() => {}),
      document.fonts.load('700 300px "Noto Sans Thaana"', glyphs).catch(() => {}),
      document.fonts.ready
    ]).then(() => { fontReady = true; boot(); }).catch(boot);
    // fallback in case the font never resolves
    setTimeout(() => { if (!fontReady) { fontReady = true; boot(); } }, 2500);
  } else {
    boot();
  }
})();
