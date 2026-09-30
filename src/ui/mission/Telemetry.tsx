/**
 * A few unit-labelled reference values for the followed body (sampled ~5 times a second from
 * the reference trajectory; not a live flight computer).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { frame } from '../../scene/frame';
import { director } from '../../director/director';
import { atmosphere } from '../../scene/flight/atmosphere';
import { EARTH_AXIS, OMEGA_EARTH, R_EARTH, MU_EARTH, MU_MOON, R_MOON, moonPosition, moonVelocity } from '../../world/frames';
import { km, speed } from '../format';
import { bodyStateAt, makeBodyState } from '../../timeline/sample';

const OMEGA = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);
const tmp = new THREE.Vector3();
const air = new THREE.Vector3();
const sa = makeBodyState();
const sb = makeBodyState();
const DT = 0.5; // s, half-width of the difference
const moonP = new THREE.Vector3();
const moonV = new THREE.Vector3();
/** Inside this distance the Moon's gravity dominates (its sphere of influence), and the readout
 *  switches to heights and speeds relative to the Moon. */
const MOON_SOI = 66_100_000;

interface T {
  alt: number;
  v: number;
  vAir: number;
  mach: number;
  q: number;
  g: number;
  apo: number | null;
  peri: number | null;
  /** height above the Moon and speed relative to it, inside its sphere of influence */
  moonAlt: number | null;
  vMoon: number;
}

export function Telemetry() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    const h = window.setInterval(() => {
      const s = frame.bodies[director.focus];
      if (!s?.present) return setT(null);
      const r = s.pos.length();
      const alt = r - R_EARTH;
      air.copy(s.vel).sub(tmp.crossVectors(OMEGA, s.pos));
      const a = atmosphere(alt);
      const vAir = air.length();
      // felt (non-gravitational) acceleration, from the reference trajectory around this moment,
      // so it reads the same whether the mission is playing or paused
      // near the Moon: height above it and speed relative to it
      let moonAlt: number | null = null;
      let vMoon = 0;
      if (frame.tl?.id === 'lunar') {
        moonPosition(frame.missionTime, frame.tl.moonPhase0, moonP);
        const dm = moonP.distanceTo(s.pos);
        if (dm < MOON_SOI) {
          moonAlt = dm - R_MOON;
          vMoon = moonVelocity(frame.missionTime, frame.tl.moonPhase0, moonV).sub(s.vel).length();
        }
      }
      let g = 0;
      if (frame.tl && bodyStateAt(frame.tl, director.focus, frame.missionTime - DT, sa) && bodyStateAt(frame.tl, director.focus, frame.missionTime + DT, sb)) {
        const acc = tmp.copy(sb.vel).sub(sa.vel).divideScalar(2 * DT);
        acc.addScaledVector(s.pos, MU_EARTH / (r * r * r));
        if (moonAlt !== null) {
          const toMoon = moonP.clone().sub(s.pos);
          const dm = toMoon.length();
          acc.addScaledVector(toMoon, -MU_MOON / (dm * dm * dm));
        }
        g = acc.length() / 9.80665;
        if (!Number.isFinite(g) || !sa.present || !sb.present) g = 0;
      }
      // orbit from the state (two-body)
      const v2 = s.vel.lengthSq();
      const energy = v2 / 2 - MU_EARTH / r;
      let apo: number | null = null;
      let peri: number | null = null;
      if (energy < 0) {
        const aSemi = -MU_EARTH / (2 * energy);
        const h = new THREE.Vector3().crossVectors(s.pos, s.vel).length();
        const e = Math.sqrt(Math.max(0, 1 - (h * h) / (MU_EARTH * aSemi)));
        apo = aSemi * (1 + e) - R_EARTH;
        peri = aSemi * (1 - e) - R_EARTH;
      }
      setT({ alt, v: s.vel.length(), vAir, mach: vAir / a.soundSpeed, q: 0.5 * a.density * vAir * vAir, g, apo, peri, moonAlt, vMoon });
    }, 200);
    return () => window.clearInterval(h);
  }, []);
  if (!t) return null;
  return (
    <aside className="telemetry panel" aria-label="Reference telemetry">
      <div className="eyebrow">Reference trajectory</div>
      <dl>
        <div>
          <dt>{t.moonAlt !== null ? 'Above Earth' : 'Altitude'}</dt>
          <dd>{t.alt < 20000 ? `${Math.round(t.alt).toLocaleString('en-US')} m` : km(t.alt)}</dd>
        </div>
        {t.moonAlt !== null && (
          <div>
            <dt>Above the Moon</dt>
            <dd>{km(t.moonAlt)}</dd>
          </div>
        )}
        {/* in the air, speed relative to the (rotating) atmosphere; higher up, orbital speed;
            near the Moon, speed relative to the Moon */}
        <div>
          <dt>{t.moonAlt !== null ? 'Speed rel. Moon' : t.alt < 80000 ? 'Airspeed' : 'Orbital speed'}</dt>
          <dd>{speed(t.moonAlt !== null ? t.vMoon : t.alt < 80000 ? t.vAir : t.v)}</dd>
        </div>
        {t.alt < 90000 && (
          <div>
            <dt>Mach</dt>
            <dd>{t.mach.toFixed(1)}</dd>
          </div>
        )}
        {t.alt < 90000 && (
          <div>
            <dt>Dyn. pressure</dt>
            <dd>{(t.q / 1000).toFixed(1)} kPa</dd>
          </div>
        )}
        <div>
          <dt>Acceleration</dt>
          <dd>{t.g.toFixed(1)} g</dd>
        </div>
        {t.peri !== null && t.alt > 60000 && t.moonAlt === null && (
          <div>
            <dt>Orbit</dt>
            <dd>
              {t.peri < 0 ? 'Suborbital' : `${Math.round((t.peri ?? 0) / 1000)} × ${Math.round((t.apo ?? 0) / 1000).toLocaleString('en-US')} km`}
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
