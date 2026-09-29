/**
 * Drag coefficients (reference area = frontal area of the body diameter). Simple tables with
 * linear interpolation in Mach, representative of the configurations:
 *  - slender launch vehicle, nose first: about 0.3 subsonic, a transonic peak of about 0.55
 *    near Mach 1.1, falling to about 0.25 by Mach 5;
 *  - booster falling tail first with grid fins out: about 1.0 (blunt base, fins);
 *  - blunt capsule, heat shield first: about 1.3 hypersonic, a little lower subsonic.
 * Parachute drag areas (Cd*S) are handled separately (entry.ts).
 */

function table(m: number[], c: number[]) {
  return (mach: number): number => {
    if (mach <= m[0]) return c[0];
    const n = m.length;
    if (mach >= m[n - 1]) return c[n - 1];
    let i = 0;
    while (mach > m[i + 1]) i++;
    const u = (mach - m[i]) / (m[i + 1] - m[i]);
    return c[i] + (c[i + 1] - c[i]) * u;
  };
}

export const cdSlender = table([0, 0.6, 0.85, 1.0, 1.1, 1.3, 1.6, 2.0, 3.0, 4.0, 5.0, 10], [0.3, 0.3, 0.36, 0.5, 0.55, 0.52, 0.46, 0.4, 0.32, 0.28, 0.25, 0.24]);
export const cdBoosterTailFirst = table([0, 0.6, 1.0, 1.2, 2.0, 5.0, 10], [0.85, 0.9, 1.1, 1.15, 1.05, 1.0, 1.0]);
export const cdCapsule = table([0, 0.6, 0.9, 1.2, 2.0, 5.0, 30], [1.05, 1.08, 1.18, 1.25, 1.3, 1.3, 1.3]);
/** A tumbling fairing half, shell or tower: blunt. */
export const cdTumbling = (_mach: number): number => 1.2;
/** Satellite or upper stage coasting (only matters low in LEO): free-molecular ~2.2. */
export const cdFreeMolecular = (_mach: number): number => 2.2;
