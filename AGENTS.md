# Hinweise für KI-Agenten

Dieses Projekt ist **Freistunden.exe**, ein Web-Launcher (Node.js + Express + SQLite) für die HTML-Spiele einer Schulklasse.

## Neues Spiel einfügen
Die verbindliche Anleitung steht in **[SPIELE_EINFUEGEN.md](SPIELE_EINFUEGEN.md)**. Kurz zusammengefasst:
- Lege einen neuen Ordner `spiele/<kurzname>/` mit `index.html` und `spiel.json` an.
- Binde `/launcher-sdk.js` ein und melde Punkte mit `Launcher.punkte(n)`.
- Ändere dabei **nichts** außerhalb des neuen Spielordners.

## Aufbau
- `server.js`: API, Spiele-Scan, Auslieferung (Spiele laufen in einer Sandbox mit CSP `sandbox`)
- `db.js`: SQLite-Schema und Abfragen (`daten/launcher.db`, nicht im Git)
- `public/`: Launcher-Oberfläche (reines HTML/CSS/JS, kein Build)
- `public/launcher-sdk.js`: Schnittstelle zwischen Spiel und Launcher
- `spiele/`: ein Ordner pro Spiel

## Regeln für Änderungen am Launcher selbst
Nur auf ausdrücklichen Wunsch der Lehrkraft. Keine neuen Abhängigkeiten ohne Rückfrage. Texte in der Oberfläche sind auf Deutsch.
