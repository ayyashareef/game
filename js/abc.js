/* ABC letter-tracing game for kids. Trace the letter, collect stars, learn words! */
(function () {
  const LETTERS = [
    { c: "A", word: "Apple",      e: "🍎" },
    { c: "B", word: "Ball",       e: "⚽" },
    { c: "C", word: "Cat",        e: "🐱" },
    { c: "D", word: "Dog",        e: "🐶" },
    { c: "E", word: "Elephant",   e: "🐘" },
    { c: "F", word: "Fish",       e: "🐟" },
    { c: "G", word: "Grapes",     e: "🍇" },
    { c: "H", word: "Hat",        e: "🎩" },
    { c: "I", word: "Ice cream",  e: "🍦" },
    { c: "J", word: "Juice",      e: "🧃" },
    { c: "K", word: "Kite",       e: "🪁" },
    { c: "L", word: "Lion",       e: "🦁" },
    { c: "M", word: "Moon",       e: "🌙" },
    { c: "N", word: "Nest",       e: "🪺" },
    { c: "O", word: "Orange",     e: "🍊" },
    { c: "P", word: "Pig",        e: "🐷" },
    { c: "Q", word: "Queen",      e: "👑" },
    { c: "R", word: "Rainbow",    e: "🌈" },
    { c: "S", word: "Sun",        e: "☀️" },
    { c: "T", word: "Tree",       e: "🌳" },
    { c: "U", word: "Umbrella",   e: "☂️" },
    { c: "V", word: "Van",        e: "🚐" },
    { c: "W", word: "Watermelon", e: "🍉" },
    { c: "X", word: "Xylophone",  e: "🎼" },
    { c: "Y", word: "Yo-yo",      e: "🪀" },
    { c: "Z", word: "Zebra",      e: "🦓" },
  ];

  const SIZE = 420;
  const PEN = 7;             // the child's tracing pen
  const DETECT = 26;         // how close the pen must be to the line to "hit" it
  const FONT = '"Fredoka", "Baloo 2", system-ui, sans-serif';

  // ---- storage ----
  const KEY = "abc_trace_v1";
  let save = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  save.done = save.done || {};
  if (save.muted === undefined) save.muted = false;
  if (save.lower === undefined) save.lower = false;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  // ---- sound ----
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function beep(f, d, type, vol) {
    if (save.muted || !ac()) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "sine"; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
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

  // ---- DOM / canvas ----
  const el = (id) => document.getElementById(id);
  const canvas = el("trace");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const maskTarget = document.createElement("canvas"); maskTarget.width = maskTarget.height = SIZE;
  const mtx = maskTarget.getContext("2d", { willReadFrequently: true });
  const maskInk = document.createElement("canvas"); maskInk.width = maskInk.height = SIZE;
  const itx = maskInk.getContext("2d", { willReadFrequently: true });

  let index = 0, strokes = [], drawing = false;
  let targetPixels = null, targetCount = 0, solved = false, moveTick = 0;
  let dashDots = [];   // sub-sampled centre line -> single dashed guide

  function curChar() { return save.lower ? LETTERS[index].c.toLowerCase() : LETTERS[index].c; }

  function glyphFontSize() { return 290; }
  function glyphY() { return SIZE / 2 + glyphFontSize() * 0.04; }

  function paintGlyph(c, color) {
    c.fillStyle = color; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "700 " + glyphFontSize() + "px " + FONT;
    c.fillText(curChar(), SIZE / 2, glyphY());
  }

  /* Zhang-Suen thinning -> 1px centre-line of the letter (what we grade against) */
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
    mtx.clearRect(0, 0, SIZE, SIZE);
    paintGlyph(mtx, "#000");
    const data = mtx.getImageData(0, 0, SIZE, SIZE).data;
    const fill = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) if (data[i * 4 + 3] > 60) fill[i] = 1;
    const skel = fill.slice();
    thin(skel, SIZE, SIZE);
    targetPixels = skel; targetCount = 0;
    for (let i = 0; i < skel.length; i++) if (skel[i]) targetCount++;

    // sub-sample the centre line into evenly spaced dashes (a single dashed guide)
    const pts = [];
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        if (skel[y * SIZE + x]) pts.push({ x, y });
    dashDots = [];
    const minSq = 13 * 13;
    for (const p of pts) {
      let ok = true;
      for (const d of dashDots) { const dx = d.x - p.x, dy = d.y - p.y; if (dx * dx + dy * dy < minSq) { ok = false; break; } }
      if (ok) dashDots.push(p);
    }
  }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIZE, SIZE);
    // lined paper + dashed midline
    ctx.strokeStyle = "rgba(44,59,102,0.07)"; ctx.lineWidth = 1.5;
    for (let y = SIZE * 0.13; y < SIZE - 1; y += SIZE * 0.13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(44,59,102,0.16)"; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(SIZE * 0.08, SIZE / 2); ctx.lineTo(SIZE * 0.92, SIZE / 2); ctx.stroke(); ctx.setLineDash([]);

    // the letter guide: faint fill + a single dashed centre line
    paintGlyph(ctx, "rgba(44,59,102,0.12)");
    ctx.fillStyle = "rgba(44,59,102,0.40)";
    for (const d of dashDots) { ctx.beginPath(); ctx.arc(d.x, d.y, 2.6, 0, 7); ctx.fill(); }

    // the child's pen
    ctx.strokeStyle = "#e8513a"; ctx.lineWidth = PEN; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const st of strokes) {
      if (!st.points.length) continue;
      ctx.beginPath(); ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
      if (st.points.length === 1) ctx.lineTo(st.points[0].x + 0.1, st.points[0].y);
      ctx.stroke();
    }
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return { x: (cx - r.left) / r.width * SIZE, y: (cy - r.top) / r.height * SIZE };
  }

  function start(e) {
    if (solved) return;
    e.preventDefault(); ac();
    drawing = true; strokes.push({ points: [] }); addPoint(pos(e));
    el("hint").style.opacity = "0";
  }
  function move(e) {
    if (!drawing || solved) return;
    e.preventDefault(); addPoint(pos(e)); render();
  }
  function end() { if (!drawing) return; drawing = false; }

  function addPoint(p) {
    const st = strokes[strokes.length - 1];
    const last = st.points[st.points.length - 1];
    st.points.push(p);
    itx.strokeStyle = "#fff"; itx.lineWidth = DETECT; itx.lineCap = "round"; itx.lineJoin = "round";
    itx.beginPath(); itx.moveTo(last ? last.x : p.x, last ? last.y : p.y); itx.lineTo(p.x, p.y); itx.stroke();
  }

  function computeCoverage() {
    if (!targetPixels || !targetCount) return 0;
    const ink = itx.getImageData(0, 0, SIZE, SIZE).data;
    let covered = 0;
    for (let i = 0; i < SIZE * SIZE; i++) if (targetPixels[i] && ink[i * 4 + 3] > 40) covered++;
    return covered / targetCount;
  }

  // analyse on Next: >=90% -> 3 stars, >=50% -> 2, >=40% -> 1
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
    el("successLetter").textContent = curChar();
    const tail = stars === 0 ? "Keep practicing!" : LETTERS[index].c + " is for " + LETTERS[index].word + "!";
    el("successText").textContent = tail;
    el("success").classList.remove("hidden"); updateProgress();
  }

  function loadLetter(i) {
    index = (i + LETTERS.length) % LETTERS.length;
    strokes = []; solved = false; moveTick = 0; itx.clearRect(0, 0, SIZE, SIZE);
    el("letterName").textContent = LETTERS[index].c + " " + LETTERS[index].c.toLowerCase();
    el("letterSub").textContent = LETTERS[index].c + " is for " + LETTERS[index].word;
    el("wordEmoji").textContent = LETTERS[index].e;
    el("wordText").textContent = "";   // word shown in the subtitle ("A is for Apple")
    el("hint").style.opacity = "1"; el("success").classList.add("hidden");
    buildTarget(); render(); updateProgress();
  }

  function clearInk() {
    strokes = []; solved = false; moveTick = 0; itx.clearRect(0, 0, SIZE, SIZE);
    el("hint").style.opacity = "1"; render();
  }

  function updateProgress() {
    const bar = el("progressBar"); bar.innerHTML = "";
    LETTERS.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "dot" + (save.done[i] ? " done" : "") + (i === index ? " current" : "");
      bar.appendChild(d);
    });
  }

  function buildPicker() {
    const grid = el("pickerGrid"); grid.innerHTML = "";
    LETTERS.forEach((lv, i) => {
      const cell = document.createElement("div");
      cell.className = "picker-cell" + (save.done[i] ? " done" : "") + (i === index ? " current" : "");
      cell.innerHTML = (save.lower ? lv.c.toLowerCase() : lv.c) + (save.done[i] ? '<span class="check">✓</span>' : "");
      cell.addEventListener("click", () => { Snd.click(); el("picker").classList.add("hidden"); loadLetter(i); });
      grid.appendChild(cell);
    });
  }

  // ---- buttons ----
  el("btnPrev").addEventListener("click", () => { Snd.click(); loadLetter(index - 1); });
  el("btnNext").addEventListener("click", () => { Snd.click(); grade(); });
  el("btnClear").addEventListener("click", () => { Snd.click(); clearInk(); });
  el("btnAgain").addEventListener("click", () => { Snd.click(); clearInk(); el("success").classList.add("hidden"); });
  el("btnNext2").addEventListener("click", () => { Snd.next(); loadLetter(index + 1); });
  el("btnGrid").addEventListener("click", () => { Snd.click(); buildPicker(); el("picker").classList.remove("hidden"); });
  el("btnClosePicker").addEventListener("click", () => { Snd.click(); el("picker").classList.add("hidden"); });
  el("btnCase").addEventListener("click", () => { Snd.click(); save.lower = !save.lower; persist(); loadLetter(index); });

  const soundBtn = el("btnSound");
  function refreshSound() { soundBtn.textContent = save.muted ? "🔇" : "🔊"; }
  soundBtn.addEventListener("click", () => { save.muted = !save.muted; persist(); refreshSound(); if (!save.muted) Snd.click(); });
  refreshSound();

  canvas.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);

  // letters are drawn from authored stroke paths, so no web font is needed for the canvas
  loadLetter(0);
})();
