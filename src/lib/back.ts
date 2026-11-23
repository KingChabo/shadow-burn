import { useEffect, useRef } from 'react';

/**
 * Android-Zurück-Taste (und Browser-Zurück): Ohne eigenen Eintrag im Verlauf schließt Android die
 * ganze App. Solange es etwas zum Zurückgehen gibt (offenes Fenster, Unterseite, anderer Tab als Home),
 * liegt genau ein Platzhalter im Verlauf. Zurück entfernt ihn, wir rufen den obersten Handler auf
 * und legen den Platzhalter neu an, falls danach noch etwas offen ist. Auf Home schließt Zurück die App.
 */

type Entry = { fn: () => void };
const stack: Entry[] = [];
let fallback: (() => void) | null = null;
let guarded = false;
let ignoreNext = false;
let queued = false;
let listening = false;

const hasWindow = () => typeof window !== 'undefined' && typeof history !== 'undefined';

function sync() {
  queued = false;
  if (!hasWindow()) return;
  const need = stack.length > 0 || fallback !== null;
  if (need && !guarded) {
    history.pushState({ sbBack: true }, '');
    guarded = true;
  } else if (!need && guarded) {
    // nichts mehr offen: Platzhalter still entfernen, damit die nächste Zurück-Taste die App schließt
    guarded = false;
    ignoreNext = true;
    history.back();
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(sync, 0);
}

function onPop() {
  if (ignoreNext) { ignoreNext = false; return; }
  guarded = false;
  const top = stack[stack.length - 1];
  if (top) top.fn();
  else fallback?.();
  // React rendert neu und meldet Handler ab/an; danach prüfen, ob noch ein Platzhalter nötig ist
  schedule();
}

function listen() {
  if (listening || !hasWindow()) return;
  listening = true;
  window.addEventListener('popstate', onPop);
}

/** Solange `active`, schließt die Zurück-Taste mit `fn` (z. B. Fenster zu, eine Seite zurück). */
export function useBack(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    listen();
    const e: Entry = { fn: () => ref.current() };
    stack.push(e);
    schedule();
    return () => {
      const i = stack.indexOf(e);
      if (i >= 0) stack.splice(i, 1);
      schedule();
    };
  }, [active]);
}

/** Letzte Stufe (z. B. anderer Tab → Home). null = auf Home, Zurück schließt die App. */
export function useBackFallback(fn: (() => void) | null) {
  const ref = useRef(fn);
  ref.current = fn;
  const on = fn !== null;
  useEffect(() => {
    listen();
    fallback = on ? () => ref.current?.() : null;
    schedule();
    return () => { fallback = null; schedule(); };
  }, [on]);
}
