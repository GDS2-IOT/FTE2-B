# Spiele einfügen – Anleitung für Claude und andere KI-Agenten

Diese Datei ist **verbindlich**. Halte dich beim Einfügen eines neuen Spiels genau an diese Schritte.
Ändere dafür **keinen** Code des Launchers (`server.js`, `db.js`, `public/`) und **nicht** die Datenbank.

---

## 1. Ordner anlegen

Lege für jedes Spiel einen eigenen Ordner an:

```
spiele/<kurzname>/
  index.html     (Pflicht)  Das Spiel – startet von selbst
  spiel.json     (Pflicht)  Infos für die Spieleübersicht
  cover.png      (empfohlen) Vorschaubild, 630 × 500 px (auch .jpg, .webp, .svg)
  ...            weitere Dateien des Spiels (Bilder, Sounds, JS, CSS) – nur relative Pfade
```

Regeln für `<kurzname>`:
- nur Kleinbuchstaben `a-z`, Ziffern `0-9`, `-` und `_`
- muss mit einem Buchstaben oder einer Ziffer beginnen, höchstens 64 Zeichen
- keine Leerzeichen, keine Umlaute (z. B. `weltraum-flucht`, `snake-team3`)
- darf noch nicht vorhanden sein (vorher `spiele/` prüfen)

Der Launcher findet neue Ordner automatisch. Ein Neustart ist nicht nötig.

## 2. `spiel.json`

```json
{
  "titel": "Weltraum-Flucht",
  "kurzbeschreibung": "Weiche Asteroiden aus und sammle Sterne.",
  "beschreibung": "Längerer Text über das Spiel.\nZeilenumbrüche mit \\n sind erlaubt.",
  "autor": "Team Rakete (Lena, Tim, Ali)",
  "tags": ["Action", "Weltraum"],
  "steuerung": "Pfeiltasten: bewegen\nLeertaste: schießen",
  "breite": 960,
  "hoehe": 600,
  "datum": "2026-11-10",
  "cover": "cover.png"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `titel` | ja | Name des Spiels (max. 80 Zeichen) |
| `kurzbeschreibung` | empfohlen | 1 Satz für die Spielkarte (max. 160 Zeichen) |
| `beschreibung` | empfohlen | Ausführlicher Text auf der Spielseite |
| `autor` | empfohlen | Schüler/Gruppe, die das Spiel gemacht hat |
| `tags` | optional | Bis zu 8 Schlagwörter (z. B. Action, Rätsel, Quiz, Geschick) |
| `steuerung` | empfohlen | Wie man spielt (Tasten, Maus) |
| `breite`, `hoehe` | optional | Seitenverhältnis des Spielfensters (Standard 960 × 600) |
| `datum` | empfohlen | Veröffentlichung im Format `JJJJ-MM-TT` (bestimmt die Sortierung „Neueste“) |
| `cover` | optional | Dateiname des Vorschaubildes im Spielordner. Ohne Bild wird ein farbiger Platzhalter gezeigt. |

`spiel.json` muss gültiges JSON sein (doppelte Anführungszeichen, keine Kommentare, kein Komma am Ende).

## 3. Punkte an den Launcher melden (Pflicht für Ranglisten)

Binde das SDK **als erstes Skript im `<head>`** ein:

```html
<script src="/launcher-sdk.js"></script>
```

Wenn eine Runde vorbei ist (Game Over, Level geschafft …), melde die Punktzahl:

```js
Launcher.punkte(punktzahl);   // ganze Zahl, höher = besser
```

- Die Rangliste sortiert **absteigend** (größte Punktzahl oben).
  Bei Spielen, in denen „weniger ist besser“ gilt (z. B. Zeit), rechne in Punkte um, z. B. `Math.max(0, 10000 - millisekunden)`.
- Melde **einmal pro Spielrunde** und nicht bei jedem Punktgewinn. Zwischen zwei Meldungen müssen mindestens 2 Sekunden liegen.
- Optional kannst du das Ergebnis anzeigen:
  ```js
  Launcher.punkte(punktzahl).then(function (r) {
    if (r && r.gespeichert) zeigeText('Platz ' + r.platz + ' in der Rangliste!');
  });
  ```
- `Launcher.spieler` enthält den Anzeigenamen des angemeldeten Spielers (oder `null`).
  Zum Anzeigen per `textContent` einsetzen, nicht per `innerHTML`.
- `Launcher.imLauncher` ist `false`, wenn das Spiel direkt geöffnet wird. Dann tut `Launcher.punkte()` nichts, es gibt aber auch keinen Fehler.

## 4. Technische Regeln (Sandbox)

Jedes Spiel läuft in einer **abgeschotteten Sandbox**. Daraus folgt:

- ✅ **Alles in den Spielordner:** HTML, JS, CSS, Bilder und Sounds liegen im eigenen Ordner und werden **relativ** eingebunden (`img/held.png`, nicht `/img/held.png` und nicht `C:\...`).
- ✅ Einzige Ausnahme für absolute Pfade: `/launcher-sdk.js`.
- ✅ **Kein Internet nötig:** keine CDNs, keine Google Fonts, keine externen APIs. Bibliotheken (z. B. Phaser, p5.js) als Datei in den Spielordner legen.
- ✅ `localStorage.getItem / setItem / removeItem / clear` funktionieren, das SDK übernimmt das Speichern pro Spieler. Nur diese Methoden verwenden, nicht `localStorage.foo = ...`.
- ❌ Kein `document.cookie`, kein `indexedDB`, kein `fetch` zu fremden Servern.
- ❌ Kein Zugriff auf `window.parent` / `window.top` außer über das SDK.
- ✅ `fetch('daten/level1.json')` für Dateien im eigenen Ordner funktioniert.
- ✅ `alert()`/`confirm()` funktionieren, besser ist aber eine eigene Anzeige im Spiel.
- ✅ Das Spiel soll sich an die Fenstergröße anpassen (z. B. `width: 100%; height: 100%` bzw. Canvas skalieren). Den Vollbild-Knopf stellt der Launcher bereit.
- ✅ Tastatur: Das Spiel bekommt den Fokus beim Start. Bei Pfeiltasten/Leertaste `e.preventDefault()` aufrufen.

## 5. Checkliste vor dem Abschluss

- [ ] Ordner `spiele/<kurzname>/` mit `index.html` und gültiger `spiel.json`
- [ ] `<script src="/launcher-sdk.js"></script>` als erstes Skript im `<head>`
- [ ] `Launcher.punkte(...)` wird am Rundenende mit einer ganzen Zahl aufgerufen
- [ ] Alle Pfade relativ, keine externen Server/CDNs
- [ ] Cover-Bild 630 × 500 px (oder bewusst weggelassen)
- [ ] Kein Code außerhalb von `spiele/<kurzname>/` geändert
- [ ] Wenn der Server läuft: `http://localhost:3000/uebersicht.html` (Spieleübersicht) öffnen und prüfen, ob das Spiel erscheint und startet

## Vorlage

Ein vollständiges Beispiel liegt in `spiele/beispiel-reaktionstest/`. Kopiere es als Ausgangspunkt, wenn du unsicher bist.
