/**
 * Build-Variante.
 * - Normale APK (./build-apk.sh): wie aus dem Store – leerer Start, keine Beispiel-Beiträge.
 * - Demo-Build (DEMO=1 ./build-apk.sh, setzt VITE_DEMO=1): mit Beispiel-Beiträgen zum Vorführen im Emulator.
 */
export const DEMO = import.meta.env.VITE_DEMO === '1';
