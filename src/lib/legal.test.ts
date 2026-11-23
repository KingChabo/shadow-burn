import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import licenses from '../data/licenses.json';

describe('Lizenzen', () => {
  it('jede Laufzeit-Bibliothek hat einen Lizenz-Eintrag (sonst: node scripts/licenses.mjs)', () => {
    const listed = new Set(licenses.packages.map((p) => p.name));
    const missing = Object.keys(pkg.dependencies).filter((d) => !listed.has(d));
    expect(missing).toEqual([]);
  });

  it('jeder Eintrag zeigt auf einen vorhandenen Lizenztext', () => {
    for (const p of licenses.packages) {
      if ('text' in p && p.text !== undefined) expect(licenses.texts[p.text as number]?.length).toBeGreaterThan(100);
    }
  });
});
