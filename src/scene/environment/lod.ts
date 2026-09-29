/**
 * Level of detail for the local terrain: a restricted (2:1 balanced) quadtree of square tiles
 * over the site map, refined toward "foci" (the pad, the flame-trench mouth, the landing zone
 * and the ground camera sites) so cells are about a metre at the pad, tens of metres a
 * kilometre out and kilometres at the disk's fading edge. Each leaf is a Q x Q grid of cells;
 * where a leaf meets a coarser neighbour, its in-between edge vertices are snapped onto the
 * neighbour's edge so there are no cracks (no T-junction gaps). Pure geometry: the caller
 * supplies the surface height.
 */

export interface Focus {
  x: number;
  z: number;
  /** Cell size wanted at the focus (m). */
  cMin: number;
  /** Growth of the cell size with distance (m per m). */
  k: number;
}

export interface LodOptions {
  /** Half size of the root square (m), centred on the pad. */
  ext: number;
  /** Cells per leaf side. */
  q: number;
  foci: Focus[];
  /** Quadratic growth term: the wanted cell size gains d^2 / far (m) at distance d from a focus. */
  far: number;
  /** Tiles entirely beyond this distance from the pad are dropped (m). */
  rOuter: number;
  maxLevel: number;
}

export interface Leaf {
  level: number;
  ix: number;
  iz: number;
  x0: number;
  z0: number;
  size: number;
}

const key = (level: number, ix: number, iz: number) => `${level}:${ix}:${iz}`;

function rectDist(x: number, z: number, x0: number, z0: number, s: number): number {
  const dx = Math.max(x0 - x, 0, x - (x0 + s));
  const dz = Math.max(z0 - z, 0, z - (z0 + s));
  return Math.hypot(dx, dz);
}

/** Wanted cell size over a tile: the smallest over the foci at their nearest point of the tile. */
function wanted(o: LodOptions, x0: number, z0: number, s: number): number {
  let best = Infinity;
  for (const f of o.foci) {
    const d = rectDist(f.x, f.z, x0, z0, s);
    best = Math.min(best, f.cMin + f.k * d + (d * d) / o.far);
  }
  return best;
}

export class Quadtree {
  leaves = new Map<string, Leaf>();
  constructor(public o: LodOptions) {
    this.split(0, 0, 0);
    this.balance();
  }

  private tile(level: number, ix: number, iz: number): Leaf {
    const size = (2 * this.o.ext) / 2 ** level;
    return { level, ix, iz, size, x0: -this.o.ext + ix * size, z0: -this.o.ext + iz * size };
  }

