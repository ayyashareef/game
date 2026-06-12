/* Tiny WebAudio sound engine — cheerful blips, an engine hum, and a win jingle. */
const Sound = (function () {
  let ctx = null;
  let muted = Storage.muted;

  // engine hum nodes
  let engOsc = null, engGain = null, engFilter = null;

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function blip(freq, dur, type = "sine", vol = 0.25) {
    if (muted || !ensure()) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function startEngine() {
    if (muted || !ensure() || engOsc) return;
    engOsc = ctx.createOscillator();
    engGain = ctx.createGain();
    engFilter = ctx.createBiquadFilter();
    engOsc.type = "sawtooth";
    engOsc.frequency.value = 60;
    engFilter.type = "lowpass";
    engFilter.frequency.value = 600;
    engGain.gain.value = 0.0;
    engOsc.connect(engFilter); engFilter.connect(engGain); engGain.connect(ctx.destination);
    engOsc.start();
  }

  function stopEngine() {
    if (engOsc) {
      try { engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) {}
      const o = engOsc, g = engGain;
      setTimeout(() => { try { o.stop(); } catch (e) {} }, 200);
      engOsc = null; engGain = null; engFilter = null;
    }
  }

  /* throttle 0..1, speed 0..1 */
  function engine(throttle, speed) {
    if (muted) { stopEngine(); return; }
    if (!engOsc) startEngine();
    if (!engOsc) return;
    const t = ctx.currentTime;
    engOsc.frequency.setTargetAtTime(55 + speed * 130 + throttle * 40, t, 0.08);
    engGain.gain.setTargetAtTime(throttle > 0 ? 0.12 : 0.04, t, 0.08);
    engFilter.frequency.setTargetAtTime(500 + speed * 1400, t, 0.08);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (m) stopEngine(); },
    get muted() { return muted; },

    click() { blip(660, 0.08, "square", 0.2); },
    star() { blip(880, 0.09, "sine", 0.3); setTimeout(() => blip(1320, 0.12, "sine", 0.28), 70); },
    bump() { blip(120, 0.12, "sawtooth", 0.18); },
    jump() { blip(440, 0.1, "square", 0.22); setTimeout(() => blip(740, 0.12, "square", 0.2), 60); },
    engine, stopEngine,

    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => blip(f, 0.22, "triangle", 0.3), i * 130));
    },
    lock() { blip(200, 0.18, "square", 0.2); }
  };
})();
