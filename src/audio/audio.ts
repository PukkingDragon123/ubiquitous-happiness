// Audio: every sound is a real recording (CC0 / public domain, see src/assets/sfx/*CREDITS* and CREDITS.md). WebAudio graph:
//   sources -> per-sound gain/pan -> sfx bus -> underwater lowpass (+ a touch of reverb) -> master
//   music   -> music bus (crossfades) ------------------------------------------------^
//
//   audio.play('bite')                     id or variant group ("splash_s" picks splash_s1..5 at random)
//   audio.play('sw_swish', { x, vol, rate, jitter })   x = world x for stereo pan relative to the listener
//   const h = audio.loop('lp_reel'); h.set(vol, rate); h.stop()
//   audio.music('mu_abyss')                crossfade
//   audio.setUnderwater(0..1)              muffles everything (0 = dry air)
const SFX_IDS = import.meta.glob('/src/assets/sfx/*.ogg', { query: '?url', import: 'default', eager: false });
const MUSIC_IDS = import.meta.glob('/src/assets/music/*.ogg', { query: '?url', import: 'default', eager: false });
const idsOf = (g: Record<string, unknown>) => Object.keys(g).map((k) => k.split('/').pop()!.replace('.ogg', ''));
export const SFX_LIST = idsOf(SFX_IDS);
export const MUSIC_LIST = idsOf(MUSIC_IDS);

