/**
 * Content schema. Lessons, materials, glossary, checks and narration are data, bound to the
 * 3D model through stable ids (PartId, MaterialId, mission/phase ids, demo ids).
 *
 * Writing rules for all text shown in the interface:
 *  - plain, precise English; no em dashes (use commas, colons or parentheses);
 *  - explain before quizzing; units with every number; say when something is illustrative;
 *  - distinguish "in this illustrative vehicle" from "another documented design";
 *  - never claim a proprietary vehicle's hidden details.
 */
import type { PartId } from '../vehicle/parts';
import type { MissionId } from '../timeline/types';
import type { MaterialId } from './materials/ids';

export type SourceId = string;

export interface Source {
  id: SourceId;
  title: string;
  publisher: string;
  url: string;
  /** What we used it for (one line). */
  used: string;
  /** Whether it was opened and read during this build, or identified by reference only. */
  accessed: 'read' | 'reference';
}

/** Where a part matters in a mission: the phase and a one-line reason. */
export interface PhaseLink {
  mission: MissionId;
  phase: string;
  note: string;
}

export type DemoId =
  | 'tank-drain'
  | 'feed-flow'
  | 'turbopump'
  | 'combustion'
  | 'nozzle-pressure'
  | 'regen-cooling'
  | 'tvc'
  | 'gnc-loop'
  | 'staging-sequence'
  | 'fairing-sep'
  | 'spacecraft-ops'
  | 'booster-recovery'
  | 'capsule-return'
  | 'tank-pressure'
  | 'sandwich-panel'
  | 'heat-shield-stack';

export type CloseupId = 'tank-wall' | 'injector-face' | 'cooling-channels' | 'separation-joint' | 'fairing-sandwich' | 'heat-shield-stack' | 'turbopump-section' | 'grid-fin-lattice';

/** Materials role of a part: which material, what it does there, and whether this vehicle uses it. */
export interface MaterialUse {
  material: MaterialId;
  role: string;
  /** true: used in this illustrative vehicle; false: shown for comparison from another documented design. */
  inThisVehicle: boolean;
}

/**
 * The seven-question lesson contract for a principal component.
 */
export interface PartLesson {
  id: PartId;
  /** One sentence: what it is, in plain words. */
  summary: string;
  // 1. Where is it, and what is it connected to?
  where: string;
  connections: PartId[];
  // 2. What does it do, and how does it work?
  function: string;
  how: string;
  // 3. Why is it needed at this point in the mission?
  why: string;
  phases: PhaseLink[];
  // 4. Loads, temperatures, fluids and other conditions.
  environment: string;
  /** Key numbers with units (label, value, note). Illustrative values say so. */
  figures?: { label: string; value: string; note?: string }[];
  // 5. Plausible material families and why.
  materials: MaterialUse[];
  materialsWhy: string;
  // 6. Manufacturing, joining, inspection, test.
  manufacturing: string;
  inspection: string;
  // 7. Misconception and absence.
  misconception: string;
  ifAbsent: string;
  /** Depth layers: Quick explanation, Engineering detail, Materials & manufacturing. */
  depth: { quick: string; engineering: string; materials: string };
  demo?: DemoId;
  closeup?: CloseupId;
  sources: SourceId[];
}

/** Shorter entry for supporting parts (non-principal). */
export interface PartNote {
  id: PartId;
  summary: string;
  function: string;
  why: string;
  materials: MaterialUse[];
  phases: PhaseLink[];
  sources: SourceId[];
}

export interface MaterialProperty {
  /** e.g. "Density", "Thermal conductivity". */
  property: string;
  value: string;
  /** Alloy/temper/condition and temperature, e.g. "2195-T8, room temperature". */
  condition: string;
  source: SourceId;
}

export interface MaterialEntry {
  id: MaterialId;
  name: string;
  family: string;
  /** Teaching focus in one or two sentences. */
  focus: string;
  /** Why it suits its uses (requirements vs properties), qualitative first. */
  suits: string;
  limits: string;
  /** Parts that use it in this vehicle, with roles (bidirectional with PartLesson.materials). */
  usedIn: { part: PartId; role: string }[];
  /** Other documented designs that use it (named generally, with a source). */
  elsewhere: { text: string; source: SourceId }[];
  /** Qualitative comparisons (conductivity vs insulation, strength, stiffness, density, temperature, anisotropy, manufacturability). */
  compare: { axis: string; text: string }[];
  properties: MaterialProperty[];
  manufacturing: string;
  inspection: string;
  /** Cause-and-effect question with its explanation. */
  question?: { q: string; a: string };
  closeup?: CloseupId;
  sources: SourceId[];
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  /** Where to see it: a part, a demo, or a mission phase. */
  see: ({ part: PartId } | { demo: DemoId } | { mission: MissionId; phase: string })[];
  aliases?: string[];
}

export type CheckKind = 'identify' | 'material' | 'order' | 'distinguish' | 'why';

export interface KnowledgeCheck {
  id: string;
  kind: CheckKind;
  topic: LearningTopic;
  prompt: string;
  /** For 'identify': the part highlighted in the scene while asking. */
  part?: PartId;
  choices: string[];
  /** Index of the correct choice; for 'order' the choices are events and answer is the correct order of indices. */
  answer: number | number[];
  /** Specific explanation shown after answering (why right, why the tempting wrong answers are wrong). */
  explain: string;
  /** "Show me again": where to go. */
  showAgain: { part: PartId } | { demo: DemoId } | { mission: MissionId; phase: string } | { material: MaterialId };
  sources: SourceId[];
}

export type LearningTopic = 'anatomy' | 'propulsion' | 'structures' | 'guidance' | 'launch' | 'orbit' | 'return' | 'missions';

export interface LearningStep {
  topic: LearningTopic;
  title: string;
  blurb: string;
  /** What to open: parts, demos, missions/phases, materials. */
  items: ({ part: PartId } | { demo: DemoId } | { mission: MissionId; phase?: string } | { material: MaterialId })[];
}

export interface WhyDemo {
  id: string;
  title: string;
  question: string;
  /** Short staged explanation (2 to 5 beats), each shown with a visual state of the demo. */
  beats: { text: string; visual: string }[];
  /** Optional equation with every variable explained. */
  equation?: EquationNote;
  takeaway: string;
  sources: SourceId[];
}

export interface EquationNote {
  name: string;
  /** Plain-text equation, e.g. "Δv = Isp · g0 · ln(m0 / mf)". */
  formula: string;
  variables: { symbol: string; meaning: string; unit: string }[];
  /** What the ideal relationship leaves out. */
  caveat: string;
  /** Worked example with this vehicle's numbers (validated in tests where computed). */
  example?: string;
}

/** Mission-phase card: "What is happening? Why now? Which parts? Forces/environment? What enables the next phase?" */
export interface PhaseCard {
  mission: MissionId;
  phase: string;
  what: string;
  whyNow: string;
  parts: PartId[];
  forces: string;
  next: string;
  /** Optional short equation reference for this phase (e.g. dynamic pressure at max-q). */
  equation?: 'thrust' | 'dynamic-pressure' | 'rocket-equation' | 'orbital-speed';
}

/** Watch-mode narration: cues anchored to mission events so speech matches the picture. */
export interface NarrationCue {
  id: string;
  text: string;
}
export interface NarrationSegment {
  id: string;
  mission: MissionId;
  /** Anchor: the cue block starts at this event (or phase start) plus offset seconds of mission time. */
  anchor: { event: string } | { phase: string };
  offset: number;
  cues: NarrationCue[];
}
