/* bike.js — Mountain Bike: hold GO to ride the hills and collect stars */
(function () {
  const LEVEL_W = 4200;          // world width in px
  const STAR_COUNT = 8;
  const BIKE_SCREEN_X = 0.26;    // bike fixed at 26% of viewport width
  const SPEED = 360;             // px / second

  let root, world, bikeEl, hud, countEl, winEl, svg;
  let stars = [];                // {x, baseY, el, got}
  let cameraX = 0, moving = false, raf = null, last = 0, collected = 0, built = false, finished = false;

  // ground height function (top of grass) at world x — gentle rolling hills
  function groundTop(x, H) {
    const base = H * 0.62;
    return base
      - Math.sin(x * 0.0016) * H * 0.13
      - Math.sin(x * 0.0041 + 1.3) * H * 0.06;
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
      <button class="b-back" id="b-back" title="Back">◀</button>
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
    root.querySelector('#b-back').addEventListener('click', window.goHome);
    root.querySelector('#b-reset').addEventListener('click', reset);
    root.querySelector('#b-again').addEventListener('click', reset);
    root.querySelector('#b-winhome').addEventListener('click', window.goHome);

    const go = root.querySelector('#b-go');
    const press = e => { moving = true; e.preventDefault(); };
    const release = () => { moving = false; };
    go.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    go.addEventListener('pointerleave', release);

    // keyboard: hold right arrow / space
    window.addEventListener('keydown', e => {
      if (document.body.dataset.screen !== 'bike') return;
      if (e.key === 'ArrowRight' || e.key === ' ') moving = true;
    });
    window.addEventListener('keyup', e => { if (e.key === 'ArrowRight' || e.key === ' ') moving = false; });
    window.addEventListener('resize', () => { if (document.body.dataset.screen === 'bike') layout(); });
    built = true;
  }

  function clouds(H) {
    let html = '';
    const data = [[12, 8, 70, 26], [40, 16, 95, 60], [66, 6, 80, 40], [88, 20, 60, 50]];
    data.forEach(([l, t, w, d]) => {
      html += `<div class="cloud" style="left:${l}vw;top:${t}vh;width:${w}px;height:${w * 0.42}px;animation-duration:${d}s;
        box-shadow:0 0 0 0 #fff;"></div>`;
    });
    return html;
  }

  function layout() {
    const H = root.clientHeight;
    // build the hill svg path
    const step = 24;
    let top = `M 0 ${H} L 0 ${groundTop(0, H)}`;
    let back = '';
    for (let x = 0; x <= LEVEL_W; x += step) top += ` L ${x} ${groundTop(x, H)}`;
    top += ` L ${LEVEL_W} ${H} Z`;
    // a lighter back hill for depth
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

    // flowers along the ground
    for (let x = 240; x < LEVEL_W - 200; x += 320) {
      const f = document.createElement('div');
      f.className = 'b-flower';
      f.textContent = ['🌼', '🌸', '🌷'][Math.floor(Math.random() * 3)];
      f.style.left = x + 'px';
      f.style.top = (groundTop(x, H) + 6) + 'px';
      world.appendChild(f);
    }

    // stars spaced across the level, floating above the ground
    stars = [];
    const span = LEVEL_W - 900;
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = 520 + (span / (STAR_COUNT - 1)) * i;
      const y = groundTop(x, H) - (70 + Math.random() * 90);
      const el = document.createElement('div');
      el.className = 'b-star';
      el.textContent = '⭐';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      world.appendChild(el);
      stars.push({ x, y, el, got: false });
    }

    // bike element
    bikeEl = document.createElement('div');
    bikeEl.className = 'b-bike';
    bikeEl.textContent = '🚵';
    world.appendChild(bikeEl);

    placeBike(H);
  }

  function placeBike(H) {
    const bikeWorldX = cameraX + window.innerWidth * BIKE_SCREEN_X;
    bikeEl.style.left = bikeWorldX + 'px';
    bikeEl.style.top = groundTop(bikeWorldX, H) + 'px';
    bikeEl.style.transform = 'translate(-50%,-100%) rotate(' + tilt(bikeWorldX, H) + 'deg)';
  }

  function tilt(x, H) {
    const a = groundTop(x - 30, H), b = groundTop(x + 30, H);
    return Math.max(-22, Math.min(22, Math.atan2(b - a, 60) * 180 / Math.PI));
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    const H = root.clientHeight;
    const maxCam = LEVEL_W - window.innerWidth;

    if (moving && cameraX < maxCam) {
      cameraX = Math.min(maxCam, cameraX + SPEED * dt);
    }
    world.style.transform = 'translateX(' + (-cameraX) + 'px)';

    const bikeWorldX = cameraX + window.innerWidth * BIKE_SCREEN_X;
    bikeEl.style.left = bikeWorldX + 'px';
    bikeEl.style.top = groundTop(bikeWorldX, H) + 'px';
    const wob = moving ? Math.sin(ts * 0.02) * 3 : 0;
    bikeEl.style.transform = 'translate(-50%,-100%) rotate(' + (tilt(bikeWorldX, H) + wob) + 'deg)';

    // collect
    stars.forEach(s => {
      if (s.got) return;
      if (Math.abs(s.x - bikeWorldX) < 52 && Math.abs(s.y - groundTop(bikeWorldX, H)) < 220) {
        s.got = true; s.el.classList.add('got'); collected++;
        countEl.textContent = collected + ' / ' + STAR_COUNT;
        if (collected === STAR_COUNT) win();
      }
    });

    raf = requestAnimationFrame(loop);
  }

  function win() {
    if (finished) return;
    finished = true; moving = false;
    setTimeout(() => winEl.classList.add('show'), 400);
  }

  function reset() {
    finished = false; moving = false; cameraX = 0; collected = 0; last = 0;
    winEl.classList.remove('show');
    countEl.textContent = '0 / ' + STAR_COUNT;
    layout();
  }

  window.startBike = function () {
    build();
    finished = false; moving = false; cameraX = 0; collected = 0; last = 0;
    winEl.classList.remove('show');
    countEl.textContent = '0 / ' + STAR_COUNT;
    requestAnimationFrame(() => {
      // inject clouds now that we know viewport
      const H = root.clientHeight;
      root.querySelectorAll('.cloud').forEach(c => c.remove());
      root.insertAdjacentHTML('afterbegin', clouds(H));
      layout();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    });
  };

  window.stopBike = function () {
    moving = false;
    cancelAnimationFrame(raf);
    raf = null; last = 0;
  };
})();