export interface PlayOpts { vol?: number; rate?: number; jitter?: number; x?: number; delay?: number; dry?: boolean }
export interface LoopHandle { set(vol: number, rate?: number): void; stop(fade?: number): void }

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; sfxBus!: GainNode; musicBus!: GainNode; dryBus!: GainNode;
  lowpass!: BiquadFilterNode;
  private buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null> | null>();
  private groups = new Map<string, string[]>();
  listenerX = 0;
  private cur: { id: string; g: GainNode; src: AudioBufferSourceNode } | null = null;
  volume = { master: 0.9, sfx: 0.9, music: 0.55 };
  private lastPlay = new Map<string, number>();

  constructor() {
    for (const id of SFX_LIST) {
      // variant groups: bite1..3 -> 'bite', coin_a..d -> 'coin', splash_s1..5 -> 'splash_s'
      const m = id.match(/^(.*?)(\d+)$/) || id.match(/^(.*?)_([a-d])$/);
      if (m) { const g = this.groups.get(m[1]) || []; g.push(id); this.groups.set(m[1], g); }
    }
  }

  /** must be called from a user gesture */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.volume.master;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.volume.sfx;
    this.dryBus = ctx.createGain(); this.dryBus.gain.value = this.volume.sfx;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.volume.music;
    this.lowpass = ctx.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 20000; this.lowpass.Q.value = 0.6;
    // short synthetic-free "room": a feedback delay pair gives an underwater slap-back
    const d1 = ctx.createDelay(0.5); d1.delayTime.value = 0.07;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const wet = ctx.createGain(); wet.gain.value = 0.18;
    this.sfxBus.connect(this.lowpass);
    this.lowpass.connect(this.master);
    this.lowpass.connect(d1); d1.connect(fb); fb.connect(d1); d1.connect(wet); wet.connect(this.master);
    this.dryBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(ctx.destination);
    for (const id of ['bubble1', 'bite1', 'squish1', 'splash_s1', 'k_click1', 'pop1']) this.load(id);
  }

  private url(id: string): Promise<string> | null {
    const k1 = `/src/assets/sfx/${id}.ogg`, k2 = `/src/assets/music/${id}.ogg`;
    const f = (SFX_IDS[k1] || MUSIC_IDS[k2]) as (() => Promise<string>) | undefined;
    return f ? f() : null;
  }

  load(id: string): Promise<AudioBuffer | null> | AudioBuffer | null {
    const have = this.buffers.get(id);
    if (have !== undefined) return have;
    if (!this.ctx) return null;
    const u = this.url(id);
    if (!u) { this.buffers.set(id, null); return null; }
    const ctx = this.ctx;
    const p = u.then((url) => fetch(url)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { this.buffers.set(id, buf); return buf; }).catch(() => { this.buffers.set(id, null); return null; });
    this.buffers.set(id, p);
    return p;
  }

  preload(ids: string[]) { for (const id of ids) this.resolve(id).forEach((r) => this.load(r)); }

  private resolve(id: string): string[] {
    if (SFX_LIST.includes(id) || MUSIC_LIST.includes(id)) return [id];
    return this.groups.get(id) || this.groups.get(id.replace(/_$/, '')) || [];
  }
  has(id: string) { return this.resolve(id).length > 0; }

  play(id: string, o: PlayOpts = {}) {
    if (!this.ctx) return;
    const ids = this.resolve(id);
    if (!ids.length) return;
    const now = this.ctx.currentTime;
    // never stack the same clip more than ~25 times a second
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < 0.04) return;
    this.lastPlay.set(id, now);
    const pick = ids[Math.floor(Math.random() * ids.length)];
    const b = this.load(pick);
    const go = (buf: AudioBuffer | null) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const j = o.jitter ?? 0.06;
      src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 2 * j);
      const g = this.ctx.createGain();
      g.gain.value = o.vol ?? 1;
      let node: AudioNode = g;
      if (o.x !== undefined) {
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.max(-0.85, Math.min(0.85, (o.x - this.listenerX) / 12));
        const dist = Math.abs(o.x - this.listenerX);
        g.gain.value *= Math.max(0.15, 1 - dist / 30);
        g.connect(pan); node = pan;
      }
      src.connect(g);
      node.connect(o.dry ? this.dryBus : this.sfxBus);
      src.start(this.ctx.currentTime + (o.delay ?? 0));
    };
    if (b instanceof Promise) b.then(go); else go(b);
  }

  loop(id: string, vol = 0.5, rate = 1): LoopHandle {
    const h = { g: null as GainNode | null, src: null as AudioBufferSourceNode | null, vol, rate, dead: false };
    const start = (buf: AudioBuffer | null) => {
      if (!buf || !this.ctx || h.dead) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.playbackRate.value = h.rate;
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(h.vol, this.ctx.currentTime, 0.08);
      src.connect(g); g.connect(this.sfxBus);
      src.start();
      h.g = g; h.src = src;
    };
    const ids = this.resolve(id);
    if (this.ctx && ids.length) { const b = this.load(ids[0]); if (b instanceof Promise) b.then(start); else start(b); }
    return {
      set: (v: number, r?: number) => {
        h.vol = v; if (r !== undefined) h.rate = r;
        if (h.g && this.ctx) h.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.06);
        if (h.src && r !== undefined && this.ctx) h.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.06);
      },
      stop: (fade = 0.2) => {
        h.dead = true;
        if (h.g && h.src && this.ctx) { h.g.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); const s = h.src; setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, fade * 1000 + 100); }
      },
    };
  }

  music(id: string | null, fade = 2.5) {
    if (!this.ctx) return;
    if (this.cur?.id === id) return;
    const ctx = this.ctx;
    if (this.cur) { const c = this.cur; c.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => { try { c.src.stop(); } catch { /* */ } }, fade * 1000 + 200); this.cur = null; }
    if (!id) return;
    const b = this.load(id);
    const go = (buf: AudioBuffer | null) => {
      if (!buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, ctx.currentTime, fade / 3);
      src.connect(g); g.connect(this.musicBus); src.start();
      this.cur = { id, g, src };
    };
    if (b instanceof Promise) b.then(go); else go(b);
  }

  /** 0 = in air, 1 = deep underwater */
  setUnderwater(k: number) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(900 / 20000, Math.max(0, Math.min(1, k)));
    this.lowpass.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
  }
  setVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master; this.sfxBus.gain.value = this.volume.sfx; this.dryBus.gain.value = this.volume.sfx; this.musicBus.gain.value = this.volume.music;
  }
}

export const audio = new AudioEngine();
