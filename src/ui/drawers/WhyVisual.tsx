/**
 * Schematic diagrams for the "why this design?" explainers. Each beat names a visual state
 * (`<demo>:<state>` in src/content/why.ts); every state has its own drawing so the picture
 * always shows what the text describes. Clearly schematic, not to scale.
 */
import { useEffect, useState, type ReactNode } from 'react';

function useTicker() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      setT((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

const INK = 'var(--ink-2)';
const MUTED = 'var(--ink-4)';
const ACC = 'var(--accent)';
const LOX = '#8fc6ff';
const RP1 = '#e0a24a';
const HOT = '#ff7a3d';
const EARTH = '#bcd3ea';

const T = ({ x, y, children, b, a = 'start' }: { x: number; y: number; children: ReactNode; b?: boolean; a?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} className={b ? 'wv-t' : 'wv-s'} textAnchor={a}>
    {children}
  </text>
);

/** A tank outline with a liquid level (0..1). */
function Tank({ x, y, w, h, fill, level, stroke = INK }: { x: number; y: number; w: number; h: number; fill: string; level: number; stroke?: string }) {
  const lh = (h - 4) * level;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={Math.min(w / 2.2, 14)} fill="none" stroke={stroke} strokeWidth="1.4" />
      <rect x={x + 2} y={y + h - 2 - lh} width={w - 4} height={lh} rx={Math.min((w - 4) / 2.4, 10)} fill={fill} opacity="0.55" />
    </g>
  );
}

function Bar({ x, y, w, h, fill, label }: { x: number; y: number; w: number; h: number; fill: string; label?: string }) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} fill={fill} opacity="0.75" />
      {label && <T x={x + w / 2} y={y + 11} a="middle">{label}</T>}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, color = ACC, w = 2 }: { x1: number; y1: number; x2: number; y2: number; color?: string; w?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 6;
  return (
    <g stroke={color} fill={color} strokeWidth={w}>
      <line x1={x1} y1={y1} x2={x2 - Math.cos(a) * h * 0.8} y2={y2 - Math.sin(a) * h * 0.8} />
      <path d={`M${x2} ${y2} L${x2 - Math.cos(a - 0.45) * h * 1.4} ${y2 - Math.sin(a - 0.45) * h * 1.4} L${x2 - Math.cos(a + 0.45) * h * 1.4} ${y2 - Math.sin(a + 0.45) * h * 1.4} Z`} stroke="none" />
    </g>
  );
}

/** A bell nozzle profile centred at cx, throat at ty, exit at ey with exit half-width r. */
function Bell({ cx, ty, ey, r, color = INK, ext = 0 }: { cx: number; ty: number; ey: number; r: number; color?: string; ext?: number }) {
  const th = 5;
  const d = `M${cx - 9} ${ty - 22} L${cx - 9} ${ty - 10} Q${cx - th} ${ty} ${cx - th} ${ty} Q${cx - r * 0.55} ${ty + (ey - ty) * 0.35} ${cx - r} ${ey} M${cx + 9} ${ty - 22} L${cx + 9} ${ty - 10} Q${cx + th} ${ty} ${cx + th} ${ty} Q${cx + r * 0.55} ${ty + (ey - ty) * 0.35} ${cx + r} ${ey}`;
  return (
    <g fill="none" stroke={color} strokeWidth="1.6">
      <path d={d} />
      {ext > 0 && <path d={`M${cx - r * 0.55} ${ty + (ey - ty) * 0.55} L${cx - r * 0.55} ${ty + (ey - ty) * 0.55}`} />}
    </g>
  );
}

function Plume({ cx, y, w, len, sep = false, t }: { cx: number; y: number; w: number; len: number; sep?: boolean; t: number }) {
  const f = 1 + 0.04 * Math.sin(t * 20);
  if (sep)
    return (
      <g>
        <path d={`M${cx - w * 0.35} ${y} Q${cx} ${y + len * 0.3} ${cx - w * 0.15} ${y + len} L${cx + w * 0.15} ${y + len} Q${cx} ${y + len * 0.3} ${cx + w * 0.35} ${y}`} fill={HOT} opacity="0.55" />
        <path d={`M${cx - w} ${y - 2} q -6 -10 -2 -18 M${cx + w} ${y - 2} q 6 -10 2 -18`} stroke={MUTED} fill="none" strokeDasharray="3 3" />
      </g>
    );
  return <path d={`M${cx - w} ${y} Q${cx - w * 1.1 * f} ${y + len * 0.5} ${cx - w * 0.5} ${y + len} L${cx + w * 0.5} ${y + len} Q${cx + w * 1.1 * f} ${y + len * 0.5} ${cx + w} ${y} Z`} fill={HOT} opacity="0.5" />;
}

