# Shadow Burn

Sport-App fürs Handy mit Rangliste unter Freunden. Läuft komplett offline: kein Konto, keine Werbung, alle Daten bleiben auf deinem Handy.

## Installieren am Handy (Android)
1. Unter **Releases** (rechts auf der Repo-Seite) die neueste `shadow-burn.apk` antippen und herunterladen.
2. Datei öffnen und einmal „Aus dieser Quelle installieren“ erlauben (verlangt Android bei jeder App außerhalb des Play Stores).
3. App öffnen: Name eingeben, Kamera erlauben, kurze Einführung. Danach läuft alles offline.

**Update:** neue APK genauso laden und über die alte installieren (nicht vorher deinstallieren). Alle Daten bleiben erhalten. Alternativ in der App unter Ich → Account → App & Daten → „App aktualisieren“ die geladene Datei wählen.

**Einmalig beim Wechsel von Version 1.0.9 auf eine neuere:** Die App hat eine neue interne Kennung bekommen. Die neue Version erscheint deshalb als eigene App und übernimmt die Daten der alten nicht von selbst. Die alte Version 1.0.9 kann leider auch keine Backup-Datei speichern. Die Daten lassen sich aber einmalig per USB-Kabel und PC übertragen:
1. Am Handy die Entwickleroptionen einschalten (Einstellungen → Über das Telefon → 7× auf „Build-Nummer“ tippen), dort „USB-Debugging“ an. Handy per Kabel an den PC und „USB-Debugging zulassen“ bestätigen.
2. Am PC (mit Node 22+ und den Android Platform-Tools): `node scripts/umzug-per-usb.mjs`. Das liest die Daten der alten App aus und legt eine Backup-Datei im Ordner „Download“ am Handy (und eine Kopie am PC) ab.
3. Neue APK installieren, in der neuen App unter Ich → Account „Backup importieren“ und die Datei `shadow-burn-backup-umzug-….json` wählen.
4. Prüfen, dass alles da ist, dann die alte App deinstallieren und USB-Debugging wieder ausschalten. Ab dann funktionieren Updates wieder wie oben.

## Was drin ist
- **Onboarding**: Name, Kamera- und Bewegungs-Berechtigung
- **Home**: Streak-Flamme (orange → blau → violett → weiß-gold), Streak-Locks (30 Gems, max. 2), Level-Balken, 3 Tagesaufträge
- **Training**: 65 Übungen und Sportarten in 5 Kategorien (Kraft 20, Core 12, Cardio 8, Ausdauer 11, Sportarten 14), sortiert nach Beliebtheit, mit Suche, Favoriten und „Zuletzt gemacht“
- **Gym**: 64 Geräte- und Hantelübungen in 6 Muskelgruppen (Brust, Rücken, Beine, Schultern, Arme, Bauch), Sätze mit Wiederholungen und Gewicht, eigene Übungen anlegen
- **Vor dem Start**: Tipps (richtig / falsch) und **Muskelkarte** vorne/hinten auf einem gerenderten Körper (Haupt- und Hilfsmuskeln direkt auf der Haut eingefärbt)
- **Vorlage-Videos**: Ein realistischer 3D-Mensch (Blender/MakeHuman) macht die Übung vor, mit Live-Winkel und Handy-Platzierung. Das gibt es bisher nur für einen Teil: 18 der 65 Übungen (die ursprünglichen Grundübungen, Joggen/Gehen/Sprint teilen sich ein Video) und 34 der 64 Gym-Übungen. Die übrigen haben noch kein Video.
- **Kamera-Zählung (KI)**: Liegestütze, Sit-ups, Kniebeugen, Hampelmänner, Plank. Dazu Nasen-Tap (Liegestütze) und Sensor (Sit-ups, Handy auf der Brust)
- Übrige Übungen: Manuell / Timer / Strecke / Dauer eintragen
- **Zusammenfassung**: Punkte zählen hoch, Gems, Glücksfund-Truhe, Rekord-Konfetti, Streak +1, Level-Up, trainierte Muskeln
- **Rangliste**: Freunde per QR-Code hinzufügen (Handy zu Handy, ohne Internet). Ranglisten für Woche, Gesamtpunkte, Streak und Rekord je Übung. Erneut scannen aktualisiert die Zahlen, „Stand: vor …“ zeigt, wie alt sie sind.
- **Profil**: Wochen-Diagramm, Rekorde, Verlauf, Sounds/Sprache/Vibration, Backup exportieren/importieren, alles löschen

### Tipps zur Kamera-Zählung
Handy **quer, seitlich, ca. 2 m entfernt** auf den Boden stellen, so dass dich die Kamera gut sieht. Mit der Kamera gezählte Wiederholungen bekommen +20 % Formbonus. Die Erkennung läuft direkt auf dem Handy, es wird nichts hochgeladen.

## Lizenz
MIT, siehe [LICENSE](LICENSE).
