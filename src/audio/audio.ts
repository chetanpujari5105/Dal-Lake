// All sound is synthesised with the Web Audio API: filtered noise for water and
// rain, short oscillator chirps for birds and crickets. No audio files.

export interface AudioParams {
  speed: number;
  rain: number;
  night: number;
  birds: number;
}

export class LakeAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private water!: GainNode;
  private lap!: GainNode;
  private lapFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private fx!: GainNode;
  private noise!: AudioBuffer;
  private nextBird = 2;
  private nextCricket = 1;
  private enabled = true;
  private started = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(ctx.destination);

      const len = ctx.sampleRate * 3;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Brown-ish noise for the constant lake murmur.
      const brown = ctx.createBuffer(1, len, ctx.sampleRate);
      const bd = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        bd[i] = last * 3.2;
      }
      const bsrc = ctx.createBufferSource();
      bsrc.buffer = brown;
      bsrc.loop = true;
      const wlp = ctx.createBiquadFilter();
      wlp.type = 'lowpass';
      wlp.frequency.value = 520;
      this.water = ctx.createGain();
      this.water.gain.value = 0.35;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain).connect(this.water.gain);
      bsrc.connect(wlp).connect(this.water).connect(this.master);
      bsrc.start();
      lfo.start();

      // Hull lapping, rising with speed.
      const lsrc = ctx.createBufferSource();
      lsrc.buffer = this.noise;
      lsrc.loop = true;
      this.lapFilter = ctx.createBiquadFilter();
      this.lapFilter.type = 'bandpass';
      this.lapFilter.frequency.value = 500;
      this.lapFilter.Q.value = 0.8;
      this.lap = ctx.createGain();
      this.lap.gain.value = 0;
      lsrc.connect(this.lapFilter).connect(this.lap).connect(this.master);
      lsrc.start();

      // Rain hiss.
      const rsrc = ctx.createBufferSource();
      rsrc.buffer = this.noise;
      rsrc.loop = true;
      rsrc.playbackRate.value = 0.9;
      const rhp = ctx.createBiquadFilter();
      rhp.type = 'highpass';
      rhp.frequency.value = 1200;
      const rlp = ctx.createBiquadFilter();
      rlp.type = 'lowpass';
      rlp.frequency.value = 7000;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      rsrc.connect(rhp).connect(rlp).connect(this.rainGain).connect(this.master);
      rsrc.start();

      this.fx = ctx.createGain();
      this.fx.gain.value = 1;
      this.fx.connect(this.master);
      this.started = true;
    } catch (err) {
      console.warn('[audio] unavailable:', err);
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.15);
    if (on) void this.ctx.resume();
  }

  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.enabled) void this.ctx.resume();
  }

  update(dt: number, p: AudioParams): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const sp = Math.min(Math.abs(p.speed) / 6, 1);
    this.lap.gain.setTargetAtTime(0.02 + sp * 0.14, now, 0.3);
    this.lapFilter.frequency.setTargetAtTime(380 + sp * 500, now, 0.3);
    this.rainGain.gain.setTargetAtTime(p.rain * 0.22, now, 0.6);

    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 2.5 + Math.random() * 6;
      if (p.birds > 0.3 && Math.random() < p.birds) this.birdCall(now);
    }
    this.nextCricket -= dt;
    if (this.nextCricket <= 0) {
      this.nextCricket = 0.6 + Math.random() * 1.6;
      if (p.night > 0.5 && p.rain < 0.5) this.cricket(now);
    }
  }

  splash(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 + Math.random() * 500;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    const peak = 0.05 + strength * 0.12;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    src.connect(bp).connect(g).connect(this.fx);
    src.start(now, Math.random() * 2, 0.4);
  }

  bump(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.min(0.35, 0.1 + strength * 0.1), now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    o.connect(g).connect(this.fx);
    o.start(now);
    o.stop(now + 0.32);
    this.splash(Math.min(1, strength * 0.5));
  }

  private birdCall(t0: number): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.fx);
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2300 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.14 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = base * (1 + (Math.random() - 0.5) * 0.2);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.14);
    }
  }

  private cricket(t0: number): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    pan.connect(this.fx);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.05);
    }
  }
}
