/**
 * Deep links. The address carries the view and what it shows, as query parameters on the base
 * path (static hosting needs no rewrites, at / or /rocket/):
 *   ?v=explore&part=turbopump&view=cutaway&lens=materials&mat=grcop&cfg=capsule
 *   ?v=missions
 *   ?v=mission&m=leo&ch=staging&cam=chase&focus=booster
 *   ?v=watch&m=leo&ch=maxq
 * Changing view pushes a history entry (Back works); details replace the current entry.
 */
import { useApp, type AppState, type CamMode, type ExploreView, type View } from './store';
import { isPartId } from '../vehicle/parts';
import { MISSION_ORDER } from '../timeline/missions/outline';
import type { MissionId } from '../timeline/types';

const VIEWS: View[] = ['home', 'explore', 'missions', 'mission', 'watch'];

export interface RouteExtras {
  chapter: string | null;
}

export const routeExtras: RouteExtras = { chapter: null };

export function parseRoute(search: string): Partial<AppState> {
  const q = new URLSearchParams(search);
  const out: Partial<AppState> = {};
  const v = q.get('v') as View | null;
  if (v && VIEWS.includes(v)) out.view = v;
  const part = q.get('part');
  if (isPartId(part)) {
    out.part = part;
    if (!out.view) out.view = 'explore';
  }
  const view = q.get('view') as ExploreView | null;
  if (view === 'intact' || view === 'cutaway' || view === 'exploded') out.exploreView = view;
  const lens = q.get('lens');
  if (lens === 'materials' || lens === 'systems') out.lens = lens;
  const mat = q.get('mat');
  if (mat) {
    out.material = mat;
    out.lens = 'materials';
    if (!out.view) out.view = 'explore';
  }
  const cfg = q.get('cfg');
  if (cfg === 'capsule' || cfg === 'satellite') out.hangarConfig = cfg;
  const m = q.get('m') as MissionId | null;
  if (m && MISSION_ORDER.includes(m)) out.mission = m;
  const cam = q.get('cam') as CamMode | null;
  if (cam && ['auto', 'ground', 'chase', 'onboard', 'free', 'map'].includes(cam)) out.cam = cam;
  const focus = q.get('focus');
  if (focus === 'booster' || focus === 'main') out.focus = focus;
  routeExtras.chapter = q.get('ch');
  return out;
}

export function routeOf(s: AppState, chapter?: string | null): string {
  const q = new URLSearchParams();
  if (s.view !== 'home') q.set('v', s.view);
  if (s.view === 'explore') {
    if (s.part) q.set('part', s.part);
    if (s.exploreView !== 'intact') q.set('view', s.exploreView);
    if (s.lens === 'materials') q.set('lens', 'materials');
    if (s.lens === 'materials' && s.material) q.set('mat', s.material);
    if (s.hangarConfig === 'capsule') q.set('cfg', 'capsule');
  }
  if (s.view === 'mission' || s.view === 'watch') {
    q.set('m', s.mission);
    if (chapter) q.set('ch', chapter);
    if (s.view === 'mission' && s.cam !== 'auto') q.set('cam', s.cam);
    if (s.view === 'mission' && s.focus === 'booster') q.set('focus', 'booster');
  }
  // keep test/capture flags
  const cur = new URLSearchParams(window.location.search);
  for (const k of ['capture', 'virt', 'diag', 'hooks', 'quality', 'failassets', 'nowebgl']) if (cur.has(k)) q.set(k, cur.get(k)!);
  const str = q.toString();
  return window.location.pathname + (str ? '?' + str : '');
}

let lastPlace: string | null = null;

/** A history entry per view, and per mission within the mission and watch views. */
function placeOf(s: Pick<AppState, 'view' | 'mission'>): string {
  return s.view === 'mission' || s.view === 'watch' ? `${s.view}:${s.mission}` : s.view;
}

/** Keep the address in sync with the state; restore state on Back/Forward. */
export function installRouting(getChapter: () => string | null) {
  lastPlace = placeOf(useApp.getState());
  useApp.subscribe((s) => {
    const url = routeOf(s, getChapter());
    if (url === window.location.pathname + window.location.search) return;
    const place = placeOf(s);
    if (place !== lastPlace) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
    lastPlace = place;
  });
  window.addEventListener('popstate', () => {
    const r = parseRoute(window.location.search);
    const next = { view: 'home' as View, part: null, ...r };
    lastPlace = placeOf({ view: next.view, mission: next.mission ?? useApp.getState().mission });
    useApp.setState(next);
  });
}

/** Rewrite the address for the current chapter (called when the chapter changes). */
export function syncChapter(chapter: string | null) {
  const url = routeOf(useApp.getState(), chapter);
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, '', url);
}
