/* The bike: two wheels joined by a rigid frame, simulated with Verlet integration.
   Tuned to be bouncy and forgiving — easy for little kids, still fun to jump. */

class Bike {
  constructor(terrain) {
    this.terrain = terrain;
    this.r = 22;            // wheel radius
    this.L = 64;            // wheelbase (distance between wheels)
    this.gravity = 2300;    // px/s^2
    this.maxStep = 9.5;     // speed clamp (px per substep)

    this.spin = 0;          // visual wheel rotation
    this.rearGround = false;
    this.frontGround = false;
    this.crashed = false;
    this.crashTimer = 0;

    this.reset(terrain.startX, terrain.startY);
  }

  reset(x, y) {
    const gy = this.groundY(x) - this.r;
    this.rear  = { x: x,           y: gy, ox: x,           oy: gy };
    this.front = { x: x + this.L,  y: this.groundY(x + this.L) - this.r,
                   ox: x + this.L, oy: this.groundY(x + this.L) - this.r };
    this.spin = 0;
    this.crashed = false;
    this.crashTimer = 0;
  }

  groundY(x) { return terrainAt(this.terrain.points, this.terrain.dx, x); }

  groundSlope(x) {
    const d = 6;
    return (this.groundY(x + d) - this.groundY(x - d)) / (2 * d);
  }

  get cx() { return (this.rear.x + this.front.x) / 2; }
  get cy() { return (this.rear.y + this.front.y) / 2; }
  get angle() { return Math.atan2(this.front.y - this.rear.y, this.front.x - this.rear.x); }
  get speed() { return ((this.front.x - this.front.ox) + (this.rear.x - this.rear.ox)) / 2; }

  rotate(theta) {
    const cx = this.cx, cy = this.cy;
    const c = Math.cos(theta), s = Math.sin(theta);
    for (const w of [this.rear, this.front]) {
      let dx = w.x - cx, dy = w.y - cy;
      w.x = cx + dx * c - dy * s;  w.y = cy + dx * s + dy * c;
      dx = w.ox - cx; dy = w.oy - cy;
      w.ox = cx + dx * c - dy * s; w.oy = cy + dx * s + dy * c;
    }
  }

  integrateWheel(w, dt) {
    let vx = (w.x - w.ox) * 0.999;
    let vy = (w.y - w.oy) * 0.999;
    // clamp
    vx = Math.max(-this.maxStep, Math.min(this.maxStep, vx));
    w.ox = w.x; w.oy = w.y;
    w.x += vx;
    w.y += vy + this.gravity * dt * dt;
  }

  constrain() {
    let dx = this.front.x - this.rear.x;
    let dy = this.front.y - this.rear.y;
    let d = Math.hypot(dx, dy) || 0.0001;
    const diff = (d - this.L) / d * 0.5;
    const ox = dx * diff, oy = dy * diff;
    this.rear.x += ox; this.rear.y += oy;
    this.front.x -= ox; this.front.y -= oy;
  }

  collideWheel(w) {
    const gy = this.groundY(w.x);
    const limit = gy - this.r;
    if (w.y > limit) {
      w.y = limit;
      // stop sinking (no vertical bounce) and keep most rolling momentum
      const vx = (w.x - w.ox);
      w.oy = w.y;
      w.ox = w.x - vx * 0.985;
      return true;
    }
    return false;
  }

  /* input: { gas:bool, brake:bool }  dt: substep seconds */
  step(input, dt) {
    this.integrateWheel(this.rear, dt);
    this.integrateWheel(this.front, dt);

    for (let i = 0; i < 4; i++) this.constrain();

    this.rearGround = this.collideWheel(this.rear);
    this.frontGround = this.collideWheel(this.front);
    this.constrain();
    this.collideWheel(this.rear);
    this.collideWheel(this.front);

    const onGround = this.rearGround || this.frontGround;

    // ---- driving ----
    const drive = 0.215;  // forward push per substep
    if (input.gas) {
      if (this.rearGround) {
        const slope = this.groundSlope(this.rear.x);
        const len = Math.hypot(1, slope);
        this.rear.ox -= drive / len;
        this.rear.oy -= drive * slope / len;
      } else {
        this.rotate(-0.012); // wheelie / keep nose up in the air
      }
    }
    if (input.brake) {
      if (onGround) {
        // brake + gentle reverse
        this.rear.ox += 0.13;
        this.front.ox += 0.13;
      } else {
        this.rotate(0.012);  // nose down in the air
      }
    }

    // ---- gentle auto-balance on the ground (kid-friendly) ----
    if (onGround && !input.gas && !input.brake) {
      const target = Math.atan(this.groundSlope(this.cx));
      let diff = target - this.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.rotate(diff * 0.08);
    }

    // wheel spin visual
    this.spin += this.speed / this.r;
  }

  /* run a frame (a couple of substeps for stability) */
  update(input, frameDt) {
    if (this.crashed) {
      this.crashTimer -= frameDt;
      // let it settle, then game will respawn
      const dt = 1 / 120;
      for (let i = 0; i < 2; i++) this.physicsOnly(dt);
      return;
    }
    const dt = 1 / 120;
    for (let i = 0; i < 2; i++) this.step(input, dt);

    // detect a tip-over (upside down & barely moving) → mark crashed
    const a = Math.abs(this.angle);
    const upsideDown = a > 2.0;
    if (upsideDown && Math.abs(this.speed) < 0.6) {
      this.crashed = true;
      this.crashTimer = 0.7;
    }
  }

  physicsOnly(dt) {
    this.integrateWheel(this.rear, dt);
    this.integrateWheel(this.front, dt);
    for (let i = 0; i < 4; i++) this.constrain();
    this.collideWheel(this.rear);
    this.collideWheel(this.front);
  }

  readyToRespawn() { return this.crashed && this.crashTimer <= 0; }
}
