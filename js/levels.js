/* Level definitions + terrain generator.
   Each level has a theme (colors) and difficulty knobs that get gentler-to-harder.
   Terrain is generated deterministically from a seed so a level always looks the same. */

const LEVELS = [
  { id: "meadow",  num: 1, name: "Sunny Meadow",  length: 2600, hilliness: 0.35, bumps: 0.2, stars: 8,
    sky: ["#7ec8f5", "#bdeafc"], ground: "#6ab04c", groundDark: "#4e8c36", accent: "#f1c40f", deco: "flower" },
  { id: "hills",   num: 2, name: "Green Hills",   length: 3000, hilliness: 0.55, bumps: 0.3, stars: 9,
    sky: ["#74c0f0", "#aee3fb"], ground: "#58b368", groundDark: "#3f8a4d", accent: "#fff", deco: "flower" },
  { id: "desert",  num: 3, name: "Sandy Desert",  length: 3300, hilliness: 0.6,  bumps: 0.45, stars: 10,
    sky: ["#ffd27f", "#ffe9c2"], ground: "#e0b25a", groundDark: "#c79042", accent: "#fff", deco: "cactus" },
  { id: "forest",  num: 4, name: "Forest Trail",  length: 3600, hilliness: 0.7,  bumps: 0.5,  stars: 10,
    sky: ["#9be3c0", "#d3f3e4"], ground: "#4a8c5c", groundDark: "#356b44", accent: "#fff", deco: "tree" },
  { id: "canyon",  num: 5, name: "Red Canyon",    length: 3900, hilliness: 0.85, bumps: 0.6,  stars: 11,
    sky: ["#ffb38a", "#ffd9c0"], ground: "#c0563b", groundDark: "#9c3f29", accent: "#fff", deco: "rock" },
  { id: "snow",    num: 6, name: "Snowy Peak",    length: 4200, hilliness: 0.95, bumps: 0.7,  stars: 12,
    sky: ["#cfe9ff", "#eef7ff"], ground: "#eaf4fb", groundDark: "#c2d8e8", accent: "#7fb3d5", deco: "pine" },
  { id: "sunset",  num: 7, name: "Sunset Ridge",  length: 4500, hilliness: 1.05, bumps: 0.8,  stars: 12,
    sky: ["#ff8a65", "#ffd1a3"], ground: "#7a5c8c", groundDark: "#5e4470", accent: "#ffe082", deco: "rock" },
  { id: "rainbow", num: 8, name: "Rainbow Road",  length: 4800, hilliness: 1.15, bumps: 0.85, stars: 14,
    sky: ["#b39ddb", "#f8bbd0"], ground: "#9c27b0", groundDark: "#7b1fa2", accent: "#fff", deco: "rainbow" },
];

/* simple seeded random (mulberry32) */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Build terrain points (array of {x, y}) for a level.
   baseY is the resting ground line; smaller y = higher up. */
function buildTerrain(level, baseY) {
  const rng = makeRng(hashId(level.id));
  const dx = 28;                       // spacing between terrain points
  const points = [];
  const safeStart = 520;               // flat, gentle launch area
  const amp = 50 + level.hilliness * 95;   // hill height
  const bumpAmp = level.bumps * 38;

  // a few overlapping waves for natural-looking but smooth hills
  const waves = [
    { len: 760 + rng() * 260, amp: amp,        ph: rng() * 6.28 },
    { len: 360 + rng() * 140, amp: amp * 0.4,  ph: rng() * 6.28 },
    { len: 150 + rng() * 70,  amp: bumpAmp,    ph: rng() * 6.28 },
  ];

  for (let x = 0; x <= level.length; x += dx) {
    let y = baseY;
    if (x > safeStart && x < level.length - 360) {
      const t = (x - safeStart);
      for (const w of waves) y -= Math.sin(t / w.len * 6.283 + w.ph) * w.amp;
      // keep the start ramping in smoothly
      const ramp = Math.min(1, (x - safeStart) / 400);
      y = baseY + (y - baseY) * ramp;
    }
    points.push({ x, y });
  }

  // flatten the finish area
  const finishX = level.length - 200;
  for (const p of points) {
    if (p.x > level.length - 360) p.y = baseY - 20;
  }

  // place collectible stars hovering above the path
  const stars = [];
  const gap = level.length / (level.stars + 1);
  for (let i = 1; i <= level.stars; i++) {
    const sx = gap * i + (rng() - 0.5) * gap * 0.4;
    stars.push({ x: sx, y: terrainAt(points, dx, sx) - (60 + rng() * 70), got: false });
  }

  return { points, dx, stars, finishX, startX: 160, startY: baseY };
}

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Interpolated ground height at world x */
function terrainAt(points, dx, x) {
  if (x <= 0) return points[0].y;
  const i = Math.floor(x / dx);
  if (i >= points.length - 1) return points[points.length - 1].y;
  const p0 = points[i], p1 = points[i + 1];
  const f = (x - p0.x) / dx;
  return p0.y + (p1.y - p0.y) * f;
}
