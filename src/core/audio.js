// 4D-MC :: procedural audio ----------------------------------------------
// Everything is synthesised at runtime — no asset files, no download cost.
// Material-aware footsteps, tool impacts, mob calls, and a slow drifting
// "hyperdrone" whose pitch tracks the player's position in the fourth
// dimension.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.ready = false;
    this.noiseBuf = null;
    this.drone = null;
    this.settings = { masterVolume: 0.7, musicVolume: 0.35 };
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.masterVolume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.settings.musicVolume;
    this.musicGain.connect(this.master);

    // one second of white noise, reused everywhere
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  applySettings(s) {
    this.settings.masterVolume = s.masterVolume;
    this.settings.musicVolume = s.musicVolume;
    if (this.master) this.master.gain.value = s.masterVolume;
    if (this.musicGain) this.musicGain.gain.value = s.musicVolume;
  }

  _env(node, t0, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  /** Filtered noise burst — footsteps, digging, breaking. */
  noise({ dur = 0.14, freq = 900, q = 1.2, gain = 0.3, type = 'bandpass', sweep = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, Math.min(0.012, dur * 0.2), dur, gain);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  /** Simple oscillator blip — UI, pickups, mob voices. */
  tone({ freq = 440, dur = 0.18, type = 'square', gain = 0.16, glide = 1, delay = 0, detune = 0 } = {}) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.008, dur, gain);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    o.connect(lp).connect(g).connect(this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // --- named cues --------------------------------------------------------
  step(material = 'stone', pitch = 1) {
    const M = {
      grass: { freq: 620, q: 0.9, gain: 0.13, dur: 0.09, type: 'bandpass' },
      dirt:  { freq: 420, q: 0.8, gain: 0.14, dur: 0.10, type: 'bandpass' },
      stone: { freq: 1500, q: 2.4, gain: 0.11, dur: 0.07, type: 'bandpass' },
      wood:  { freq: 900, q: 3.0, gain: 0.12, dur: 0.08, type: 'bandpass' },
      sand:  { freq: 2600, q: 0.6, gain: 0.10, dur: 0.11, type: 'highpass' },
      snow:  { freq: 3400, q: 0.5, gain: 0.09, dur: 0.10, type: 'highpass' },
      glass: { freq: 3000, q: 5.0, gain: 0.09, dur: 0.06, type: 'bandpass' },
      cloth: { freq: 700, q: 0.6, gain: 0.08, dur: 0.10, type: 'lowpass' },
      metal: { freq: 2100, q: 6.0, gain: 0.10, dur: 0.09, type: 'bandpass' },
      liquid:{ freq: 500, q: 0.7, gain: 0.10, dur: 0.16, type: 'lowpass' },
    }[material] || { freq: 900, q: 1, gain: 0.12, dur: 0.09, type: 'bandpass' };
    this.noise({ ...M, freq: M.freq * (0.86 + Math.random() * 0.28) * pitch, sweep: 0.7 });
  }

  dig(material) { this.step(material, 1.15); }

  breakBlock(material) {
    this.step(material, 0.8);
    this.noise({ dur: 0.22, freq: 1300, q: 0.7, gain: 0.17, sweep: 0.35, delay: 0.02 });
  }

  place(material) { this.step(material, 0.95); }

  pickup() {
    this.tone({ freq: 720, dur: 0.07, type: 'triangle', gain: 0.12, glide: 1.5 });
    this.tone({ freq: 1080, dur: 0.09, type: 'triangle', gain: 0.09, glide: 1.35, delay: 0.05 });
  }

  craft() {
    [520, 660, 880].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.11, delay: i * 0.055 }));
  }

  uiHover() { this.tone({ freq: 780, dur: 0.035, type: 'square', gain: 0.045 }); }
  uiClick() {
    this.tone({ freq: 340, dur: 0.05, type: 'square', gain: 0.10, glide: 1.9 });
    this.noise({ dur: 0.05, freq: 2600, q: 3, gain: 0.05 });
  }
  uiBack() { this.tone({ freq: 300, dur: 0.09, type: 'square', gain: 0.09, glide: 0.6 }); }
  uiDenied() { this.tone({ freq: 180, dur: 0.16, type: 'sawtooth', gain: 0.10, glide: 0.7 }); }

  hurt() {
    this.tone({ freq: 300, dur: 0.16, type: 'sawtooth', gain: 0.16, glide: 0.55 });
    this.noise({ dur: 0.12, freq: 800, q: 0.8, gain: 0.10, sweep: 0.4 });
  }

  splash() { this.noise({ dur: 0.42, freq: 1600, q: 0.5, gain: 0.15, sweep: 0.18 }); }
  explode() {
    this.noise({ dur: 0.9, freq: 420, q: 0.4, gain: 0.42, sweep: 0.12, type: 'lowpass' });
    this.tone({ freq: 90, dur: 0.6, type: 'sine', gain: 0.3, glide: 0.4 });
  }

  /** Discrete "click" as the player passes a slice boundary. */
  sliceTick(strength = 1) {
    this.tone({ freq: 1400 + Math.random() * 200, dur: 0.05, type: 'sine', gain: 0.05 * strength, glide: 1.4 });
  }

  /** Rising/falling shimmer when entering a new integer layer. */
  sliceShift(dir) {
    const base = 460;
    for (let i = 0; i < 4; i++) {
      this.tone({
        freq: base * Math.pow(dir > 0 ? 1.28 : 0.82, i),
        dur: 0.16, type: 'sine', gain: 0.075, delay: i * 0.035, glide: dir > 0 ? 1.15 : 0.88,
      });
    }
  }

  mobCall(kind) {
    const V = {
      zombie:   { f: 130, t: 'sawtooth', d: 0.5, g: 0.13, gl: 0.75 },
      skeleton: { f: 1500, t: 'square', d: 0.10, g: 0.09, gl: 0.6 },
      spider:   { f: 2100, t: 'square', d: 0.08, g: 0.07, gl: 1.5 },
      pig:      { f: 320, t: 'sawtooth', d: 0.22, g: 0.11, gl: 1.4 },
      cow:      { f: 180, t: 'sawtooth', d: 0.6, g: 0.12, gl: 0.85 },
      sheep:    { f: 420, t: 'square', d: 0.35, g: 0.10, gl: 1.15 },
      chicken:  { f: 900, t: 'square', d: 0.10, g: 0.08, gl: 1.6 },
      wraith:   { f: 240, t: 'sine', d: 0.9, g: 0.11, gl: 2.4 },
      drifter:  { f: 90, t: 'sine', d: 1.2, g: 0.12, gl: 1.9 },
      tessellite:{ f: 1200, t: 'sine', d: 0.4, g: 0.07, gl: 1.9 },
      villager: { f: 300, t: 'triangle', d: 0.16, g: 0.11, gl: 1.35 },
      slime:    { f: 220, t: 'sine', d: 0.24, g: 0.12, gl: 0.7 },
      generic:  { f: 400, t: 'triangle', d: 0.2, g: 0.09, gl: 1 },
    }[kind] || { f: 400, t: 'triangle', d: 0.2, g: 0.09, gl: 1 };
    this.tone({ freq: V.f * (0.9 + Math.random() * 0.2), dur: V.d, type: V.t, gain: V.g, glide: V.gl });
  }

  /** Continuous ambience whose timbre follows the current 4D slice. */
  startDrone() {
    if (!this.ready || this.drone) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
    const o3 = this.ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 1.4;
    o1.connect(lp); o2.connect(lp); o3.connect(lp);
    lp.connect(g).connect(this.musicGain);
    o1.start(); o2.start(); o3.start();
    this.drone = { g, o1, o2, o3, lp };
    g.gain.setTargetAtTime(0.16, this.ctx.currentTime, 2.0);
  }

  stopDrone() {
    if (!this.drone) return;
    const d = this.drone; this.drone = null;
    d.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
    setTimeout(() => { try { d.o1.stop(); d.o2.stop(); d.o3.stop(); } catch (_) {} }, 1200);
  }

  /** wFrac: 0..1 through the current slice, depth: 0..1 underground-ness. */
  updateDrone(wValue, depth, shifting) {
    if (!this.drone || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 55 * Math.pow(2, (wValue % 8) / 24);
    this.drone.o1.frequency.setTargetAtTime(base, t, 0.25);
    this.drone.o2.frequency.setTargetAtTime(base * 1.5, t, 0.25);
    this.drone.o3.frequency.setTargetAtTime(base * (shifting ? 2.02 : 2.0), t, 0.25);
    this.drone.lp.frequency.setTargetAtTime(260 + clamp01(depth) * 60 + (shifting ? 900 : 0), t, 0.3);
    this.drone.g.gain.setTargetAtTime(shifting ? 0.30 : 0.15, t, 0.35);
  }
}

export const audio = new AudioEngine();
