/**
 * A few unit-labelled reference values for the followed body (sampled ~5 times a second from
 * the reference trajectory; not a live flight computer).
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { frame } from '../../scene/frame';
import { director } from '../../director/director';
import { atmosphere } from '../../scene/flight/atmosphere';
import { EARTH_AXIS, OMEGA_EARTH, R_EARTH, MU_EARTH } from '../../world/frames';
import { km, speed } from '../format';

const OMEGA = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);
const tmp = new THREE.Vector3();
const air = new THREE.Vector3();

interface T {
  alt: number;
  v: number;
  vAir: number;
  mach: number;
  q: number;
  g: number;
  apo: number | null;
  peri: number | null;
}

export function Telemetry() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    let lastV: THREE.Vector3 | null = null;
    let lastT = 0;
    const h = window.setInterval(() => {
      const s = frame.bodies[director.focus];
      if (!s?.present) return setT(null);
      const r = s.pos.length();
      const alt = r - R_EARTH;
      air.copy(s.vel).sub(tmp.crossVectors(OMEGA, s.pos));
      const a = atmosphere(alt);
      const vAir = air.length();
      // non-gravitational acceleration from the velocity change minus gravity (what is felt)
      let g = 0;
      if (lastV && frame.missionTime !== lastT) {
        const dt = frame.missionTime - lastT;
        const acc = tmp.copy(s.vel).sub(lastV).divideScalar(dt);
        const grav = s.pos.clone().multiplyScalar(-MU_EARTH / (r * r * r));
        g = acc.sub(grav).length() / 9.80665;
        if (!Number.isFinite(g) || dt < 0 || dt > 30) g = 0;
      }
      lastV = s.vel.clone();
      lastT = frame.missionTime;
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
      setT({ alt, v: s.vel.length(), vAir, mach: vAir / a.soundSpeed, q: 0.5 * a.density * vAir * vAir, g, apo, peri });
    }, 200);
    return () => window.clearInterval(h);
  }, []);
  if (!t) return null;
  return (
    <aside className="telemetry panel" aria-label="Reference telemetry">
      <div className="eyebrow">Reference trajectory</div>
      <dl>
        <div>
          <dt>Altitude</dt>
          <dd>{t.alt < 20000 ? `${Math.round(t.alt).toLocaleString('en-US')} m` : km(t.alt)}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{speed(t.v)}</dd>
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
        {t.peri !== null && t.alt > 60000 && (
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
