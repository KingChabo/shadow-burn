// Erzeugt src/data/licenses.json: Lizenztexte aller Bibliotheken, die in der App mitgeliefert werden.
// Neu ausführen, wenn Pakete dazukommen oder aktualisiert werden:  node scripts/licenses.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Was wirklich im App-Paket landet (aus dem Build ermittelt) + Schriften + Android-Hülle.
// Kommt ein neues Paket in package.json dazu, das die App benutzt: hier eintragen.
const PACKAGES = [
  'react', 'react-dom', 'scheduler', 'framer-motion', 'motion-dom', 'motion-utils', 'dexie',
  'qrcode', 'dijkstrajs', 'jsqr',
  '@tensorflow/tfjs-core', '@tensorflow/tfjs-converter', '@tensorflow/tfjs-backend-webgl', '@tensorflow/tfjs-backend-cpu', 'long', 'seedrandom',
  '@capacitor/core', '@capacitor/app', '@capacitor/android',
  'workbox-window', 'workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies',
  '@fontsource-variable/inter', '@fontsource/oswald',
];

// Teile ohne npm-Paket
const EXTRA = [
  {
    name: 'MoveNet SinglePose Lightning (Modell)', version: '', license: 'Apache-2.0',
    notice: 'Copyright Google LLC. Modell von TensorFlow Hub / Kaggle Models, in public/models/movenet/.',
    textOf: '@tensorflow/tfjs-core',
  },
  {
    name: 'AndroidX-Bibliotheken (Android-App)', version: '', license: 'Apache-2.0',
    notice: 'Copyright The Android Open Source Project.',
    textOf: '@tensorflow/tfjs-core',
  },
  {
    name: 'MakeHuman-Assets (3D-Figur in den Vorlagen-Videos)', version: '', license: 'CC0-1.0',
    notice: 'Haut, Haare, Kleidung und Körpermodell aus den MakeHuman-System-Assets, gemeinfrei (CC0). Keine Namensnennung nötig, hier freiwillig genannt.',
  },
  {
    name: 'Poly Haven (Texturen und Licht in den Vorlagen-Videos)', version: '', license: 'CC0-1.0',
    notice: 'concrete_floor_02, beige_wall_001, wood_floor, studio_small_09 von polyhaven.com, gemeinfrei (CC0).',
  },
];

// Pakete ohne eigene Lizenzdatei: Hinweis + Standardtext der Lizenz (Apache-Text aus `long`)
const APACHE_FROM = 'long';
const MIT = (c) => `MIT License\n\n${c}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const NO_FILE = {
  '@tensorflow/tfjs-core': { notice: 'Copyright 2018 Google LLC. All Rights Reserved.', apache: true },
  '@tensorflow/tfjs-converter': { notice: 'Copyright 2018 Google LLC. All Rights Reserved.', apache: true },
  '@tensorflow/tfjs-backend-webgl': { notice: 'Copyright 2020 Google LLC. All Rights Reserved.', apache: true },
  '@tensorflow/tfjs-backend-cpu': { notice: 'Copyright 2020 Google LLC. All Rights Reserved.', apache: true },
  seedrandom: { mit: 'Copyright 2019 David Bau.' },
};

const texts = [];
const textId = (t) => { const s = t.trim(); let i = texts.indexOf(s); if (i < 0) { texts.push(s); i = texts.length - 1; } return i; };

const out = [];
const byName = {};
for (const name of PACKAGES) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(dir)) throw new Error(`Paket fehlt: ${name} (npm install ausführen)`);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? '?';
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  const nf = NO_FILE[name];
  let text, notice;
  if (file) text = readFileSync(join(dir, file), 'utf8');
  else if (nf?.apache) { text = readFileSync(join(root, 'node_modules', APACHE_FROM, 'LICENSE'), 'utf8'); notice = nf.notice; }
  else if (nf?.mit) text = MIT(nf.mit);
  else throw new Error(`Keine Lizenzdatei in ${name}: in NO_FILE eintragen`);
  const noticeFile = readdirSync(dir).find((f) => /^notice(\.(md|txt))?$/i.test(f));
  if (noticeFile) notice = readFileSync(join(dir, noticeFile), 'utf8').trim();
  const entry = { name, version: pkg.version, license, ...(notice ? { notice } : {}), text: textId(text) };
  byName[name] = entry;
  out.push(entry);
}
for (const e of EXTRA) {
  const { textOf, ...rest } = e;
  out.push(textOf ? { ...rest, text: byName[textOf].text } : rest);
}

writeFileSync(join(root, 'src/data/licenses.json'), JSON.stringify({ packages: out, texts }, null, 1) + '\n');
console.log(`${out.length} Einträge, ${texts.length} verschiedene Lizenztexte -> src/data/licenses.json`);
