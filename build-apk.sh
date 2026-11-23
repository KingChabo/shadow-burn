#!/usr/bin/env bash
# Baut die Android-APK zum Installieren auf Handy oder Emulator.
#   ./build-apk.sh          -> shadow-burn.apk       wie aus dem Store: leerer Start, keine Beispiele
#   DEMO=1 ./build-apk.sh   -> shadow-burn-demo.apk  mit Beispiel-Beiträgen zum Vorführen
#
# Updates ohne Datenverlust (bei jedem Build automatisch):
#   1. Update-Test: alte Datenbank-Versionen werden geöffnet und geprüft (src/lib/upgrade.test.ts). Schlägt er fehl, kein Build.
#   2. Immer derselbe Schlüssel (android/shadow-burn.keystore), sonst lehnt Android das Update ab.
#   3. Versionsnummer zählt hoch (android/version-code), damit Android die neue APK als Update annimmt.
#   In der App selbst: automatische Sicherung bei jedem Update (src/lib/update.ts).
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME_21:-${JAVA_HOME:-}}"
if [ -z "$JAVA_HOME" ]; then echo "Bitte JAVA_HOME_21 auf ein JDK 21 setzen" >&2; exit 1; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
if [ "${DEMO:-0}" = "1" ]; then export VITE_DEMO=1; OUT=shadow-burn-demo.apk; else unset VITE_DEMO; OUT=shadow-burn.apk; fi

# 1. Update-Test
npx vitest run src/lib/upgrade.test.ts src/lib/update.test.ts src/lib/migration.test.ts

# 2. Fester Schlüssel: beim ersten Mal den Schlüssel übernehmen, mit dem die bisherigen APKs gebaut wurden
KEY=android/shadow-burn.keystore
if [ ! -f "$KEY" ]; then
  for SRC in "$HOME/.android/debug.keystore"; do
    if [ -f "$SRC" ]; then
      cp "$SRC" "$KEY"
      echo "Schlüssel übernommen: $SRC -> $KEY  (NICHT löschen, am besten zusätzlich sichern)"
      break
    fi
  done
  if [ ! -f "$KEY" ]; then
    echo "FEHLER: kein Schlüssel gefunden ($KEY oder ~/.android/debug.keystore)." >&2
    echo "Ohne den alten Schlüssel kann Android die App nicht updaten." >&2
    exit 1
  fi
fi

# 3. Versionsnummer hochzählen
VC_FILE=android/version-code
VC=$(( $(cat "$VC_FILE" 2>/dev/null || echo 1) + 1 ))
echo "$VC" > "$VC_FILE"
export VITE_APP_VERSION="1.0.$VC"
echo "Baue Version $VITE_APP_VERSION (Code $VC)"

npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug -q -PsbVersionCode="$VC" -PsbVersionName="$VITE_APP_VERSION")
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT"
echo "Fertig: $(pwd)/$OUT  (Version $VITE_APP_VERSION)"
echo "Aufs Handy: einfach ÜBER die alte App installieren, nicht vorher deinstallieren. Daten bleiben."
