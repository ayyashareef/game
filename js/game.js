/* Main game: scene flow (home → map → play → win), camera, rendering & input. */
(function () {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  const WORLD_BASE = 380; // resting ground line in world coords

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- game state ----------
  let scene = "home";
  let level = null, levelIndex = 0;
  let terrain = null, bike = null;
  let cam = { x: 0, y: 0 };
  let collected = 0;
  let input = { gas: false, brake: false, jump: false };
  let last = performance.now();
  let clouds = [];

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);
  const homeScreen = el("home"), levelsScreen = el("levels"), winScreen = el("win");
  const hud = el("hud"), touch = el("touchControls");
  const starCountEl = el("starCount");

  function show(name) {
    scene = name;
    homeScreen.classList.toggle("hidden", name !== "home");
    levelsScreen.classList.toggle("hidden", name !== "levels");
    winScreen.classList.toggle("hidden", name !== "win");
    const playing = name === "play";
    hud.classList.toggle("hidden", !playing);
    touch.classList.toggle("hidden", !playing);
    if (!playing) Sound.stopEngine();
  }

  // ---------- level select ----------
  function buildLevelGrid() {
    const grid = el("levelGrid");
    grid.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const card = document.createElement("div");
      const unlocked = Storage.isUnlocked(lv.num);
      card.className = "level-card" + (unlocked ? "" : " locked");
      card.style.background = `linear-gradient(160deg, ${lv.sky[0]}, ${lv.ground})`;
      const earned = Storage.starsFor(lv.id);
      const starStr = "★★★".slice(0, earned) + "☆☆☆".slice(0, 3 - earned);
      card.innerHTML =
        `<div class="num">${lv.num}</div>` +
        `<div class="name">${lv.name}</div>` +
        `<div class="stars">${unlocked ? starStr : ""}</div>`;
      card.addEventListener("click", () => {
        if (!unlocked) { Sound.lock(); return; }
        Sound.click(); startLevel(i);
      });
      grid.appendChild(card);
    });
  }

  // ---------- start / restart ----------
  function startLevel(i) {
    levelIndex = i;
    level = LEVELS[i];
    terrain = buildTerrain(level, WORLD_BASE);
    bike = new Bike(terrain);
    collected = 0;
    cam.x = bike.cx - W * 0.35;
    cam.y = bike.cy - H * 0.55;
    makeClouds();
    updateHud();
    Sound.unlock();
    show("play");
  }

  function restart() { startLevel(levelIndex); }

  function makeClouds() {
    clouds = [];
    for (let i = 0; i < 14; i++) {
      clouds.push({
        x: Math.random() * level.length,
        y: 40 + Math.random() * 160,
        s: 0.6 + Math.random() * 0.8
      });
    }
  }

  function updateHud() {
    starCountEl.textContent = `⭐ ${collected} / ${level.stars}`;
  }

  // ---------- win ----------
  function finishLevel() {
    const ratio = collected / level.stars;
    let stars = 1;
    if (ratio >= 0.99) stars = 3;
    else if (ratio >= 0.6) stars = 2;
    Storage.completeLevel(level.num, level.id, stars);
    Sound.win();

    el("winStars").textContent = "⭐⭐⭐".slice(0, stars) + "☆☆☆".slice(0, 3 - stars);
    const msgs = ["Nice ride!", "Awesome!", "Super star!", "You're a champ!"];
    el("winMsg").textContent = collected === level.stars ? "Perfect! All stars! 🌟" : msgs[stars];
    el("winTitle").textContent = level.num === LEVELS.length ? "You finished them all! 🏆" : "You Made It! 🎉";
    const hasNext = levelIndex + 1 < LEVELS.length;
    el("btnNext").style.display = hasNext ? "" : "none";
    show("win");
  }

  // ---------- input ----------
  function bindHold(elm, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    elm.addEventListener("touchstart", down, { passive: false });
    elm.addEventListener("touchend", up);
    elm.addEventListener("touchcancel", up);
    elm.addEventListener("mousedown", down);
    elm.addEventListener("mouseup", up);
    elm.addEventListener("mouseleave", up);
  }
  bindHold(el("ctrlGo"), () => input.gas = true, () => input.gas = false);
  bindHold(el("ctrlBack"), () => input.brake = true, () => input.brake = false);
  bindHold(el("ctrlJump"), () => input.jump = true, () => input.jump = false);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowRight" || e.key === "d") input.gas = true;
    if (e.key === "ArrowLeft" || e.key === "a") input.brake = true;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") input.jump = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowRight" || e.key === "d") input.gas = false;
    if (e.key === "ArrowLeft" || e.key === "a") input.brake = false;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") input.jump = false;
  });

  // ---------- buttons ----------
  el("btnPlay").addEventListener("click", () => { Sound.unlock(); Sound.click(); buildLevelGrid(); show("levels"); });
  el("btnHome").addEventListener("click", () => { Sound.click(); show("home"); });
  el("btnMenu").addEventListener("click", () => { Sound.click(); buildLevelGrid(); show("levels"); });
  el("btnRestart").addEventListener("click", () => { Sound.click(); restart(); });
  el("btnWinMenu").addEventListener("click", () => { Sound.click(); buildLevelGrid(); show("levels"); });
  el("btnWinReplay").addEventListener("click", () => { Sound.click(); restart(); });
  el("btnNext").addEventListener("click", () => { Sound.click(); startLevel(Math.min(levelIndex + 1, LEVELS.length - 1)); });

  const muteBtn = el("btnMute");
  function refreshMute() { muteBtn.textContent = Sound.muted ? "🔇 Sound: Off" : "🔊 Sound: On"; }
  muteBtn.addEventListener("click", () => {
    const m = !Sound.muted; Sound.setMuted(m); Storage.setMuted(m); refreshMute(); if (!m) Sound.click();
  });
  refreshMute();

  // ---------- update ----------
  function update(dt) {
    if (scene !== "play") return;

    bike.update(input, dt);
    if (bike.justJumped) Sound.jump();

    // collect stars (a bit larger reach so jumps grab them easily)
    for (const s of terrain.stars) {
      if (!s.got && Math.hypot(s.x - bike.cx, s.y - bike.cy) < 56) {
        s.got = true; collected++; updateHud(); Sound.star();
      }
    }

    // engine sound
    const sp = Math.min(1, Math.abs(bike.speed) / bike.maxStep);
    Sound.engine(input.gas ? 1 : 0, sp);

    // respawn gently after a tumble
    if (bike.readyToRespawn()) {
      const safeX = Math.max(terrain.startX, bike.cx - 30);
      bike.reset(safeX, 0);
    }

    // win
    if (bike.cx >= terrain.finishX) finishLevel();

    // camera follow (smooth)
    const tx = bike.cx - W * 0.35;
    const ty = bike.cy - H * 0.55;
    cam.x += (tx - cam.x) * Math.min(1, dt * 6);
    cam.y += (ty - cam.y) * Math.min(1, dt * 4);
    cam.x = Math.max(-60, Math.min(level.length - W + 200, cam.x));
  }

  // ---------- render ----------
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (scene !== "play") return;

    drawSky();
    drawParallaxHills();
    drawClouds();
    drawGround();
    drawDecorations();
    drawStars();
    drawFinish();
    drawBike();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, level.sky[0]);
    g.addColorStop(1, level.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(W - 90, 90, 46, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,241,118,0.9)";
    ctx.beginPath(); ctx.arc(W - 90, 90, 36, 0, 7); ctx.fill();
  }

  function drawParallaxHills() {
    const layers = [
      { f: 0.25, col: shade(level.ground, 60), base: H * 0.72, amp: 70, len: 520 },
      { f: 0.45, col: shade(level.ground, 35), base: H * 0.80, amp: 55, len: 360 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        const wx = x + cam.x * L.f;
        const y = L.base + Math.sin(wx / L.len) * L.amp + Math.sin(wx / (L.len * 0.4)) * L.amp * 0.3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
  }

  function drawClouds() {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const c of clouds) {
      const x = c.x - cam.x * 0.5;
      if (x < -120 || x > W + 120) continue;
      const y = c.y;
      cloud(x, y, 26 * c.s);
    }
  }
  function cloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.arc(x + r, y + 6, r * 0.8, 0, 7);
    ctx.arc(x - r, y + 6, r * 0.8, 0, 7);
    ctx.arc(x, y + 10, r * 1.1, 0, 7);
    ctx.fill();
  }

  function worldX(x) { return x - cam.x; }
  function worldY(y) { return y - cam.y; }

  function drawGround() {
    const pts = terrain.points, dx = terrain.dx;
    // visible range
    const startX = Math.max(0, cam.x - 40);
    const endX = cam.x + W + 40;
    let i0 = Math.max(0, Math.floor(startX / dx));
    let i1 = Math.min(pts.length - 1, Math.ceil(endX / dx));

    ctx.beginPath();
    ctx.moveTo(worldX(pts[i0].x), H);
    for (let i = i0; i <= i1; i++) ctx.lineTo(worldX(pts[i].x), worldY(pts[i].y));
    ctx.lineTo(worldX(pts[i1].x), H);
    ctx.closePath();
    ctx.fillStyle = level.groundDark;
    ctx.fill();

    // top soil/grass band
    ctx.beginPath();
    ctx.moveTo(worldX(pts[i0].x), worldY(pts[i0].y));
    for (let i = i0; i <= i1; i++) ctx.lineTo(worldX(pts[i].x), worldY(pts[i].y));
    ctx.lineWidth = 14;
    ctx.strokeStyle = level.ground;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function drawDecorations() {
    // deterministic scatter of theme deco along the ground
    const spacing = 220;
    const startN = Math.floor((cam.x - 100) / spacing);
    const endN = Math.ceil((cam.x + W + 100) / spacing);
    for (let n = startN; n <= endN; n++) {
      const seed = (n * 9301 + 49297) % 233280 / 233280;
      if (seed < 0.25) continue;
      const wx = n * spacing + seed * 120;
      if (wx < 200 || wx > terrain.finishX - 80) continue;
      const gy = terrainAt(terrain.points, terrain.dx, wx);
      deco(level.deco, worldX(wx), worldY(gy), seed);
    }
  }

  function deco(type, x, y, s) {
    const sz = 0.8 + s * 0.6;
    switch (type) {
      case "flower":
        ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22 * sz); ctx.stroke();
        ctx.fillStyle = ["#e91e63", "#ff9800", "#ffeb3b", "#ba68c8"][Math.floor(s * 4) % 4];
        for (let a = 0; a < 5; a++) {
          const ang = a / 5 * 6.283;
          ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 6 * sz, y - 22 * sz + Math.sin(ang) * 6 * sz, 5 * sz, 0, 7); ctx.fill();
        }
        ctx.fillStyle = "#fff176"; ctx.beginPath(); ctx.arc(x, y - 22 * sz, 4 * sz, 0, 7); ctx.fill();
        break;
      case "tree": case "pine":
        ctx.fillStyle = "#795548"; ctx.fillRect(x - 4 * sz, y - 26 * sz, 8 * sz, 28 * sz);
        ctx.fillStyle = type === "pine" ? "#2e7d32" : "#43a047";
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(x - 26 * sz, y - 24 * sz - k * 18 * sz);
          ctx.lineTo(x + 26 * sz, y - 24 * sz - k * 18 * sz);
          ctx.lineTo(x, y - 52 * sz - k * 18 * sz);
          ctx.closePath(); ctx.fill();
        }
        break;
      case "cactus":
        ctx.fillStyle = "#388e3c";
        ctx.fillRect(x - 6 * sz, y - 44 * sz, 12 * sz, 44 * sz);
        ctx.fillRect(x - 6 * sz, y - 30 * sz, -14 * sz, 8 * sz);
        ctx.fillRect(x - 20 * sz, y - 30 * sz, 8 * sz, -16 * sz);
        ctx.fillRect(x + 6 * sz, y - 36 * sz, 12 * sz, 8 * sz);
        ctx.fillRect(x + 12 * sz, y - 50 * sz, 8 * sz, 22 * sz);
        break;
      case "rock":
        ctx.fillStyle = "#8d6e63";
        ctx.beginPath(); ctx.ellipse(x, y - 8 * sz, 20 * sz, 14 * sz, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#a1887f";
        ctx.beginPath(); ctx.ellipse(x - 4 * sz, y - 12 * sz, 11 * sz, 8 * sz, 0, 0, 7); ctx.fill();
        break;
      case "rainbow":
        const cols = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"];
        ctx.lineWidth = 5 * sz;
        cols.forEach((c, k) => {
          ctx.strokeStyle = c;
          ctx.beginPath(); ctx.arc(x, y, (24 + k * 6) * sz, Math.PI, 2 * Math.PI); ctx.stroke();
        });
        break;
    }
  }

  function drawStars() {
    const t = performance.now() / 400;
    for (const s of terrain.stars) {
      if (s.got) continue;
      const x = worldX(s.x), y = worldY(s.y) + Math.sin(t + s.x) * 5;
      if (x < -40 || x > W + 40) continue;
      drawStar(x, y, 16, "#ffd700", "#ffb300");
    }
  }

  function drawStar(x, y, R, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a2) * R * 0.45, Math.sin(a2) * R * 0.45);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = stroke; ctx.stroke();
    ctx.restore();
  }

  function drawFinish() {
    const x = worldX(terrain.finishX);
    if (x < -60 || x > W + 60) return;
    const gy = worldY(terrainAt(terrain.points, terrain.dx, terrain.finishX));
    ctx.strokeStyle = "#444"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 110); ctx.stroke();
    // checkered flag
    const fw = 46, fh = 30, fx = x, fy = gy - 110;
    const cells = 4;
    for (let r = 0; r < cells; r++)
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#fff" : "#222";
        ctx.fillRect(fx + c * fw / cells, fy + r * fh / cells, fw / cells, fh / cells);
      }
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("🏁", x + 60, gy - 80);
  }

  function drawBike() {
    const rx = worldX(bike.rear.x), ry = worldY(bike.rear.y);
    const fx = worldX(bike.front.x), fy = worldY(bike.front.y);
    const ang = bike.angle;
    const mx = (rx + fx) / 2, my = (ry + fy) / 2;

    // frame / body sits above the midpoint, perpendicular to chassis
    const nx = Math.sin(ang), ny = -Math.cos(ang); // up-normal of the chassis
    const seatX = mx + nx * 26, seatY = my + ny * 26;

    // wheels
    drawWheel(rx, ry, bike.r);
    drawWheel(fx, fy, bike.r);

    // frame
    ctx.strokeStyle = "#d32f2f"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rx, ry); ctx.lineTo(seatX, seatY);
    ctx.lineTo(fx, fy);
    ctx.moveTo(seatX, seatY); ctx.lineTo(mx + nx * 12, my + ny * 12);
    ctx.stroke();

    // handlebar
    const hbX = fx + nx * 24, hbY = fy + ny * 24;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(hbX, hbY); ctx.stroke();

    // rider
    drawRider(seatX, seatY, hbX, hbY, ang);
  }

  function drawWheel(x, y, r) {
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill();
    ctx.strokeStyle = "#bbb"; ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = bike.spin + i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = "#eee"; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
  }

  function drawRider(seatX, seatY, hbX, hbY, ang) {
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    // body
    const hipX = seatX, hipY = seatY;
    const shX = seatX + nx * 22 + Math.cos(ang) * 4;
    const shY = seatY + ny * 22 + Math.sin(ang) * 4;
    ctx.strokeStyle = "#1565c0"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(shX, shY); ctx.stroke();
    // arm to handlebar
    ctx.strokeStyle = "#42a5f5"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(hbX, hbY); ctx.stroke();
    // head + helmet
    const hX = shX + nx * 12, hY = shY + ny * 12;
    ctx.fillStyle = "#ffcc80"; ctx.beginPath(); ctx.arc(hX, hY, 9, 0, 7); ctx.fill();
    ctx.fillStyle = "#e53935";
    ctx.beginPath(); ctx.arc(hX, hY, 10, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillRect(hX - 10, hY - 1, 20, 3);
  }

  // lighten/darken hex color
  function shade(hex, amt) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
    return `rgb(${r},${g},${b})`;
  }

  // ---------- loop ----------
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // avoid big jumps
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  show("home");
})();
