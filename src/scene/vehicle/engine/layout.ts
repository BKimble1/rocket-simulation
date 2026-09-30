/**
 * Powerhead layout shared by the geometry, the mechanisms and the flow overlay: turbopump
 * stations and the centre lines of every propellant, gas and signal route (engine frame).
 *
 * Turbopump: one vertical shaft beside the chamber at (tpX, 0) in the section plane; from the
 * top: LOX inlet, LOX inducer and impeller with its volute, bearing, inter-propellant seal,
 * bearing, fuel inlet plenum (side inlet), fuel inducer and impeller with its volute, bearing,
 * turbine exhaust collector, turbine wheel, stator nozzle ring and inlet plenum, then the gas
 * generator directly below, burning fuel-rich and blowing up into the turbine.
 */
import * as THREE from 'three';
import type { Design } from './design';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Turbopump stations (y, engine frame) and radii. */
export const TP = {
  loxInletTop: 0,
  loxVoluteY: -0.127,
  fuelVoluteY: -0.381,
  bearingsY: [-0.176, -0.284, -0.44],
  sealY: [-0.2, -0.255] as [number, number],
  fuelInletY: -0.318,
  collectorY: -0.497,
  turbineY: -0.54,
  ggTop: -0.64,
  ggHeadY: -0.866,
  ggBottom: -0.909,
  /** Volute: section radius grows from rho0 to rho1, inner edge at rin. */
  volute: { rho0: 0.012, rho1: 0.04, rin: 0.094 },
  loxDuctR: 0.082,
  fuelDuctR: 0.058,
  loxLineR: 0.05,
  fuelLineR: 0.037,
  exhaustR: 0.062,
  tapR: 0.012,
  /** Fuel feed duct: vertical run in front of the pump (z) and interface height. */
  fuelDuctZ: 0.215,
  bellowsY: [0.03, 0.17] as [number, number],
};

/** The helium lines end in a union this far below the stage interface (m); a hose spans the rest. */
export const HE_UNION_DROP = 0.09;

/** Largest axis distance of the fuel line centre (line and clamps stay inside the envelope). */
const LINE_R_MAX = 0.522;

/** Plan angle (lathe convention) of the turbine exhaust duct run. */
export const EXHAUST_PHI = (138 * Math.PI) / 180;

export interface Routes {
  loxInlet: THREE.Vector3[];
  fuelInlet: THREE.Vector3[];
  loxDischarge: THREE.Vector3[];
  movToDome: THREE.Vector3[];
  fuelDischarge: THREE.Vector3[];
  fuelDown: THREE.Vector3[];
  loxTap: THREE.Vector3[];
  fuelTap: THREE.Vector3[];
  exhaust: THREE.Vector3[];
  igniterToInjector: THREE.Vector3[];
  igniterToGG: THREE.Vector3[];
  helium: THREE.Vector3[][];
  /** Harness branches from the junction box. */
  harness: THREE.Vector3[][];
  /** Useful points. */
  pts: {
    loxVoluteExit: THREE.Vector3;
    fuelVoluteExit: THREE.Vector3;
    domePort: THREE.Vector3;
    movIn: THREE.Vector3;
    movOut: THREE.Vector3;
    mfvIn: THREE.Vector3;
    mfvOut: THREE.Vector3;
    manifoldIn: THREE.Vector3;
    ggLoxPort: THREE.Vector3;
    ggFuelPort: THREE.Vector3;
    exhaustStart: THREE.Vector3;
    hxTop: number;
    hxBot: number;
    igniter: THREE.Vector3;
    junction: THREE.Vector3;
  };
}

