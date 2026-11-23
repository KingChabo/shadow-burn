#!/usr/bin/env node
// Umzug von der alten App (bis 1.0.9, alte Kennung endet auf ".phantom") in die neue (com.shadowburn.app) per USB.
// Die alte App kann in Android keine Backup-Datei speichern, deshalb liest dieses Skript ihre Daten
// über das WebView-Debugging aus und legt sie als Backup-Datei auf PC und Handy (Ordner Download).
// Danach in der neuen App: Ich → Account → Backup importieren → Datei wählen.
//
//   node scripts/umzug-per-usb.mjs            (Handy per USB, USB-Debugging an, nur ein Gerät)
//   ADB=/pfad/zu/adb node scripts/umzug-per-usb.mjs
//
// Ändert nichts an der alten App. Braucht Node 22+ (fetch + WebSocket).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ADB = process.env.ADB || join(homedir(), 'Android/Sdk/platform-tools/adb');
const PORT = 9399;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const devices = adb('devices').split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
if (devices.length !== 1) { console.error(`Genau ein Gerät anschließen (gefunden: ${devices.length}). USB-Debugging an?`); process.exit(1); }
// alte App finden: Kennung endet auf ".phantom" (oder OLD_APP=<kennung> setzen)
const found = adb('shell', 'pm', 'list', 'packages').split('\n').map((l) => l.replace('package:', '').trim()).filter((p) => /\.phantom$/.test(p));
const OLD = process.env.OLD_APP || found[0];
if (!OLD || !found.concat(process.env.OLD_APP ?? []).includes(OLD)) { console.error('Alte App (bis 1.0.9) ist nicht installiert.'); process.exit(1); }
if (!process.env.OLD_APP && found.length > 1) { console.error(`Mehrere alte Apps gefunden (${found.join(', ')}). Mit OLD_APP=<kennung> eine wählen.`); process.exit(1); }
console.log(`Alte App: ${OLD}`);

execFileSync(ADB, ['shell', 'monkey', '-p', OLD, '-c', 'android.intent.category.LAUNCHER', '1'], { stdio: 'ignore' });
let pid = '';
for (let i = 0; i < 20 && !pid; i++) { await sleep(500); try { pid = adb('shell', 'pidof', OLD); } catch { /* startet noch */ } }
if (!pid) { console.error('Alte App startet nicht.'); process.exit(1); }
await sleep(4000);
adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid.split(/\s+/)[0]}`);

try {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.type === 'page') ?? pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const expr = `(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('phantom'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (t) => db.objectStoreNames.contains(t)
      ? new Promise((res) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => res(q.result); })
      : Promise.resolve([]);
    const out = { app: 'phantom', version: 4, exportedAt: new Date().toISOString(),
      workouts: await all('workouts'), kv: await all('kv'), friends: await all('friends'),
      gymLogs: await all('gymLogs'), weights: await all('weights'), posts: await all('posts') };
    db.close();
    return JSON.stringify(out, null, 1);
  })()`;
  const json = await new Promise((res, rej) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id !== 1) return; const r = d.result; r.exceptionDetails ? rej(new Error(JSON.stringify(r.exceptionDetails))) : res(r.result.value); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  const d = JSON.parse(json);
  const name = `shadow-burn-backup-umzug-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(name, json);
  adb('push', name, `/sdcard/Download/${name}`);
  // damit die Datei sofort in der Dateiauswahl auftaucht
  try { adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Download/${name}`); } catch { /* taucht dann später auf */ }
  console.log(`Gesichert: ${d.workouts.length} Trainings, ${d.gymLogs.length} Geräteübungen, ${d.friends.length} Freunde, ${d.posts.length} Blog-Beiträge, ${d.weights.length} Gewichtseinträge`);
  console.log(`PC: ${join(process.cwd(), name)}`);
  console.log(`Handy: Download/${name}`);
  if (!d.workouts.length && !d.gymLogs.length) console.log('ACHTUNG: Die alte App hat keine Trainings. Import würde die Daten der neuen App durch eine leere Sicherung ersetzen. Nur importieren, wenn das so gewollt ist.');
  console.log('Jetzt in der neuen App: Ich → Account → Backup importieren → diese Datei wählen.');
} finally {
  try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* egal */ }
}
