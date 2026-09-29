/**
 * Procedural canvas textures owned by the vehicle module (created once per page, shared).
 * Section hatching for cut faces, the honeycomb core in section, flow-overlay chevrons and a
 * wound-filament pattern for the composite pressure vessels.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(key: string, make: () => HTMLCanvasElement, srgb: boolean, repeat = true): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = new THREE.CanvasTexture(make());
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Technical-section hatching: thin diagonal lines on a light ground (one period per texture). */
export function hatchTexture(): THREE.Texture {
  return tex(
    'hatch',
    () => {
      const S = 64;
      const [c, g] = canvas(S, S);
      g.fillStyle = '#efe6d6';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#b8412f';
      g.lineWidth = 7;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(k * S - 4, S + 4);
        g.lineTo(k * S + S + 4, -4);
        g.stroke();
      }
      return c;
    },
    true,
  );
}

/**
 * Honeycomb core seen in section: cell walls cut across the core show as fine lines normal to
 * the face sheets. U runs along the panel (m), V across the core (0..1).
 */
export function honeycombSectionTexture(): THREE.Texture {
  return tex(
    'honeySection',
    () => {
      const W = 128;
      const H = 32;
      const [c, g] = canvas(W, H);
      g.fillStyle = '#8a7b62';
      g.fillRect(0, 0, W, H);
      // cell walls: alternating single and doubled walls (the bonded ribbon direction)
      g.fillStyle = '#d9cfb8';
      for (let i = 0; i < 4; i++) {
        const x = i * 32;
        g.fillRect(x, 0, i % 2 ? 3 : 5, H);
      }
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, 0, W, 2);
      g.fillRect(0, H - 2, W, 2);
      return c;
    },
    true,
  );
}

/** Honeycomb cell pattern (seen face-on, for exposed core surfaces). */
export function honeycombFaceTexture(): THREE.Texture {
  return tex(
    'honeyFace',
    () => {
      const S = 128;
      const [c, g] = canvas(S, S);
      g.fillStyle = '#6f6554';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = '#d8ceb6';
      g.lineWidth = 2;
      const r = S / 6;
      const h = r * Math.sqrt(3);
      for (let row = -1; row < 5; row++)
        for (let col = -1; col < 5; col++) {
          const cx = col * r * 1.5;
          const cy = row * h + (col % 2 ? h / 2 : 0);
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            if (k) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        }
      return c;
    },
    true,
  );
}

/** Flow overlay: chevrons pointing along +U on a transparent strip (white; tinted by the material). */
export function chevronTexture(): THREE.Texture {
  return tex(
    'chevron',
    () => {
      const W = 128;
      const H = 64;
      const [c, g] = canvas(W, H);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(20, 0);
      g.lineTo(70, 0);
      g.lineTo(110, H / 2);
      g.lineTo(70, H);
      g.lineTo(20, H);
      g.lineTo(60, H / 2);
      g.closePath();
      g.fill();
      return c;
    },
    true,
  );
}

/** Filament-wound overwrap: helical bands for COPVs (grey-black composite). */
export function woundTexture(): THREE.Texture {
  return tex(
    'wound',
    () => {
      const S = 256;
      const [c, g] = canvas(S, S);
      g.fillStyle = '#26272a';
      g.fillRect(0, 0, S, S);
      for (let i = -S; i < S * 2; i += 8) {
        g.strokeStyle = i % 16 ? '#2f3034' : '#1d1e21';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + S * 0.55, S);
        g.stroke();
      }
      for (let y = 0; y < S; y += 64) {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(0, y, S, 10);
      }
      return c;
    },
    true,
  );
}

/** Woven ceramic fabric (thermal boots): a fine basket weave, light grey-beige. */
export function fabricTexture(): THREE.Texture {
  return tex(
    'fabric',
    () => {
      const S = 64;
      const [c, g] = canvas(S, S);
      g.fillStyle = '#cfc8ba';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 8)
        for (let x = 0; x < S; x += 8) {
          const over = ((x + y) / 8) % 2 === 0;
          g.fillStyle = over ? '#dcd6ca' : '#bdb5a5';
          g.fillRect(x + 1, y + 1, over ? 6 : 6, over ? 6 : 6);
        }
      return c;
    },
    true,
  );
}

export function disposeVehicleTextures() {
  // textures are shared across vehicle instances for the life of the page (small, bounded)
}
