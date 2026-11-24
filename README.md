# Freistunden.exe

Ein schlichter Web-Launcher für die selbst entwickelten HTML-Spiele aus dem IO-Unterricht – angelehnt an das Konzept von itch.io: Spieleübersicht mit Covern, Spielseite mit eingebettetem Spiel und Rangliste.

- **Konten & Gruppen:** Ein Admin erstellt die Schülerkonten und teilt sie in Gruppen ein (z. B. „Klasse 8a“, „Team Rakete“).
- **Statistik:** Für jedes Spiel werden Name, Punktzahl und Datum gespeichert, absteigend nach Punktzahl. Filtern nach Gruppe ist möglich.
- **Spiele einfügen:** einfach einen Ordner unter `spiele/` anlegen (Anleitung für KI-Agenten: [SPIELE_EINFUEGEN.md](SPIELE_EINFUEGEN.md)).
- **Technik:** Node.js mit eingebautem SQLite (`node:sqlite`) und Express. Kein Build-Schritt und keine externen CDNs, deshalb funktioniert es auch offline im Schulnetz.

## Voraussetzungen

- **Node.js 22.13 oder neuer** (empfohlen: aktuelle LTS-Version von <https://nodejs.org>)

## Starten

**Windows:** Doppelklick auf `start.bat`. Beim ersten Mal werden die Pakete automatisch installiert.

**Oder im Terminal:**

```bash
npm install
```

```bash
npm start
```

Danach <http://localhost:3000> öffnen. Dort erscheint zuerst der animierte Homebildschirm (ein Pixel-Zimmer mit Blick auf eine Neon-Stadt, live gezeichnet in `public/js/home-szene.js`). Die Spieleübersicht liegt unter `/uebersicht.html` (oben „Spiele“), ein Klick auf den Namen oben links führt zurück zum Homebildschirm. Andere PCs im selben Netz erreichen den Launcher über die Adresse, die im Server-Fenster unter „Im Schulnetz“ steht.

### Erster Start
1. Der Server zeigt einen **6-stelligen Einrichtungscode** an.
2. <http://localhost:3000/einrichten> öffnen, den Code eingeben und das Admin-Konto anlegen.
3. Unter **Admin → Gruppen** Gruppen anlegen und unter **Admin → Konten** Konten erstellen (einzeln oder als Namensliste). Die Zugangsdaten lassen sich direkt ausdrucken.

### Admin-Passwort vergessen?
```bash
npm run admin-zuruecksetzen
```
Danach den Server neu starten und das Admin-Konto über `/einrichten` neu anlegen. Schülerkonten und Punkte bleiben erhalten.

## Ordnerstruktur

```
server.js            API, Spiele-Scan, Auslieferung
db.js                SQLite-Schema und Abfragen
einstellungen.json   Seitenname, Untertitel, Port
daten/launcher.db    Datenbank (wird automatisch angelegt, nicht im Git!)
public/              Oberfläche (HTML/CSS/JS) + launcher-sdk.js
spiele/<name>/       ein Ordner pro Spiel (index.html + spiel.json + cover)
```

## Datenbank

| Tabelle | Inhalt |
|---|---|
| `benutzer` | Benutzername, Anzeigename, Passwort-Hash (scrypt), Rolle (`schueler`/`admin`) |
| `gruppen` | Gruppennamen |
| `benutzer_gruppen` | Zuordnung Konto ↔ Gruppe (ein Konto kann in mehreren Gruppen sein) |
| `punkte` | Spiel, Konto, Punktzahl, Datum |
| `sitzungen` | Login-Sitzungen (12 Stunden gültig) |
| `spiel_status` | Spiele ein-/ausblenden |

**Sicherung:** Server beenden und den Ordner `daten/` kopieren.

## Sicherheit

- Spiele laufen in einer Sandbox (`Content-Security-Policy: sandbox`, ohne `allow-same-origin`). Ein Spiel kann deshalb weder Logins auslesen noch Admin-Funktionen aufrufen.
- Passwörter werden nur als scrypt-Hash gespeichert.
- Ranglisten und Statistik sind nur für angemeldete Konten sichtbar. In Ranglisten erscheint nur der Anzeigename, standardmäßig mit abgekürztem Nachnamen.
- Punkte werden vom Spiel im Browser gemeldet. Wer sich auskennt, kann sie fälschen. Der Admin kann einzelne Einträge löschen.

## Später: GitHub & Hosting

- `daten/` und `node_modules/` sind in `.gitignore` eingetragen und gehören **nicht** ins Repository (sie enthalten Passwort-Hashes und Schülerdaten).
- Zum Hosten braucht der Server **dauerhaften Speicher** für `daten/launcher.db`, z. B. einen Schul-PC, einen Schulserver oder einen Anbieter mit Volume/Disk. Gratis-Tarife ohne Disk löschen die Datenbank bei jedem Neustart.
- Port: Umgebungsvariable `PORT` oder `einstellungen.json`. Speicherort der Datenbank: Umgebungsvariable `DATEN_ORDNER`.
- Hinter einem HTTPS-Proxy laufen die Cookies automatisch als `Secure`, wenn der Proxy `X-Forwarded-Proto` setzt und auf demselben Rechner läuft. Für andere Proxys `app.set('trust proxy', …)` in `server.js` anpassen.
