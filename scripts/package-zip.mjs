// Package a static build for later upload (e.g. Netlify drag-and-drop). Does not deploy.
//   npm run package            → release/kimble-rocket-<commit>.zip from dist/
//   npm run package -- rocket  → builds with --base=/rocket/ into dist-rocket/ first
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const rocket = process.argv[2] === 'rocket';
const out = rocket ? 'dist-rocket' : 'dist';
execSync(rocket ? 'npx tsc -b && npx vite build --base=/rocket/ --outDir dist-rocket' : 'npx tsc -b && npx vite build', { stdio: 'inherit' });
const commit = execSync('git rev-parse --short HEAD').toString().trim();
mkdirSync('release', { recursive: true });
const zip = `release/kimble-rocket-${rocket ? 'rocket-' : ''}${commit}.zip`;
execSync(`python3 -c "import shutil; shutil.make_archive('${zip.replace(/\.zip$/, '')}', 'zip', '${out}')"`, { stdio: 'inherit' });
console.log(zip);