function Earth({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill={EARTH} stroke={INK} strokeWidth="1" />;
}

export function WhyVisual({ visual }: { id?: string; beat?: number; visual: string }) {
  const t = useTicker();
  const state = visual.split(':')[1] ?? visual;
  let body: ReactNode;
  switch (state) {
    // ── staging ──
    case 'full-stack-mass-bars':
      body = (
        <>
          <T x={10} y={16} b>Start of burn</T>
          <Bar x={30} y={150} w={34} h={120} fill={RP1} label="propellant" />
          <Bar x={70} y={150} w={34} h={10} fill={INK} label="structure" />
          <T x={150} y={16} b>End of burn</T>
          <Bar x={170} y={150} w={34} h={2} fill={RP1} label="propellant" />
          <Bar x={210} y={150} w={34} h={10} fill={INK} label="structure" />
          <T x={140} y={172}>Δv grows with ln(start mass ÷ end mass)</T>
        </>
      );
      break;
    case 'single-stage-empty-tanks': {
      const k = (t % 5) / 5;
      body = (
        <>
          <T x={10} y={16} b>One stage, all the way</T>
          <Tank x={100} y={26} w={48} h={126} fill={RP1} level={1 - k * 0.92} />
          <rect x={112} y={10} width={24} height={16} rx={4} fill={ACC} opacity="0.7" />
          <T x={160} y={70}>the empty tank</T>
          <T x={160} y={82}>rides to the end</T>
          <T x={10} y={172}>443 t → 38 t: ideal Δv 7,507 m/s</T>
        </>
      );
      break;
    }
    case 'booster-drops-away': {
      const k = Math.min(1, (t % 5) / 3);
      body = (
        <>
          <T x={10} y={16} b>Two stages</T>
          <g transform={`translate(0 ${k * 30})`} opacity={1 - k * 0.8}>
            <Tank x={100} y={80} w={48} h={80} fill={RP1} level={0.02} />
            <T x={156} y={130}>empty booster dropped</T>
          </g>
          <Tank x={108} y={30} w={32} h={46} fill={LOX} level={0.8} stroke={ACC} />
          <rect x={114} y={14} width={20} height={14} rx={4} fill={ACC} opacity="0.7" />
          <T x={10} y={172}>4,178 + 5,933 = 10,111 m/s (same 312 s)</T>
        </>
      );
      break;
    }
    case 'upper-stage-vacuum-nozzle':
      body = (
        <>
          <T x={10} y={16} b>Each stage for its own job</T>
          <Bell cx={80} ty={70} ey={130} r={20} />
          <T x={80} y={150} a="middle">booster: 312 s</T>
          <Bell cx={190} ty={50} ey={150} r={40} color={ACC} />
          <T x={190} y={168} a="middle">upper stage: 342 s</T>
        </>
      );
      break;
    // ── separate tanks ──
    case 'lox-and-rp1-temperatures':
      body = (
        <>
          <Tank x={50} y={30} w={60} h={110} fill={LOX} level={0.85} />
          <T x={80} y={158} a="middle" b>LOX 90 K</T>
          <Tank x={170} y={30} w={60} h={110} fill={RP1} level={0.85} />
          <T x={200} y={158} a="middle" b>RP-1 ~290 K</T>
          <T x={140} y={176} a="middle">RP-1 would freeze at LOX temperature</T>
        </>
      );
      break;
    case 'injector-meets-propellants': {
      const k = (t % 1.5) / 1.5;
      body = (
        <>
          <path d="M60 30 H220 V60 H60 Z" fill="none" stroke={INK} />
          <T x={140} y={24} a="middle">injector face</T>
          {[80, 110, 140, 170, 200].map((x) => (
            <g key={x}>
              <line x1={x - 6} y1={60} x2={x - 6 + 6 * k} y2={60 + 30 * k} stroke={LOX} strokeWidth="2" />
              <line x1={x + 6} y1={60} x2={x + 6 - 6 * k} y2={60 + 30 * k} stroke={RP1} strokeWidth="2" />
            </g>
          ))}
          <rect x={60} y={96} width={160} height={40} fill={HOT} opacity={0.3 + 0.1 * Math.sin(t * 9)} />
          <T x={140} y={152} a="middle">they meet only in the chamber: 2.3 kg LOX per kg RP-1</T>
        </>
      );
      break;
    }
    case 'tank-volumes':
      body = (
        <>
          <Tank x={50} y={20} w={60} h={118} fill={LOX} level={0.97} />
          <T x={80} y={154} a="middle">LOX 230 t · 207.6 m³</T>
          <Tank x={170} y={65} w={60} h={73} fill={RP1} level={0.97} />
          <T x={200} y={154} a="middle">RP-1 100 t · 127.2 m³</T>
          <T x={140} y={174} a="middle">2.3 × the mass in 1.63 × the volume</T>
        </>
      );
      break;
    case 'common-bulkhead-cutaway':
      body = (
        <>
          <T x={10} y={16} b>Booster: intertank</T>
          <Tank x={30} y={24} w={44} h={58} fill={LOX} level={0.9} />
          <rect x={30} y={84} width={44} height={14} fill="none" stroke={MUTED} strokeDasharray="3 2" />
          <Tank x={30} y={100} w={44} h={52} fill={RP1} level={0.9} />
          <T x={150} y={16} b>Upper stage: common bulkhead</T>
          <rect x={170} y={24} width={52} height={128} rx={14} fill="none" stroke={INK} />
          <path d="M172 88 Q196 108 220 88" fill="none" stroke={ACC} strokeWidth="4" />
          <rect x={172} y={26} width={48} height={62} fill={LOX} opacity="0.5" />
          <rect x={172} y={100} width={48} height={50} rx={10} fill={RP1} opacity="0.5" />
          <T x={140} y={172}>insulating honeycomb core between the skins</T>
        </>
      );
      break;
    case 'downcomer-highlight':
      body = (
        <>
          <Tank x={110} y={14} w={60} h={70} fill={LOX} level={0.9} />
          <Tank x={110} y={90} w={60} h={62} fill={RP1} level={0.9} />
          <line x1={140} y1={84} x2={140} y2={164} stroke={LOX} strokeWidth="5" />
          <T x={180} y={50}>LOX on top: centre of mass forward</T>
          <T x={180} y={124}>the downcomer runs through the RP-1</T>
        </>
      );
      break;
    // ── pumps ──
    case 'chamber-pressure-gauge': {
      const a = -2.2 + Math.min(1, (t % 4) / 2) * 2.4;
      body = (
        <>
          <circle cx={140} cy={90} r={52} fill="none" stroke={INK} />
          <line x1={140} y1={90} x2={140 + Math.cos(a) * 44} y2={90 + Math.sin(a) * 44} stroke={ACC} strokeWidth="3" />
          <T x={140} y={126} a="middle" b>8.5 MPa</T>
          <T x={140} y={160} a="middle">about 84 times atmospheric pressure</T>
        </>
      );
      break;
    }
    case 'thick-wall-comparison':
      body = (
        <>
          <T x={10} y={16} b>Pressure-fed tank: wall ≥ 52 mm</T>
          <rect x={40} y={26} width={70} height={120} rx={16} fill="none" stroke={INK} strokeWidth="9" />
          <T x={150} y={60}>t = p · r ÷ σ</T>
          <T x={150} y={76}>8.5 MPa × 1.85 m ÷ 300 MPa</T>
          <T x={150} y={92}>LOX barrel alone ≥ 30 t</T>
          <T x={150} y={108}>(whole booster: 25.5 t)</T>
        </>
      );
      break;
    case 'shaft-spinning':
      body = (
        <>
          <rect x={30} y={30} width={60} height={110} rx={18} fill="none" stroke={INK} strokeWidth="1.2" />
          <T x={60} y={158} a="middle">thin tank, a few bar</T>
          <g transform="translate(160 85)">
            <circle r="26" fill="none" stroke={ACC} strokeWidth="2" />
            <g transform={`rotate(${(t * 120) % 360})`}>
              {[0, 60, 120, 180, 240, 300].map((q) => (
                <path key={q} d="M0 0 Q10 -6 22 -4" transform={`rotate(${q})`} stroke={ACC} strokeWidth="2" fill="none" />
              ))}
            </g>
          </g>
          <Arrow x1={92} y1={85} x2={130} y2={85} color={RP1} />
          <Arrow x1={190} y1={85} x2={262} y2={85} color={RP1} w={4} />
          <T x={200} y={72}>+8.5 MPa</T>
          <T x={160} y={150} a="middle">≥ 2.3 MW per engine (slowed)</T>
        </>
      );
      break;
    case 'gas-generator-exhaust':
      body = (
        <>
          <rect x={40} y={60} width={40} height={30} rx={6} fill="none" stroke={INK} />
          <T x={60} y={52} a="middle">gas generator</T>
          <Arrow x1={82} y1={75} x2={128} y2={75} color={HOT} />
          <circle cx={150} cy={75} r={20} fill="none" stroke={ACC} strokeWidth="2" />
          <T x={150} y={112} a="middle">turbine</T>
          <path d="M170 75 H220 V150" stroke="#555" strokeWidth="6" fill="none" opacity="0.6" />
          <T x={228} y={140}>dumped:</T>
          <T x={228} y={152}>~3 % of flow</T>
        </>
      );
      break;
    // ── nozzle ──
    case 'expansion-gradient':
      body = (
        <>
          <Bell cx={140} ty={50} ey={150} r={50} />
          {[0.1, 0.35, 0.6, 0.85].map((f, i) => (
            <line key={i} x1={140 - 6 - f * 44} y1={50 + f * 100} x2={140 + 6 + f * 44} y2={50 + f * 100} stroke={HOT} opacity={0.9 - f * 0.6} strokeWidth="3" />
          ))}
          <T x={200} y={70}>pressure falls</T>
          <T x={200} y={84}>speed rises</T>
          <T x={140} y={172} a="middle">expansion ratio = exit area ÷ throat area</T>
        </>
      );
      break;
    case 'e1-sea-level':
      body = (
        <>
          <Bell cx={140} ty={40} ey={110} r={28} />
          <Plume cx={140} y={110} w={28} len={55} t={t} />
          <T x={190} y={70}>E-1, ratio 18</T>
          <T x={190} y={84}>exit ~49 kPa</T>
          <T x={190} y={98}>sea level 101 kPa</T>
          <T x={140} y={176} a="middle">close enough: the flow stays attached</T>
        </>
      );
      break;
    case 'e1v-separated-at-sea-level':
      body = (
        <>
          <Bell cx={140} ty={30} ey={140} r={52} />
          <Plume cx={140} y={80} w={34} len={70} sep t={t} />
          {[-1, 1].map((s) => (
            <g key={s}>
              <Arrow x1={140 + s * 90} y1={150} x2={140 + s * 60} y2={128} color={INK} />
            </g>
          ))}
          <T x={10} y={16}>E-1V at sea level: exit ~5 kPa</T>
          <T x={140} y={172} a="middle">air pushes back 462 kN; flow separates</T>
        </>
      );
      break;
    case 'e1v-vacuum-plume':
      body = (
        <>
          <Bell cx={140} ty={30} ey={120} r={48} color={ACC} />
          <path d={`M92 120 Q60 160 30 178 L250 178 Q220 160 188 120 Z`} fill={HOT} opacity={0.18 + 0.03 * Math.sin(t * 8)} />
          <T x={10} y={16}>In vacuum nothing pushes back</T>
          <T x={140} y={172} a="middle">342 s vs 312 s: about 10 % more</T>
        </>
      );
      break;
    // ── cooling ──
    case 'flame-temperature-scale':
      body = (
        <>
          {[
            ['flame 3,500-3,700 K', 3600, HOT],
            ['Inconel 718 melts 1,533 K', 1533, INK],
            ['copper melts 1,358 K', 1358, '#c77b4e'],
          ].map(([label, k, c], i) => (
            <g key={i}>
              <rect x={20} y={30 + i * 44} width={(Number(k) / 3700) * 200} height={24} fill={String(c)} opacity="0.6" />
              <T x={24} y={30 + i * 44 + 40}>{label}</T>
            </g>
          ))}
        </>
      );
      break;
    case 'heat-flux-at-throat':
      body = (
        <>
          <Bell cx={140} ty={70} ey={150} r={46} />
          <path d="M131 30 V60 M149 30 V60" stroke={INK} />
          {[-1, 1].map((s) => (
            <Arrow key={s} x1={140 + s * 40} y1={70} x2={140 + s * 8} y2={70} color={HOT} w={3} />
          ))}
          <T x={196} y={74}>tens of MW/m²</T>
          <T x={196} y={88}>at the throat</T>
        </>
      );
      break;
    case 'coolant-flow': {
      const k = (t % 2) / 2;
      body = (
        <>
          <rect x={30} y={70} width={220} height={40} fill={HOT} opacity="0.35" />
          <T x={140} y={94} a="middle">hot gas</T>
          <rect x={30} y={56} width={220} height={12} fill="#c77b4e" opacity="0.6" />
          {Array.from({ length: 11 }, (_, i) => (
            <rect key={i} x={30 + ((i * 20 + k * 20) % 220)} y={48} width={10} height={6} fill={RP1} />
          ))}
          <Arrow x1={240} y1={40} x2={40} y2={40} color={RP1} />
          <T x={140} y={30} a="middle">all the RP-1 (~83 kg/s per E-1) flows through the channels</T>
          <T x={140} y={140} a="middle">the fuel is the heat sink; the heat returns to the chamber</T>
        </>
      );
      break;
    }
    case 'wall-temperature-profile':
      body = (
        <>
          <T x={10} y={16} b>ΔT = q · t ÷ k (30 MW/m², 1 mm)</T>
          <rect x={40} y={40} width={30} height={100} fill="#c77b4e" opacity="0.6" />
          <T x={55} y={156} a="middle">GRCop-42</T>
          <T x={55} y={170} a="middle">ΔT ≈ 87 K</T>
          <rect x={170} y={40} width={30} height={100} fill="#8f877d" opacity="0.6" />
          <T x={185} y={156} a="middle">Inconel 718</T>
          <T x={185} y={170} a="middle">ΔT ≈ 2,630 K</T>
          <Arrow x1={20} y1={90} x2={40} y2={90} color={HOT} />
          <Arrow x1={150} y1={90} x2={170} y2={90} color={HOT} />
        </>
      );
      break;
    case 'nozzle-extension-glow':
      body = (
        <>
          <Bell cx={140} ty={20} ey={60} r={20} />
          <path d="M120 60 L90 170 M160 60 L190 170" stroke="#b5552b" strokeWidth={3 + Math.sin(t * 3)} opacity="0.8" />
          {[80, 100, 120].map((y) => (
            <Arrow key={y} x1={140 + ((y - 60) / 110) * 50 + 12} y1={y} x2={140 + ((y - 60) / 110) * 50 + 40} y2={y - 6} color={HOT} w={1.5} />
          ))}
          <T x={196} y={100}>thin niobium skin</T>
          <T x={196} y={114}>radiates to space</T>
        </>
      );
      break;
    // ── turn ──
    case 'trajectory-arc':
      body = (
        <>
          <path d="M10 172 H270" stroke={INK} />
          <path d="M30 170 Q60 60 260 40" fill="none" stroke={ACC} strokeWidth="2" />
          <Arrow x1={200} y1={45} x2={250} y2={40} />
          <T x={150} y={30}>7,673 m/s sideways</T>
          <line x1={30} y1={170} x2={30} y2={40} stroke={MUTED} strokeDasharray="3 3" />
          <T x={36} y={60}>400 km up</T>
        </>
      );
      break;
    case 'force-arrows-liftoff':
      body = (
        <>
          <rect x={126} y={40} width={28} height={100} rx={8} fill="none" stroke={INK} />
          <Arrow x1={140} y1={150} x2={140} y2={30} color={HOT} w={4} />
          <Arrow x1={170} y1={90} x2={170} y2={160} color={LOX} w={4} />
          <T x={60} y={40}>thrust 5,320 kN</T>
          <T x={182} y={150}>weight 4,345 kN</T>
          <T x={140} y={176} a="middle">net 2.2 m/s² up; 9.81 m/s lost each second</T>
        </>
      );
      break;
    case 'pitch-kick-gimbal':
      body = (
        <>
          <g transform={`rotate(${4 * Math.sin(t)} 140 150)`}>
            <rect x={126} y={40} width={28} height={100} rx={8} fill="none" stroke={INK} />
          </g>
          <path d="M140 38 V10" stroke={MUTED} strokeDasharray="3 3" />
          <T x={170} y={40}>after the tower:</T>
          <T x={170} y={54}>tilt 1-2° east</T>
          <T x={170} y={68}>(engines gimbal)</T>
        </>
      );
      break;
    case 'gravity-turn-trace': {
      const pts = Array.from({ length: 40 }, (_, i) => {
        const s = i / 39;
        return `${20 + s * 240},${170 - Math.sin(Math.min(1, s * 1.15) * (Math.PI / 2)) * 140}`;
      }).join(' ');
      body = (
        <>
          <path d="M10 172 H270" stroke={INK} />
          <polyline points={pts} fill="none" stroke={ACC} strokeWidth="2" />
          <T x={40} y={60}>nose follows the airflow</T>
          <T x={40} y={74}>(small side loads at max-q)</T>
          <T x={170} y={60}>above the air:</T>
          <T x={170} y={74}>steer to level</T>
        </>
      );
      break;
    }
    // ── sideways ──
    case 'gravity-arrow-at-400km':
      body = (
        <>
          <Earth cx={140} cy={210} r={150} />
          <circle cx={140} cy={40} r={5} fill={ACC} />
          <Arrow x1={140} y1={46} x2={140} y2={80} color={LOX} w={3} />
          <T x={150} y={70}>8.69 m/s² (89 % of surface)</T>
        </>
      );
      break;
    case 'newton-cannon-arcs':
      body = (
        <>
          <Earth cx={140} cy={120} r={62} />
          <line x1={140} y1={58} x2={140} y2={40} stroke={INK} strokeWidth="3" />
          {[0.3, 0.55, 0.8].map((f, i) => (
            <path key={i} d={`M140 40 Q${140 + 50 + f * 60} ${40 + 10} ${140 + 30 + f * 40} ${40 + 40 + f * 30}`} fill="none" stroke={MUTED} strokeDasharray="3 2" />
          ))}
          <circle cx={140} cy={120} r={80} fill="none" stroke={ACC} strokeWidth="2" />
          <T x={10} y={172}>fast enough: the ground curves away as fast as it falls</T>
        </>
      );
      break;
    case 'one-second-fall-vs-curvature':
      body = (
        <>
          <path d="M20 60 Q140 52 260 60" fill="none" stroke={INK} />
          <path d="M20 100 Q140 60 260 100" fill="none" stroke={EARTH} strokeWidth="6" />
          <Arrow x1={40} y1={40} x2={240} y2={40} />
          <line x1={240} y1={40} x2={240} y2={52} stroke={LOX} strokeWidth="2" />
          <T x={60} y={30}>1 s: 7.67 km sideways</T>
          <T x={180} y={124}>falls 4.35 m</T>
          <T x={20} y={150}>the surface curves away by the same 4.35 m</T>
        </>
      );
      break;
    case 'suborbital-arc':
      body = (
        <>
          <path d="M10 172 H270" stroke={INK} />
          <path d="M90 170 Q140 -10 190 170" fill="none" stroke={ACC} strokeWidth="2" />
          <line x1={10} y1={90} x2={270} y2={90} stroke={MUTED} strokeDasharray="3 3" />
          <T x={200} y={86}>100 km</T>
          <T x={10} y={16}>height without sideways speed: a hop</T>
        </>
      );
      break;
    case 'earth-rotation-arrow':
      body = (
        <>
          <Earth cx={140} cy={100} r={62} />
          <path d="M100 60 Q140 40 180 60" fill="none" stroke={ACC} strokeWidth="2" />
          <Arrow x1={170} y1={54} x2={184} y2={63} />
          <circle cx={128} cy={70} r={4} fill={INK} />
          <T x={30} y={176}>the pad already moves east at ~408 m/s (28.5° N)</T>
        </>
      );
      break;
    default:
      body = <T x={20} y={90}>Illustration</T>;
  }
  return (
    <figure className="whyvis">
      <svg viewBox="0 0 280 180" role="img" aria-label="Schematic illustration">
        {body}
      </svg>
      <figcaption className="small muted">Schematic, not to scale</figcaption>
    </figure>
  );
}
