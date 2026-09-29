/**
 * Sound, synthesized with the Web Audio API (no recorded samples, nothing to license):
 * engine rumble and crackle, aerodynamic wind, and mechanical one-shots on mission events
 * (ignition, hold-down release, separation, valves, parachutes, splashdown, docking).
 *
 * Realistic mode (default): sound needs air. External cameras in vacuum are silent; an
 * onboard camera hears only the structure-borne hum while engines run; a ground camera hears
 * the launch delayed by distance / speed of sound and attenuated with distance.
 * Cinematic mode: soundtrack-style sound everywhere, labelled as such in the interface.
 * Audio starts only after a user action (browser policy, and courtesy).
 */
import * as THREE from 'three';
import { useApp } from '../state/store';
import { playback } from '../state/playback';
import { frame } from '../scene/frame';
import { director } from '../director/director';
import { chan } from '../timeline/sample';
import { atmosphere } from '../scene/flight/atmosphere';
import type { MissionEvent } from '../timeline/types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rumbleGain: GainNode | null = null;
let crackleGain: GainNode | null = null;
let windGain: GainNode | null = null;
let rumbleFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function makeNoise(c: AudioContext, seconds = 3, brown = false): AudioBuffer {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < d.length; i++) {
    const w = rnd();
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return b;
}

function loopSource(c: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start();
  return s;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(ctx, 3, false);
  const brown = makeNoise(ctx, 4, true);
  // rumble: brown noise, low-passed
  rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 180;
  rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0;
  loopSource(ctx, brown).connect(rumbleFilter).connect(rumbleGain).connect(master);
  // crackle: white noise through a band-pass, amplitude-modulated
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  crackleGain = ctx.createGain();
  crackleGain.gain.value = 0;
  loopSource(ctx, noiseBuf).connect(bp).connect(crackleGain).connect(master);
  // wind: white noise, high-passed and slowly swept
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 1400;
  hp.Q.value = 0.4;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  loopSource(ctx, noiseBuf).connect(hp).connect(windGain).connect(master);
  return ctx;
}

type OneShot = NonNullable<MissionEvent['sound']>;

function oneShot(kind: OneShot, level = 1) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const t0 = c.currentTime + 0.01;
  const g = c.createGain();
  g.connect(master);
  const noise = (dur: number, type: BiquadFilterType, f: number, q = 1, peak = 0.5) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const e = c.createGain();
    e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(peak * level, t0 + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt).connect(e).connect(g);
    s.start(t0, Math.random() * 2);
    s.stop(t0 + dur + 0.05);
  };
  const tone = (f0: number, f1: number, dur: number, peak = 0.5, type: OscillatorType = 'sine') => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const e = c.createGain();
    e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(peak * level, t0 + 0.01);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(e).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };
  switch (kind) {
    case 'ignition':
      tone(70, 38, 1.6, 0.7);
      noise(1.4, 'lowpass', 500, 0.7, 0.5);
      break;
    case 'release':
    case 'touchdown':
      tone(90, 45, 0.5, 0.6);
      noise(0.35, 'lowpass', 900, 1, 0.4);
      break;
    case 'sep':
      noise(0.5, 'bandpass', 2600, 2, 0.35);
      tone(140, 70, 0.35, 0.4, 'triangle');
      break;
    case 'pyro':
      noise(0.25, 'highpass', 1800, 0.7, 0.6);
      break;
    case 'valve':
      noise(0.6, 'bandpass', 5200, 3, 0.18);
      break;
    case 'rcs':
      noise(0.3, 'highpass', 3500, 0.8, 0.2);
      break;
    case 'chute':
      noise(0.9, 'bandpass', 700, 0.6, 0.45);
      tone(220, 120, 0.25, 0.2, 'triangle');
      break;
    case 'splash':
      noise(1.8, 'lowpass', 1400, 0.5, 0.6);
      break;
    case 'dock':
      tone(310, 250, 0.4, 0.35, 'square');
      noise(0.2, 'bandpass', 3000, 4, 0.3);
      break;
    case 'cutoff':
      tone(60, 30, 0.8, 0.4);
      break;
  }
}

