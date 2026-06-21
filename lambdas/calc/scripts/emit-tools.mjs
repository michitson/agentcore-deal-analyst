/**
 * Generate tools.json — the inline tool schema that
 * `agentcore add gateway-target --tool-schema-file tools.json` consumes when
 * registering this Lambda as a Gateway target. Run via `npm run emit-schema`
 * (which builds first, then runs this against dist/tools.js) so the registered
 * schema can never drift from what the handler actually dispatches.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../dist/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'tools.json');
writeFileSync(out, JSON.stringify(TOOLS, null, 2) + '\n');
console.log(`Wrote ${TOOLS.length} tool definition(s) to ${out}`);