  private split(level: number, ix: number, iz: number) {
    const t = this.tile(level, ix, iz);
    if (rectDist(0, 0, t.x0, t.z0, t.size) > this.o.rOuter) return;
    if (level < this.o.maxLevel && t.size / this.o.q > wanted(this.o, t.x0, t.z0, t.size)) {
      for (const [a, b] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        this.split(level + 1, ix * 2 + a, iz * 2 + b);
    } else this.leaves.set(key(level, ix, iz), t);
  }

  /** The leaf covering point (x, z) at level <= maxLevel, or null (outside / dropped). */
  leafAt(x: number, z: number, fromLevel = this.o.maxLevel): Leaf | null {
    const e = this.o.ext;
    if (x < -e || z < -e || x >= e || z >= e) return null;
    for (let l = fromLevel; l >= 0; l--) {
      const s = (2 * e) / 2 ** l;
      const leaf = this.leaves.get(key(l, Math.floor((x + e) / s), Math.floor((z + e) / s)));
      if (leaf) return leaf;
    }
    return null;
  }

  /** The leaf across edge `dir` (0 -x, 1 +x, 2 -z, 3 +z) of `t`, sampled at the edge's midpoint. */
  neighbour(t: Leaf, dir: number): Leaf | null {
    const eps = t.size * 1e-3;
    const mx = t.x0 + t.size / 2;
    const mz = t.z0 + t.size / 2;
    const x = dir === 0 ? t.x0 - eps : dir === 1 ? t.x0 + t.size + eps : mx;
    const z = dir === 2 ? t.z0 - eps : dir === 3 ? t.z0 + t.size + eps : mz;
    return this.leafAt(x, z);
  }

  /** Split leaves until every neighbour across an edge is at most one level coarser. */
  private balance() {
    const queue = [...this.leaves.values()];
    while (queue.length) {
      const t = queue.pop()!;
      if (this.leaves.get(key(t.level, t.ix, t.iz)) !== t) continue;
      for (let dir = 0; dir < 4; dir++) {
        const n = this.neighbour(t, dir);
        if (!n || n.level >= t.level - 1) continue;
        this.leaves.delete(key(n.level, n.ix, n.iz));
        for (const [a, b] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const c = this.tile(n.level + 1, n.ix * 2 + a, n.iz * 2 + b);
          this.leaves.set(key(c.level, c.ix, c.iz), c);
          queue.push(c);
        }
        queue.push(t);
        break;
      }
    }
  }
}

export interface TileMesh {
  position: Float32Array;
  index: Uint32Array;
}

/**
 * Triangulate the leaves selected by `use` into one indexed mesh with shared vertices.
 * `surface(x, z, out)` writes the vertex position (it may lift the point off the plane); `skip`
 * drops cells whose four corners it rejects (hidden under structures).
 */
export function triangulate(
  tree: Quadtree,
  use: (t: Leaf) => boolean,
  surface: (x: number, z: number) => [number, number, number],
  skip?: (x: number, z: number) => boolean,
): TileMesh {
  const q = tree.o.q;
  const pos: number[] = [];
  const idx: number[] = [];
  const shared = new Map<number, number>();
  const finest = (2 * tree.o.ext) / 2 ** tree.o.maxLevel / q;
  const grid = (v: number) => Math.round((v + tree.o.ext) / finest);
  const span = 2 ** 22;
  const vert = (x: number, z: number): number => {
    const k = grid(x) * span + grid(z);
    let i = shared.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      pos.push(...surface(x, z));
      shared.set(k, i);
    }
    return i;
  };
  const leaves = [...tree.leaves.values()].filter(use);
  const ids = new Int32Array((q + 1) * (q + 1));
  for (const t of leaves) {
    const c = t.size / q;
    const coarse = [0, 1, 2, 3].map((d) => {
      const n = tree.neighbour(t, d);
      return !!n && n.level < t.level;
    });
    for (let j = 0; j <= q; j++)
      for (let i = 0; i <= q; i++) {
        const x = t.x0 + i * c;
        const z = t.z0 + j * c;
        // an odd vertex on an edge shared with a coarser leaf sits on that leaf's edge
        const onW = i === 0 && coarse[0];
        const onE = i === q && coarse[1];
        const onN = j === 0 && coarse[2];
        const onS = j === q && coarse[3];
        if (((onW || onE) && j % 2 === 1) || ((onN || onS) && i % 2 === 1)) {
          const along = onW || onE;
          const a = along ? vert(x, z - c) : vert(x - c, z);
          const b = along ? vert(x, z + c) : vert(x + c, z);
          ids[j * (q + 1) + i] = pos.length / 3;
          for (let k = 0; k < 3; k++) pos.push((pos[a * 3 + k] + pos[b * 3 + k]) / 2);
        } else ids[j * (q + 1) + i] = vert(x, z);
      }
    for (let j = 0; j < q; j++)
      for (let i = 0; i < q; i++) {
        const x = t.x0 + i * c;
        const z = t.z0 + j * c;
        if (skip && skip(x, z) && skip(x + c, z) && skip(x, z + c) && skip(x + c, z + c)) continue;
        const a = ids[j * (q + 1) + i];
        const b = ids[j * (q + 1) + i + 1];
        const d = ids[(j + 1) * (q + 1) + i];
        const e = ids[(j + 1) * (q + 1) + i + 1];
        // counter-clockwise seen from above (+y) with x east and z south; alternate the diagonal
        if ((i + j) % 2 === 0) idx.push(a, d, e, a, e, b);
        else idx.push(a, d, b, b, d, e);
      }
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}