const tmp = new THREE.Vector3();

/** Is the listener somewhere sound can reach it (realistic mode)? */
function hearing(): { air: number; onboard: boolean } {
  const onboard = director.mode === 'onboard';
  const alt = frame.camAlt;
  const p = atmosphere(Math.max(0, alt)).pressure / 101325;
  return { air: Math.min(1, p * 4), onboard };
}

let installed = false;

export function installAudio() {
  if (installed) return;
  installed = true;
  const unlock = () => {
    const c = ensure();
    void c?.resume();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx?.suspend();
    else if (useApp.getState().sound !== 'off') void ctx?.resume();
  });
  playback.onEvent.add((e) => {
    const mode = useApp.getState().sound;
    if (mode === 'off' || !e.sound || !ctx || ctx.state !== 'running') return;
    if (frame.location !== 'flight') return;
    const h = hearing();
    const level = mode === 'cinematic' ? 1 : h.onboard ? 0.8 : h.air;
    if (level > 0.02) oneShot(e.sound, level);
  });
  // continuous layers, updated a few times a second from the displayed state
  const delayed: { t: number; v: number }[] = [];
  window.setInterval(() => {
    if (!ctx || !rumbleGain || !crackleGain || !windGain || !rumbleFilter) return;
    const mode = useApp.getState().sound;
    const now = ctx.currentTime;
    const tl = frame.tl;
    const on = mode !== 'off' && frame.location === 'flight' && !!tl && !frame.paused;
    let thrust = 0;
    if (tl) thrust = chan(tl, 's1.center.throttle', frame.missionTime) + 6 * chan(tl, 's1.outer.throttle', frame.missionTime) + 1.2 * chan(tl, 's2.throttle', frame.missionTime) + 0.3 * chan(tl, 'sm.throttle', frame.missionTime) + 2 * chan(tl, 'les.motor', frame.missionTime);
    thrust = Math.min(1, thrust / 7);
    // ground listeners hear the engines late: distance / 343 m/s
    delayed.push({ t: frame.missionTime, v: thrust });
    while (delayed.length > 400) delayed.shift();
    const h = hearing();
    const subj = frame.bodies[director.focus];
    const dist = subj?.present ? tmp.copy(subj.pos).sub(frame.camAbs).length() : 100;
    let heard = thrust;
    let level = 0;
    if (mode === 'cinematic') level = thrust > 0 ? 0.9 : 0;
    else if (h.onboard) level = thrust * 0.55;
    else {
      const lag = dist / 343;
      let past = delayed[0];
      for (let i = delayed.length - 1; i >= 0; i--)
        if (delayed[i].t <= frame.missionTime - lag) {
          past = delayed[i];
          break;
        }
      heard = past ? past.v : 0;
      level = heard * h.air * Math.min(1, 900 / Math.max(60, dist));
    }
    if (!on) level = 0;
    rumbleGain.gain.setTargetAtTime(level * 0.9, now, 0.15);
    crackleGain.gain.setTargetAtTime(level * (h.onboard ? 0.05 : 0.22), now, 0.1);
    rumbleFilter.frequency.setTargetAtTime(h.onboard ? 90 : 160 + 120 * heard, now, 0.2);
    // wind grows with dynamic pressure on moving cameras in the air
    let wind = 0;
    if (on && subj?.present && (director.mode === 'onboard' || director.mode === 'chase')) {
      const a = atmosphere(Math.max(0, frame.camAlt));
      const v = subj.vel.length();
      wind = Math.min(0.35, (0.5 * a.density * v * v) / 90000);
    }
    windGain.gain.setTargetAtTime(mode === 'off' ? 0 : wind, now, 0.3);
    if (mode === 'off' && ctx.state === 'running') void ctx.suspend();
    else if (mode !== 'off' && ctx.state === 'suspended' && !document.hidden) void ctx.resume();
  }, 120);
}
