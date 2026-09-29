import { it } from 'vitest';
import { F } from './derived';
it('prints', () => { process.stdout.write(JSON.stringify(F, null, 1)); });
