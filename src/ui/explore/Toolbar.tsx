/** Explore toolbar: view (intact/cutaway/exploded), lens, overlays, configuration, reset. */
import { useApp, type ExploreView } from '../../state/store';
import { hangarHome } from '../../director/director';
import { Icon } from '../icons';

const VIEWS: [ExploreView, string][] = [
  ['intact', 'Intact'],
  ['cutaway', 'Cutaway'],
  ['exploded', 'Exploded'],
];

export function ExploreToolbar({ onParts }: { onParts: () => void }) {
  const s = useApp();
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Explore tools">
      <button className="chip chip--strong" onClick={onParts} aria-label="Find a part">
        <Icon.list size={15} /> Parts
      </button>
      <span className="toolbar__sep" />
      <div className="seg seg--inline" role="radiogroup" aria-label="View">
        {VIEWS.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={s.exploreView === k} className="seg__btn" onClick={() => s.set({ exploreView: k })}>
            {label}
          </button>
        ))}
      </div>
      <span className="toolbar__sep" />
      <button className="chip" aria-pressed={s.lens === 'materials'} onClick={() => s.set({ lens: s.lens === 'materials' ? 'systems' : 'materials', material: null })}>
        <Icon.layers size={15} /> Materials
      </button>
      <details className="menu">
        <summary className="chip">Overlays</summary>
        <div className="menu__body panel">
          {(
            [
              ['flow', 'Propellant flow', 'Illustrative flow paths (LOX blue, RP-1 amber, hot gas orange)'],
              ['forces', 'Forces', 'Thrust, weight and drag with their lines of action'],
              ['mass', 'Centres of mass and thrust', 'Where the weight and the thrust act'],
              ['thermal', 'Thermal load', 'Hot and cryogenic regions (qualitative)'],
            ] as const
          ).map(([k, label, hint]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={s.overlays[k]} onChange={() => s.toggleOverlay(k)} />
              <span>
                {label}
                <span className="muted small"> · {hint}</span>
              </span>
            </label>
          ))}
        </div>
      </details>
      <span className="toolbar__sep" />
      <div className="seg seg--inline" role="radiogroup" aria-label="Configuration">
        <button role="radio" aria-checked={s.hangarConfig === 'satellite'} className="seg__btn" onClick={() => s.set({ hangarConfig: 'satellite', part: null })}>
          Satellite
        </button>
        <button role="radio" aria-checked={s.hangarConfig === 'capsule'} className="seg__btn" onClick={() => s.set({ hangarConfig: 'capsule', part: null })}>
          Capsule
        </button>
      </div>
      <button
        className="chip"
        onClick={() => {
          s.set({ part: null, exploreView: 'intact' });
          hangarHome();
        }}
      >
        <Icon.target size={15} /> Whole vehicle
      </button>
    </div>
  );
}