export function routes(d: Design): Routes {
  const x = d.tpX;
  const vo = TP.volute;
  const rEnd = vo.rin + vo.rho1;
  const loxVoluteExit = v(x, TP.loxVoluteY, -rEnd);
  const fuelVoluteExit = v(x, TP.fuelVoluteY, -rEnd);
  const mov = v(d.mov.x, d.mov.y, d.mov.z);
  const movIn = mov.clone().add(v(-0.07, 0, 0));
  const movOut = mov.clone().add(v(0.07, 0, 0));
  // dome side port at the MOV height
  const yb = d.domeBaseY;
  const domeRAt = (y: number) => d.domeR * Math.sqrt(Math.max(0, 1 - ((y - yb) / d.domeH) ** 2));
  const domePort = v(-domeRAt(mov.y) + 0.012, mov.y, 0);
  const mfv = v(d.mfv.x, d.mfv.y, d.mfv.z);
  const mfvIn = mfv.clone().add(v(0, 0.055, 0));
  const mfvOut = mfv.clone().add(v(0, -0.055, 0));

  // LOX: pump discharge (heading -X behind the pump) around the back of the dome to the
  // main LOX valve on the -X side, then straight into the dome
  const loxDischarge = [
    loxVoluteExit.clone(),
    v(x - 0.12, TP.loxVoluteY, -rEnd),
    v(0.14, -0.17, -0.3),
    v(-0.18, -0.19, -0.31),
    // (the last corner sits 0.08 m outboard of the valve inlet so the elbow into it can take a
    // bend radius of 1.6 pipe radii; a tighter corner folds the inside of the elbow over itself)
    v(-0.5, -0.19, -0.13),
    v(-0.5, -0.19, 0),
    movIn.clone(),
  ];
  const movToDome = [movOut.clone(), domePort.clone()];

  // RP-1: pump discharge around the back of the chamber to the main fuel valve on the -X
  // side, then down the bell to the coolant inlet manifold
  const fuelDischarge = [
    fuelVoluteExit.clone(),
    v(x - 0.1, TP.fuelVoluteY, -rEnd),
    v(0.12, -0.4, -0.35),
    v(-0.2, -0.41, -0.33),
    v(-0.4, -0.42, -0.14),
    // (no collinear point below this corner: it would cap the elbow's radius at 35 mm, under
    // the pipe's own radius)
    v(-0.4, -0.44, 0),
    mfvIn.clone(),
  ];
  const ym = d.y(d.manifoldX);
  const manifoldR = d.manifoldR;
  // the line drops onto an inlet boss on top of the torus (a little outboard of its centre line)
  const lineR = Math.min(manifoldR + 0.012, LINE_R_MAX);
  const manifoldIn = v(-Math.min(manifoldR + 0.004, LINE_R_MAX), ym + 0.022, 0);
  const fuelDown: THREE.Vector3[] = [mfvOut.clone()];
  const standoff = TP.fuelLineR + 0.008;
  for (let y = mfvOut.y - 0.12; y > ym + 0.16; y -= 0.1) {
    const r = Math.min(LINE_R_MAX, Math.max(-mfv.x, d.rOut(y) + standoff));
    fuelDown.push(v(-r, y, 0));
  }
  fuelDown.push(v(-lineR, ym + 0.1, 0), manifoldIn.clone());

  // feed ducts from the stage: LOX straight down into the axial inlet, RP-1 down in front
  // of the pump and into the side inlet of the fuel plenum
  const loxInlet = [v(x, d.topY, 0), v(x, TP.loxInletTop, 0)];
  const fz = TP.fuelDuctZ;
  const fuelInlet = [v(x, d.topY, fz), v(x, TP.fuelInletY + 0.08, fz), v(x, TP.fuelInletY, fz - 0.06), v(x, TP.fuelInletY, 0.09)];

  // gas generator propellant taps (small lines from the pump discharges)
  const ggLoxPort = v(x + 0.062 * Math.sin((150 * Math.PI) / 180), -0.885, 0.062 * Math.cos((150 * Math.PI) / 180));
  const ggFuelPort = v(x + 0.062 * Math.sin((210 * Math.PI) / 180), -0.885, 0.062 * Math.cos((210 * Math.PI) / 180));
  const loxTap = [v(x + 0.045, TP.loxVoluteY - 0.02, -rEnd - 0.01), v(x + 0.1, -0.2, -0.15), v(0.5, -0.3, -0.14), v(0.5, -0.8, -0.14), v(ggLoxPort.x + 0.05, -0.885, ggLoxPort.z - 0.06), ggLoxPort.clone()];
  const fuelTap = [v(x - 0.07, TP.fuelVoluteY - 0.03, -rEnd - 0.005), v(0.31, -0.47, -0.16), v(0.3, -0.8, -0.15), v(ggFuelPort.x - 0.04, -0.885, ggFuelPort.z - 0.06), ggFuelPort.clone()];

  // turbine exhaust: from the collector straight back, down to the duct run beside the bell
  const exhaustStart = v(x, TP.collectorY, -0.126);
  const rr = d.exhaustRunR;
  const run = v(rr * Math.sin(EXHAUST_PHI), 0, rr * Math.cos(EXHAUST_PHI));
  const yEnd = d.ggExit.y + 0.05;
  const exhaust = [exhaustStart.clone(), v(x, TP.collectorY, -0.2), v(run.x + 0.03, -0.6, run.z + 0.06), v(run.x, -0.7, run.z), v(run.x, yEnd, run.z)];
  const hxTop = -0.97;
  const hxBot = -1.17;

  // igniter cartridge (TEA-TEB) at the back, lines to the injector and to the gas generator
  const igniter = v(-0.2, -0.66, -0.3);
  const igniterToInjector = [igniter.clone().add(v(0, 0.09, 0)), v(-0.12, -0.5, -0.28), v(-0.05, -0.34, d.domeR * -1 - 0.03), v(0, -0.308, -(d.domeR + 0.012))];
  const igniterToGG = [igniter.clone().add(v(0, -0.1, 0)), v(-0.16, -0.97, -0.26), v(0.2, -0.97, -0.2), v(x, -0.97, -0.04), v(x, TP.ggBottom - 0.004, 0)];

  // helium pressurant: heat-exchanger coil outlet and inlet up to a union below the stage
  // interface (HE_UNION_DROP under topY); flexible hoses (mech.ts) carry them across the gimbal
  const helium = [0, 1].map((i) => {
    const off = (i - 0.5) * 0.05;
    const hx = v(run.x + 0.07 + off * 0.3, hxTop + 0.05, run.z + 0.02 - off);
    return [hx, v(run.x + 0.06, -0.62, run.z + 0.1 - off), v(0.24 + off * 0.6, -0.45, -0.42), v(0.2 + off * 0.6, -0.1, -0.38), v(0.18 + off * 0.6, d.topY - HE_UNION_DROP, -0.34)];
  });

  // harness: a junction box on the dome back, branches to the sensors and valve actuators
  const junction = v(-0.06, -0.16, -0.235);
  // (the branches run between the dome and the LOX discharge loop, above the dome flange bolts,
  // then outboard of the injector flanges (the GG branch also outboard of the fuel discharge
  // before it turns in under it): no line passes
  // through another; zz-clear.test.ts checks it)
  const harness = [
    [junction.clone(), v(0.1, -0.2, -0.245), v(0.2, -0.2, -0.185), v(0.3, -0.215, -0.1), v(x - 0.066, -0.235, -0.03)], // turbopump speed pickup
    [junction.clone(), v(-0.06, -0.3, -0.28), v(-0.08, -0.47, -0.25)], // chamber pressure
    [junction.clone(), v(-0.22, -0.1, -0.2), v(mov.x, -0.06, -0.08)], // MOV actuator
    [junction.clone(), v(-0.16, -0.2, -0.2), v(-0.24, -0.21, -0.16), v(-0.27, -0.3, -0.14), v(-0.28, -0.5, -0.15), v(mfv.x, mfv.y, -0.11)], // MFV actuator
    [junction.clone(), v(0.1, -0.2, -0.245), v(0.22, -0.26, -0.27), v(0.26, -0.45, -0.28), v(0.2, -0.6, -0.19), v(0.3, -0.72, -0.05), v(x - 0.05, -0.745, -0.035)], // GG
  ];

  return {
    loxInlet,
    fuelInlet,
    loxDischarge,
    movToDome,
    fuelDischarge,
    fuelDown,
    loxTap,
    fuelTap,
    exhaust,
    igniterToInjector,
    igniterToGG,
    helium,
    harness,
    pts: { loxVoluteExit, fuelVoluteExit, domePort, movIn, movOut, mfvIn, mfvOut, manifoldIn, ggLoxPort, ggFuelPort, exhaustStart, hxTop, hxBot, igniter, junction },
  };
}
