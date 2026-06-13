/* bike.js — Mountain Bike: pick a trail, ride bumpy hills, JUMP for stars, do flips! */
(function () {
  const BIKE_SCREEN_X = 0.26;
  const SPEED = 360;             // px / second
  const GRAV = 2400;             // gravity for the jump
  const JUMP_V = 1020;           // jump strength (~215px high)
  const FLIP_SPEED = 520;        // deg/s spin in the air

  const LEVELS = [
    { name: 'Sunny Hills',  len: 6000,  amp: 0.9,  bump: 0.6, stars: 6,  phase: 0.0,
      sky: 'linear-gradient(180deg,#aee4ff,#e8f7ff)', g1: '#5fc16a', g2: '#9ad97f', gs: '#4aab57' },
    { name: 'Green Valley', len: 7000,  amp: 1.0,  bump: 1.0, stars: 7,  phase: 1.7,
      sky: 'linear-gradient(180deg,#9be3ff,#e6fff0)', g1: '#56b86a', g2: '#92d97f', gs: '#3f9a52' },
    { name: 'Bumpy Trail',  len: 8000,  amp: 1.15, bump: 1.5, stars: 8,  phase: 3.1,
      sky: 'linear-gradient(180deg,#bfe9ff,#eef9ff)', g1: '#67bf5e', g2: '#a6de86', gs: '#4fa84a' },
    { name: 'Desert Dunes', len: 8500,  amp: 1.25, bump: 1.2, stars: 8,  phase: 4.6,
      sky: 'linear-gradient(180deg,#ffe7a8,#fff6df)', g1: '#e0b25a', g2: '#f0cf86', gs: '#c79042' },
    { name: 'Snowy Peaks',  len: 9000,  amp: 1.40, bump: 1.7, stars: 9,  phase: 5.9,
      sky: 'linear-gradient(180deg,#dff1ff,#ffffff)', g1: '#cfe6f2', g2: '#eaf6fd', gs: '#aacbe0' },
    { name: 'Rainbow Road', len: 10000, amp: 1.50, bump: 1.9, stars: 10, phase: 2.3,
      sky: 'linear-gradient(180deg,#e7c9ff,#ffe6f6)', g1: '#b06cc7', g2: '#d8a6e8', gs: '#9450ad' },
  ];

  // ---- progress (unlocked levels + best stars) ----
  const SKEY = 'bike_progress_v1';
  let prog = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
  prog.unlocked = prog.unlocked || 1;
  prog.stars = prog.stars || {};
  function save() { try { localStorage.setItem(SKEY, JSON.stringify(prog)); } catch (e) {} }

  let root, world, bikeEl, countEl, winEl, selEl;
  let stars = [], cameraX = 0, raf = null, last = 0, collected = 0, built = false, finished = false;
  let goHeld = false, jumpHeld = false, bikeY = 0, vy = 0, onGround = true, flip = 0;
  let lvl = LEVELS[0], lvlIndex = 0;

  function groundTop(x, H) {
    const L = lvl, base = H * 0.60, p = L.phase;
    return base
      - Math.sin(x * 0.0016 + p) * H * 0.12 * L.amp
      - Math.sin(x * 0.0041 + 1.3 + p) * H * 0.07 * L.amp
      - Math.sin(x * 0.0105 + 0.5 + p) * H * 0.055 * L.bump
      - Math.sin(x * 0.0220 + 2.0 + p) * H * 0.030 * L.bump;
  }

  function build() {
    if (built) return;
    root = document.getElementById('screen-bike');
    root.innerHTML = `
      <div class="sun"></div>
      <div class="b-world" id="b-world"></div>
      <div class="b-hud"><div class="b-count"><span>⭐</span><span id="b-count">0 / 0</span></div></div>
      <div class="b-corner left"><button class="b-iconbtn" id="b-home" title="Levels">🗺️</button></div>
      <div class="b-corner right"><button class="b-iconbtn" id="b-reset" title="Restart">🔄</button></div>
      <button class="b-jump" id="b-jump">JUMP<br>⬆</button>
      <button class="b-go" id="b-go">GO ▶</button>
      <div class="b-win" id="b-win">
        <div class="big">🏆</div><h3>You did it!</h3>
        <p id="b-win-sub">All stars collected!</p>
        <div class="row">
          <button class="b-wbtn" id="b-again">🔄 Again</button>
          <button class="b-wbtn ghost" id="b-levels">🗺️ Levels</button>
          <button class="b-wbtn go" id="b-next">Next ▶</button>
        </div>
      </div>
      <div class="b-select" id="b-select">
        <div class="b-sel-card">
          <h3>Pick a Trail!</h3>
          <div class="b-sel-grid" id="b-sel-grid"></div>
          <button class="b-sel-home" id="b-sel-home">🏠 Home</button>
        </div>
      </div>`;
    world = root.querySelector('#b-world');
    countEl = root.querySelector('#b-count');
    winEl = root.querySelector('#b-win');
    selEl = root.querySelector('#b-select');

    root.querySelector('#b-home').addEventListener('click', showSelect);
    root.querySelector('#b-reset').addEventListener('click', () => startLevel(lvlIndex));
    root.querySelector('#b-again').addEventListener('click', () => startLevel(lvlIndex));
    root.querySelector('#b-levels').addEventListener('click', showSelect);
    root.querySelector('#b-next').addEventListener('click', () => startLevel(Math.min(lvlIndex + 1, LEVELS.length - 1)));
    root.querySelector('#b-sel-home').addEventListener('click', window.goHome);

    const go = root.querySelector('#b-go');
    go.addEventListener('pointerdown', e => { goHeld = true; try { go.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    go.addEventListener('pointerup', () => { goHeld = false; });
    go.addEventListener('pointercancel', () => { goHeld = false; });

    const jb = root.querySelector('#b-jump');
    jb.addEventListener('pointerdown', e => { jumpHeld = true; jump(); try { jb.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    jb.addEventListener('pointerup', () => { jumpHeld = false; });
    jb.addEventListener('pointercancel', () => { jumpHeld = false; });

    window.addEventListener('keydown', e => {
      if (document.body.dataset.screen !== 'bike') return;
      if (e.key === 'ArrowRight' || e.key === 'd') goHeld = true;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (!jumpHeld) jump(); jumpHeld = true; }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowRight' || e.key === 'd') goHeld = false;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') jumpHeld = false;
    });
    window.addEventListener('resize', () => { if (document.body.dataset.screen === 'bike' && !selEl.classList.contains('show')) layout(); });
    built = true;
  }

  function jump() { if (onGround) { vy = JUMP_V; onGround = false; } }

  function clouds() {
    let html = '';
    [[12, 8, 70, 26], [40, 16, 95, 60], [66, 6, 80, 40], [88, 20, 60, 50]].forEach(([l, t, w, d]) => {
      html += `<div class="cloud" style="left:${l}vw;top:${t}vh;width:${w}px;height:${w * 0.42}px;animation-duration:${d}s;"></div>`;
    });
    return html;
  }

  // ---- level select ----
  function showSelect() {
    cancelAnimationFrame(raf); raf = null; goHeld = false; jumpHeld = false;
    winEl.classList.remove('show');
    const grid = root.querySelector('#b-sel-grid');
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const unlocked = i < prog.unlocked;
      const earned = prog.stars[i] || 0;
      const card = document.createElement('button');
      card.className = 'b-sel-item' + (unlocked ? '' : ' locked');
      if (unlocked) card.style.background = `linear-gradient(160deg, ${L.g2}, ${L.g1})`;
      card.innerHTML = unlocked
        ? `<div class="num">${i + 1}</div><div class="nm">${L.name}</div><div class="st">⭐ ${earned}/${L.stars}</div>`
        : `<div class="lock">🔒</div>`;
      card.addEventListener('click', () => { if (unlocked) startLevel(i); });
      grid.appendChild(card);
    });
    selEl.classList.add('show');
  }

  function layout() {
    const H = root.clientHeight, W = lvl.len, step = 18;
    let top = `M 0 ${H} L 0 ${groundTop(0, H)}`;
    for (let x = 0; x <= W; x += step) top += ` L ${x} ${groundTop(x, H)}`;
    top += ` L ${W} ${H} Z`;
    let backPath = `M 0 ${H} L 0 ${groundTop(0, H) - H * 0.1}`;
    for (let x = 0; x <= W; x += step) backPath += ` L ${x} ${groundTop(x + 600, H) - H * 0.1}`;
    backPath += ` L ${W} ${H} Z`;

    world.style.width = W + 'px';
    world.innerHTML =
      `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <path d="${backPath}" fill="${lvl.g2}" opacity="0.7"></path>
        <path d="${top}" fill="${lvl.g1}"></path>
        <path d="${top}" fill="none" stroke="${lvl.gs}" stroke-width="6" opacity="0.4"></path>
      </svg>`;

    for (let x = 240; x < W - 200; x += 360) {
      const f = document.createElement('div');
      f.className = 'b-flower';
      f.textContent = ['🌼', '🌸', '🌷'][Math.floor(Math.random() * 3)];
      f.style.left = x + 'px';
      f.style.top = (groundTop(x, H) + 6) + 'px';
      world.appendChild(f);
    }

    stars = [];
    const span = W - 1100;
    for (let i = 0; i < lvl.stars; i++) {
      const x = 620 + (span / (lvl.stars - 1)) * i;
      const y = groundTop(x, H) - (110 + Math.random() * 95);
      const el = document.createElement('div');
      el.className = 'b-star'; el.textContent = '⭐';
      el.style.left = x + 'px'; el.style.top = y + 'px';
      world.appendChild(el);
      stars.push({ x, y, el, got: false });
    }

    bikeEl = document.createElement('div');
    bikeEl.className = 'b-bike'; bikeEl.textContent = '🚵';
    world.appendChild(bikeEl);
  }

  function tilt(x, H) {
    const a = groundTop(x - 30, H), b = groundTop(x + 30, H);
    return Math.max(-26, Math.min(26, Math.atan2(b - a, 60) * 180 / Math.PI));
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    const H = root.clientHeight;
    const maxCam = lvl.len - window.innerWidth;

    if (goHeld && cameraX < maxCam) cameraX = Math.min(maxCam, cameraX + SPEED * dt);
    world.style.transform = 'translateX(' + (-cameraX) + 'px)';

    const bx = cameraX + window.innerWidth * BIKE_SCREEN_X;
    const groundY = groundTop(bx, H);

    vy -= GRAV * dt;
    bikeY += vy * dt;
    if (bikeY <= 0) { bikeY = 0; vy = 0; if (!onGround) { onGround = true; flip = 0; } }
    else onGround = false;

    if (!onGround) {
      if (goHeld) flip -= FLIP_SPEED * dt;
      if (jumpHeld) flip += FLIP_SPEED * dt;
    }

    const rot = onGround ? (-tilt(bx, H) + (goHeld ? Math.sin(ts * 0.02) * 3 : 0)) : flip;
    bikeEl.style.left = bx + 'px';
    bikeEl.style.top = (groundY - bikeY) + 'px';
    bikeEl.style.transform = 'translate(-50%,-100%) scaleX(-1) rotate(' + rot + 'deg)';

    const cy = groundY - bikeY - 30;
    stars.forEach(s => {
      if (s.got) return;
      const dx = s.x - bx, dy = s.y - cy;
      if (dx * dx + dy * dy < 64 * 64) {
        s.got = true; s.el.classList.add('got'); collected++;
        countEl.textContent = collected + ' / ' + lvl.stars;
        if (collected === lvl.stars) win();
      }
    });

    raf = requestAnimationFrame(loop);
  }

  function win() {
    if (finished) return;
    finished = true;
    prog.stars[lvlIndex] = Math.max(prog.stars[lvlIndex] || 0, collected);
    if (lvlIndex + 1 < LEVELS.length) prog.unlocked = Math.max(prog.unlocked, lvlIndex + 2);
    save();
    root.querySelector('#b-next').style.display = (lvlIndex + 1 < LEVELS.length) ? '' : 'none';
    root.querySelector('#b-win-sub').textContent =
      lvlIndex + 1 < LEVELS.length ? 'All stars collected! 🌟' : 'You finished every trail! 🏆';
    setTimeout(() => winEl.classList.add('show'), 400);
  }

  function startLevel(i) {
    lvlIndex = i; lvl = LEVELS[i];
    selEl.classList.remove('show'); winEl.classList.remove('show');
    root.style.background = lvl.sky;
    finished = false; goHeld = false; jumpHeld = false;
    cameraX = 0; collected = 0; last = 0; bikeY = 0; vy = 0; onGround = true; flip = 0;
    countEl.textContent = '0 / ' + lvl.stars;
    requestAnimationFrame(() => {
      root.querySelectorAll('.cloud').forEach(c => c.remove());
      root.insertAdjacentHTML('afterbegin', clouds());
      layout();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    });
  }

  window.startBike = function () {
    build();
    showSelect();
  };

  window.stopBike = function () {
    goHeld = false; jumpHeld = false;
    cancelAnimationFrame(raf);
    raf = null; last = 0;
  };
})();
