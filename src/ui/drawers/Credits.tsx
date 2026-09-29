import { allSources } from '../../content/sources';

export function Credits() {
  const src = allSources();
  return (
    <div className="credits">
      <p>
        <b>KIMBLE Rocket Engineering</b> is an educational simulator. The K-1 is a generic, original launch vehicle with illustrative values chosen to be physically consistent; it is not
        any company’s vehicle, and no agency or company endorses this project. KIMBLE and ONE / FAB are the project’s own marks.
      </p>
      <h3>Imagery</h3>
      <ul className="plain small">
        <li>Earth: NASA Blue Marble Next Generation (NASA Earth Observatory / Visible Earth), public domain, obtained via the basemap-data 2.0.0 package; resized.</li>
        <li>City lights: NASA Black Marble 2012 (NASA Earth Observatory / NOAA), public domain, obtained via NASA WorldWind (@nasaworldwind/worldwind 0.11.1).</li>
        <li>Moon: LRO LROC WAC global mosaic 100 m (NASA / GSFC / Arizona State University), public domain, hosted by USGS Astrogeology; downsampled.</li>
        <li>Stars: Tycho star map, NASA 3D Resources (NASA), public domain.</li>
        <li>Typefaces: Inter and Archivo, SIL Open Font License 1.1.</li>
      </ul>
      <p className="small muted">Full details: ASSET_LICENSES.md and ACCURACY.md in the source repository.</p>
      <h3>Engineering references</h3>
      <ul className="plain small">
        {src.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
            <span className="muted">
              {' '}
              · {s.publisher} · {s.used}
              {s.accessed === 'reference' ? ' · identified by reference' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
