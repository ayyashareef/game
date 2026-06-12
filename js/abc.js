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
  const GS = 2.9, GOFF = 65; // scale + offset mapping the 0..100 stroke box to canvas
  const BODY_OUT = 34, BODY_IN = 27; // letter thickness (black then white -> hollow outline)

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
  let curStrokes = [];   // current letter's strokes, scaled to canvas coords

  function curChar() { return save.lower ? LETTERS[index].c.toLowerCase() : LETTERS[index].c; }

  // load + scale the authored strokes for the current letter/case
  function setStrokes() {
    const set = save.lower ? window.ABC_STROKES.low : window.ABC_STROKES.up;
    const key = save.lower ? LETTERS[index].c.toLowerCase() : LETTERS[index].c;
    const raw = (set && set[key]) || [];
    curStrokes = raw.map(s => s.map(p => ({ x: GOFF + p[0] * GS, y: GOFF + p[1] * GS })));
  }

  function isDot(s) {
    if (s.length < 2) return true;
    const a = s[0], b = s[s.length - 1];
    return Math.hypot(b.x - a.x, b.y - a.y) < 6;
  }

  // draw a smooth path through the stroke points
  function tracePath(c, s) {
    if (s.length === 1) { c.moveTo(s[0].x, s[0].y); c.lineTo(s[0].x + 0.1, s[0].y); return; }
    c.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
      c.quadraticCurveTo(s[i].x, s[i].y, mx, my);
    }
    const n = s.length;
    c.quadraticCurveTo(s[n - 2].x, s[n - 2].y, s[n - 1].x, s[n - 1].y);
  }

  function buildTarget() {
    // rasterize the centre lines -> the pixels the child must cover
    mtx.clearRect(0, 0, SIZE, SIZE);
    mtx.strokeStyle = "#000"; mtx.fillStyle = "#000";
    mtx.lineCap = "round"; mtx.lineJoin = "round"; mtx.lineWidth = 7;
    for (const s of curStrokes) {
      if (isDot(s)) { mtx.beginPath(); mtx.arc(s[0].x, s[0].y, 6, 0, 7); mtx.fill(); continue; }
      mtx.beginPath(); tracePath(mtx, s); mtx.stroke();
    }
    const data = mtx.getImageData(0, 0, SIZE, SIZE).data;
    targetPixels = new Uint8Array(SIZE * SIZE);
    targetCount = 0;
    for (let i = 0; i < SIZE * SIZE; i++) if (data[i * 4 + 3] > 40) { targetPixels[i] = 1; targetCount++; }
  }

  function arrowHead(a, b) {  // arrow pointing a -> b, drawn at b
    const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 15;
    ctx.fillStyle = "#1565c0";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIZE, SIZE);
    // faint lined paper + dashed midline
    ctx.strokeStyle = "rgba(70,90,150,0.07)"; ctx.lineWidth = 1.5;
    for (let y = SIZE * 0.13; y < SIZE - 1; y += SIZE * 0.13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(70,90,150,0.14)"; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(SIZE * 0.08, SIZE / 2); ctx.lineTo(SIZE * 0.92, SIZE / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // 1) hollow letter body: thick dark, then thinner white on top
    ctx.strokeStyle = "#2b2b2b"; ctx.fillStyle = "#2b2b2b"; ctx.lineWidth = BODY_OUT;
    for (const s of curStrokes) {
      if (isDot(s)) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, BODY_OUT / 2, 0, 7); ctx.fill(); continue; }
      ctx.beginPath(); tracePath(ctx, s); ctx.stroke();
    }
    ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = BODY_IN;
    for (const s of curStrokes) {
      if (isDot(s)) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, BODY_IN / 2, 0, 7); ctx.fill(); continue; }
      ctx.beginPath(); tracePath(ctx, s); ctx.stroke();
    }

    // 2) dashed centre line
    ctx.strokeStyle = "#9aa3ad"; ctx.lineWidth = 2.5; ctx.setLineDash([2, 9]);
    for (const s of curStrokes) {
      if (isDot(s)) continue;
      ctx.beginPath(); tracePath(ctx, s); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3) the child's pen
    ctx.strokeStyle = "#e8513a"; ctx.lineWidth = PEN;
    for (const st of strokes) {
      if (!st.points.length) continue;
      ctx.beginPath(); ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
      if (st.points.length === 1) ctx.lineTo(st.points[0].x + 0.1, st.points[0].y);
      ctx.stroke();
    }

    // 4) direction arrows + numbered start markers (on top)
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    curStrokes.forEach((s, i) => {
      if (!isDot(s)) arrowHead(s[s.length - 2], s[s.length - 1]);
      const a = s[0];
      ctx.fillStyle = "#1565c0"; ctx.beginPath(); ctx.arc(a.x, a.y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial, sans-serif";
      ctx.fillText(String(i + 1), a.x, a.y + 1);
    });
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
    setStrokes(); buildTarget(); render(); updateProgress();
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
