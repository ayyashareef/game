/* bike.js — Mountain Bike: ride the bumpy hills, JUMP for stars, do flips! */
(function () {
  const LEVEL_W = 9000;          // world width in px (long ride)
  const STAR_COUNT = 8;
  const BIKE_SCREEN_X = 0.26;    // bike fixed at 26% of viewport width
  const SPEED = 360;             // px / second
  const GRAV = 2400;             // gravity for the jump (px/s^2)
  const JUMP_V = 1020;           // jump strength (reaches ~215px high)
  const FLIP_SPEED = 520;        // deg/s spin while flipping in the air

  let root, world, bikeEl, countEl, winEl;
  let stars = [];
  let cameraX = 0, raf = null, last = 0, collected = 0, built = false, finished = false;
  let goHeld = false, jumpHeld = false;       // controls
  let bikeY = 0, vy = 0, onGround = true, flip = 0;  // vertical + rotation state

  // ground height (top of grass) at world x — gentle hills + plenty of bumps
  function groundTop(x, H) {
    const base = H * 0.60;
    return base
      - Math.sin(x * 0.0016) * H * 0.12
      - Math.sin(x * 0.0041 + 1.3) * H * 0.07
      - Math.sin(x * 0.0105 + 0.5) * H * 0.055
      - Math.sin(x * 0.0220 + 2.0) * H * 0.030;
  }

  function build() {
    if (built) return;
    root = document.getElementById('screen-bike');
    root.innerHTML = `
      <div class="sun"></div>
      <div class="b-world" id="b-world"></div>
      <div class="b-hud"><div class="b-count"><span>⭐</span><span id="b-count">0 / ${STAR_COUNT}</span></div></div>
      <div class="b-corner left"><button class="b-iconbtn" id="b-home" title="Home">🏠</button></div>
      <div class="b-corner right"><button class="b-iconbtn" id="b-reset" title="Restart">🔄</button></div>
      <button class="b-jump" id="b-jump">JUMP<br>⬆</button>
      <button class="b-go" id="b-go">GO ▶</button>
      <div class="b-win" id="b-win">
        <div class="big">🏆</div><h3>You did it!</h3>
        <p id="b-win-sub">You collected all the stars!</p>
        <div class="row">
          <button class="again" id="b-again">Play again</button>
          <button class="home" id="b-winhome">Home</button>
        </div>
      </div>`;
    world = root.querySelector('#b-world');
    countEl = root.querySelector('#b-count');
    winEl = root.querySelector('#b-win');

    root.querySelector('#b-home').addEventListener('click', window.goHome);
    root.querySelector('#b-reset').addEventListener('click', reset);
    root.querySelector('#b-again').addEventListener('click', reset);
    root.querySelector('#b-winhome').addEventListener('click', window.goHome);

    const go = root.querySelector('#b-go');
    go.addEventListener('pointerdown', e => { goHeld = true; e.preventDefault(); });
    go.addEventListener('pointerleave', () => { goHeld = false; });

    const jb = root.querySelector('#b-jump');
    jb.addEventListener('pointerdown', e => { jumpHeld = true; jump(); e.preventDefault(); });
    jb.addEventListener('pointerleave', () => { jumpHeld = false; });

    window.addEventListener('pointerup', () => { goHeld = false; jumpHeld = false; });

    // keyboard: → drive (+backflip in air), Space/↑ jump (+frontflip in air)
    window.addEventListener('keydown', e => {
      if (document.body.dataset.screen !== 'bike') return;
      if (e.key === 'ArrowRight' || e.key === 'd') goHeld = true;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (!jumpHeld) jump(); jumpHeld = true; }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowRight' || e.key === 'd') goHeld = false;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') jumpHeld = false;
    });
    window.addEventListener('resize', () => { if (document.body.dataset.screen === 'bike') layout(); });
    built = true;
  }

  function jump() { if (onGround) { vy = JUMP_V; onGround = false; } }

  function clouds() {
    let html = '';
    const data = [[12, 8, 70, 26], [40, 16, 95, 60], [66, 6, 80, 40], [88, 20, 60, 50]];
    data.forEach(([l, t, w, d]) => {
      html += `<div class="cloud" style="left:${l}vw;top:${t}vh;width:${w}px;height:${w * 0.42}px;animation-duration:${d}s;"></div>`;
    });
    return html;
  }

  function layout() {
    const H = root.clientHeight;
    const step = 18;
    let top = `M 0 ${H} L 0 ${groundTop(0, H)}`;
    for (let x = 0; x <= LEVEL_W; x += step) top += ` L ${x} ${groundTop(x, H)}`;
    top += ` L ${LEVEL_W} ${H} Z`;
    let backPath = `M 0 ${H} L 0 ${groundTop(0, H) - H * 0.1}`;
    for (let x = 0; x <= LEVEL_W; x += step) backPath += ` L ${x} ${groundTop(x + 600, H) - H * 0.1}`;
    backPath += ` L ${LEVEL_W} ${H} Z`;

    world.style.width = LEVEL_W + 'px';
    world.innerHTML =
      `<svg width="${LEVEL_W}" height="${H}" viewBox="0 0 ${LEVEL_W} ${H}">
        <path d="${backPath}" fill="#9ad97f" opacity="0.7"></path>
        <path d="${top}" fill="#5fc16a"></path>
        <path d="${top}" fill="none" stroke="#4aab57" stroke-width="6" opacity="0.4"></path>
      </svg>`;

    for (let x = 240; x < LEVEL_W - 200; x += 360) {
      const f = document.createElement('div');
      f.className = 'b-flower';
      f.textContent = ['🌼', '🌸', '🌷'][Math.floor(Math.random() * 3)];
      f.style.left = x + 'px';
      f.style.top = (groundTop(x, H) + 6) + 'px';
      world.appendChild(f);
    }

    // stars placed HIGH above the ground — you must jump to reach them
    stars = [];
    const span = LEVEL_W - 1100;
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = 620 + (span / (STAR_COUNT - 1)) * i;
      const y = groundTop(x, H) - (110 + Math.random() * 95);
      const el = document.createElement('div');
      el.className = 'b-star';
      el.textContent = '⭐';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      world.appendChild(el);
      stars.push({ x, y, el, got: false });
    }

    bikeEl = document.createElement('div');
    bikeEl.className = 'b-bike';
    bikeEl.textContent = '🚵';
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
    const maxCam = LEVEL_W - window.innerWidth;

    if (goHeld && cameraX < maxCam) cameraX = Math.min(maxCam, cameraX + SPEED * dt);
    world.style.transform = 'translateX(' + (-cameraX) + 'px)';

    const bx = cameraX + window.innerWidth * BIKE_SCREEN_X;
    const groundY = groundTop(bx, H);

    // jump physics
    vy -= GRAV * dt;
    bikeY += vy * dt;
    if (bikeY <= 0) { bikeY = 0; vy = 0; if (!onGround) { onGround = true; flip = 0; } }
    else onGround = false;

    // flips in the air: hold GO = backflip, hold JUMP = frontflip
    if (!onGround) {
      if (goHeld) flip -= FLIP_SPEED * dt;
      if (jumpHeld) flip += FLIP_SPEED * dt;
    }

    const rot = onGround ? (-tilt(bx, H) + (goHeld ? Math.sin(ts * 0.02) * 3 : 0)) : flip;
    bikeEl.style.left = bx + 'px';
    bikeEl.style.top = (groundY - bikeY) + 'px';
    bikeEl.style.transform = 'translate(-50%,-100%) scaleX(-1) rotate(' + rot + 'deg)';

    // collect — needs the bike near the star (jump up to it)
    const cy = groundY - bikeY - 30;   // bike body centre
    stars.forEach(s => {
      if (s.got) return;
      const dx = s.x - bx, dy = s.y - cy;
      if (dx * dx + dy * dy < 64 * 64) {
        s.got = true; s.el.classList.add('got'); collected++;
        countEl.textContent = collected + ' / ' + STAR_COUNT;
        if (collected === STAR_COUNT) win();
      }
    });

    raf = requestAnimationFrame(loop);
  }

  function win() {
    if (finished) return;
    finished = true;
    setTimeout(() => winEl.classList.add('show'), 400);
  }

  function resetState() {
    finished = false; goHeld = false; jumpHeld = false;
    cameraX = 0; collected = 0; last = 0; bikeY = 0; vy = 0; onGround = true; flip = 0;
    winEl.classList.remove('show');
    countEl.textContent = '0 / ' + STAR_COUNT;
  }

  function reset() { resetState(); layout(); }

  window.startBike = function () {
    build();
    resetState();
    requestAnimationFrame(() => {
      root.querySelectorAll('.cloud').forEach(c => c.remove());
      root.insertAdjacentHTML('afterbegin', clouds());
      layout();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    });
  };

  window.stopBike = function () {
    goHeld = false; jumpHeld = false;
    cancelAnimationFrame(raf);
    raf = null; last = 0;
  };
})();
