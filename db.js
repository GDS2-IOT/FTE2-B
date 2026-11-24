'use strict';
// =============================================================
//  Datenbank (SQLite) – Konten, Gruppen, Sitzungen, Punkte
//  Nutzt das in Node.js eingebaute Modul node:sqlite.
// =============================================================
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATEN_ORDNER = process.env.DATEN_ORDNER || path.join(__dirname, 'daten');
fs.mkdirSync(DATEN_ORDNER, { recursive: true });

const db = new DatabaseSync(path.join(DATEN_ORDNER, 'launcher.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS benutzer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  benutzername  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  anzeigename   TEXT NOT NULL,
  passwort_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  rolle         TEXT NOT NULL DEFAULT 'schueler' CHECK (rolle IN ('schueler', 'admin')),
  erstellt_am   TEXT NOT NULL
);
-- Es darf genau ein Admin-Konto geben.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ein_admin ON benutzer(rolle) WHERE rolle = 'admin';

CREATE TABLE IF NOT EXISTS gruppen (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  erstellt_am TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benutzer_gruppen (
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  gruppe_id   INTEGER NOT NULL REFERENCES gruppen(id)  ON DELETE CASCADE,
  PRIMARY KEY (benutzer_id, gruppe_id)
);

CREATE TABLE IF NOT EXISTS sitzungen (
  token_hash  TEXT PRIMARY KEY,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  laeuft_ab   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS punkte (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spiel       TEXT NOT NULL,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  punktzahl   INTEGER NOT NULL,
  erspielt_am TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_punkte_spiel ON punkte(spiel, punktzahl DESC);

CREATE TABLE IF NOT EXISTS spiel_status (
  spiel    TEXT PRIMARY KEY,
  sichtbar INTEGER NOT NULL DEFAULT 1
);

-- Wann hat welches Konto welches Spiel zuletzt gestartet (für das Regal auf dem Homebildschirm)
CREATE TABLE IF NOT EXISTS gespielt (
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  spiel       TEXT NOT NULL,
  zuletzt     TEXT NOT NULL,
  PRIMARY KEY (benutzer_id, spiel)
);
`);

const SITZUNG_STUNDEN = 12;
const jetzt = () => new Date().toISOString();

// ---------- Hilfsfunktionen ----------
function transaktion(fn) {
  db.exec('BEGIN');
  try {
    const ergebnis = fn();
    db.exec('COMMIT');
    return ergebnis;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function hashPasswort(passwort, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(passwort, salt, 64).toString('hex') };
}

function pruefePasswort(passwort, salt, hash) {
  const ist = crypto.scryptSync(passwort, salt, 64);
  const soll = Buffer.from(hash, 'hex');
  return soll.length === ist.length && crypto.timingSafeEqual(ist, soll);
}

const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const zuIds = (text) => (text ? String(text).split(',').map(Number) : []);

// ---------- Konten ----------
const q = {
  adminZaehlen: db.prepare("SELECT COUNT(*) AS n FROM benutzer WHERE rolle = 'admin'"),
  benutzerNeu: db.prepare(
    'INSERT INTO benutzer (benutzername, anzeigename, passwort_hash, salt, rolle, erstellt_am) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  benutzerNachName: db.prepare('SELECT * FROM benutzer WHERE benutzername = ?'),
  benutzerNachId: db.prepare('SELECT id, benutzername, anzeigename, rolle, erstellt_am FROM benutzer WHERE id = ?'),
  alleBenutzer: db.prepare(`
    SELECT b.id, b.benutzername, b.anzeigename, b.rolle, b.erstellt_am,
           (SELECT group_concat(gruppe_id) FROM benutzer_gruppen WHERE benutzer_id = b.id) AS gruppen,
           (SELECT COUNT(*) FROM punkte WHERE benutzer_id = b.id) AS punkte
    FROM benutzer b
    ORDER BY (b.rolle = 'admin') DESC, b.anzeigename COLLATE NOCASE`),
  benutzerAendern: db.prepare('UPDATE benutzer SET benutzername = ?, anzeigename = ? WHERE id = ?'),
  passwortSetzen: db.prepare('UPDATE benutzer SET passwort_hash = ?, salt = ? WHERE id = ?'),
  benutzerLoeschen: db.prepare("DELETE FROM benutzer WHERE id = ? AND rolle <> 'admin'"),
  adminLoeschen: db.prepare("DELETE FROM benutzer WHERE rolle = 'admin'"),

  // Gruppen
  alleGruppen: db.prepare(`
    SELECT g.id, g.name, g.erstellt_am,
           (SELECT COUNT(*) FROM benutzer_gruppen WHERE gruppe_id = g.id) AS mitglieder
    FROM gruppen g ORDER BY g.name COLLATE NOCASE`),
  gruppeNeu: db.prepare('INSERT INTO gruppen (name, erstellt_am) VALUES (?, ?)'),
  gruppeUmbenennen: db.prepare('UPDATE gruppen SET name = ? WHERE id = ?'),
  gruppeLoeschen: db.prepare('DELETE FROM gruppen WHERE id = ?'),
  gruppeExistiert: db.prepare('SELECT 1 FROM gruppen WHERE id = ?'),
  mitgliedNeu: db.prepare('INSERT OR IGNORE INTO benutzer_gruppen (benutzer_id, gruppe_id) VALUES (?, ?)'),
  mitgliedWeg: db.prepare('DELETE FROM benutzer_gruppen WHERE benutzer_id = ? AND gruppe_id = ?'),
  mitgliedschaftenWeg: db.prepare('DELETE FROM benutzer_gruppen WHERE benutzer_id = ?'),
  gruppenVon: db.prepare(`
    SELECT g.id, g.name FROM gruppen g
    JOIN benutzer_gruppen bg ON bg.gruppe_id = g.id
    WHERE bg.benutzer_id = ? ORDER BY g.name COLLATE NOCASE`),

  // Sitzungen
  sitzungNeu: db.prepare('INSERT INTO sitzungen (token_hash, benutzer_id, laeuft_ab) VALUES (?, ?, ?)'),
  sitzungBenutzer: db.prepare(`
    SELECT b.id, b.benutzername, b.anzeigename, b.rolle
    FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id
    WHERE s.token_hash = ? AND s.laeuft_ab > ?`),
  sitzungWeg: db.prepare('DELETE FROM sitzungen WHERE token_hash = ?'),
  sitzungenVonWeg: db.prepare('DELETE FROM sitzungen WHERE benutzer_id = ?'),
  sitzungenAlt: db.prepare('DELETE FROM sitzungen WHERE laeuft_ab <= ?'),

  // Punkte
  punkteNeu: db.prepare('INSERT INTO punkte (spiel, benutzer_id, punktzahl, erspielt_am) VALUES (?, ?, ?, ?)'),
  besserAls: db.prepare('SELECT COUNT(*) AS n FROM punkte WHERE spiel = ? AND punktzahl > ?'),
  rangliste: db.prepare(`
    SELECT p.id, p.punktzahl, p.erspielt_am, b.id AS benutzer_id, b.anzeigename AS name, b.benutzername
    FROM punkte p JOIN benutzer b ON b.id = p.benutzer_id
    WHERE p.spiel = ?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM benutzer_gruppen bg WHERE bg.benutzer_id = b.id AND bg.gruppe_id = ?))
    ORDER BY p.punktzahl DESC, p.erspielt_am ASC
    LIMIT ?`),
  anzahlEintraege: db.prepare(`
    SELECT COUNT(*) AS n FROM punkte p
    WHERE p.spiel = ?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM benutzer_gruppen bg WHERE bg.benutzer_id = p.benutzer_id AND bg.gruppe_id = ?))`),
  zusammenfassung: db.prepare(`
    SELECT spiel, COUNT(*) AS eintraege, MAX(punktzahl) AS bestwert, COUNT(DISTINCT benutzer_id) AS spieler
    FROM punkte GROUP BY spiel`),
  punkteLoeschen: db.prepare('DELETE FROM punkte WHERE id = ?'),

  // Zuletzt gespielt
  gespieltSetzen: db.prepare(`
    INSERT INTO gespielt (benutzer_id, spiel, zuletzt) VALUES (?, ?, ?)
    ON CONFLICT(benutzer_id, spiel) DO UPDATE SET zuletzt = excluded.zuletzt`),
  zuletzt: db.prepare('SELECT spiel, zuletzt FROM gespielt WHERE benutzer_id = ? ORDER BY zuletzt DESC LIMIT ?'),

  // Spiele
  spielStatus: db.prepare('SELECT spiel, sichtbar FROM spiel_status'),
  spielSichtbar: db.prepare(`
    INSERT INTO spiel_status (spiel, sichtbar) VALUES (?, ?)
    ON CONFLICT(spiel) DO UPDATE SET sichtbar = excluded.sichtbar`),
};

// Wird für nicht vorhandene Konten genutzt, damit die Antwortzeit gleich bleibt.
const DUMMY = hashPasswort('dummy-passwort');

module.exports = {
  // ----- Konten -----
  adminExistiert: () => q.adminZaehlen.get().n > 0,

  benutzernameFrei: (name) => !q.benutzerNachName.get(name),

  benutzerAnlegen({ benutzername, anzeigename, passwort, rolle = 'schueler', gruppen = [] }) {
    return transaktion(() => {
      const { salt, hash } = hashPasswort(passwort);
      const info = q.benutzerNeu.run(benutzername, anzeigename, hash, salt, rolle, jetzt());
      const id = Number(info.lastInsertRowid);
      for (const g of gruppen) if (q.gruppeExistiert.get(g)) q.mitgliedNeu.run(id, g);
      return id;
    });
  },

  anmelden(benutzername, passwort) {
    const u = q.benutzerNachName.get(benutzername);
    if (!u) {
      pruefePasswort(passwort, DUMMY.salt, DUMMY.hash);
      return null;
    }
    if (!pruefePasswort(passwort, u.salt, u.passwort_hash)) return null;
    return { id: u.id, benutzername: u.benutzername, anzeigename: u.anzeigename, rolle: u.rolle };
  },

  benutzerNachId: (id) => q.benutzerNachId.get(id) || null,

  alleBenutzer: () => q.alleBenutzer.all().map((b) => ({ ...b, gruppen: zuIds(b.gruppen) })),

  benutzerAendern: (id, benutzername, anzeigename) => q.benutzerAendern.run(benutzername, anzeigename, id).changes > 0,

  passwortSetzen(id, passwort) {
    const { salt, hash } = hashPasswort(passwort);
    return q.passwortSetzen.run(hash, salt, id).changes > 0;
  },

  benutzerLoeschen: (id) => q.benutzerLoeschen.run(id).changes > 0,

  adminLoeschen: () => q.adminLoeschen.run().changes,

  // ----- Gruppen -----
  alleGruppen: () => q.alleGruppen.all(),
  gruppeAnlegen: (name) => Number(q.gruppeNeu.run(name, jetzt()).lastInsertRowid),
  gruppeUmbenennen: (id, name) => q.gruppeUmbenennen.run(name, id).changes > 0,
  gruppeLoeschen: (id) => q.gruppeLoeschen.run(id).changes > 0,
  gruppeExistiert: (id) => !!q.gruppeExistiert.get(id),
  gruppenVon: (benutzerId) => q.gruppenVon.all(benutzerId),

  mitgliederHinzufuegen: (gruppeId, benutzerIds) =>
    transaktion(() => benutzerIds.reduce((n, b) => n + q.mitgliedNeu.run(b, gruppeId).changes, 0)),

  mitgliederEntfernen: (gruppeId, benutzerIds) =>
    transaktion(() => benutzerIds.reduce((n, b) => n + q.mitgliedWeg.run(b, gruppeId).changes, 0)),

  gruppenSetzen: (benutzerId, gruppenIds) =>
    transaktion(() => {
      q.mitgliedschaftenWeg.run(benutzerId);
      for (const g of gruppenIds) if (q.gruppeExistiert.get(g)) q.mitgliedNeu.run(benutzerId, g);
    }),

  // ----- Sitzungen -----
  sitzungErstellen(benutzerId) {
    const token = crypto.randomBytes(32).toString('hex');
    const ablauf = new Date(Date.now() + SITZUNG_STUNDEN * 3600 * 1000).toISOString();
    q.sitzungNeu.run(tokenHash(token), benutzerId, ablauf);
    return token;
  },
  sitzungBenutzer: (token) => q.sitzungBenutzer.get(tokenHash(token), jetzt()) || null,
  sitzungLoeschen: (token) => q.sitzungWeg.run(tokenHash(token)),
  sitzungenVonLoeschen: (benutzerId) => q.sitzungenVonWeg.run(benutzerId),
  abgelaufeneSitzungenLoeschen: () => q.sitzungenAlt.run(jetzt()),

  // ----- Punkte -----
  punkteEintragen(spiel, benutzerId, punktzahl) {
    const info = q.punkteNeu.run(spiel, benutzerId, punktzahl, jetzt());
    const platz = q.besserAls.get(spiel, punktzahl).n + 1;
    return { id: Number(info.lastInsertRowid), platz };
  },
  rangliste: (spiel, gruppeId, limit) => q.rangliste.all(spiel, gruppeId, gruppeId, limit),
  anzahlEintraege: (spiel, gruppeId) => q.anzahlEintraege.get(spiel, gruppeId, gruppeId).n,
  punkteZusammenfassung() {
    const map = {};
    for (const z of q.zusammenfassung.all()) {
      map[z.spiel] = { eintraege: z.eintraege, bestwert: z.bestwert, spieler: z.spieler };
    }
    return map;
  },
  punkteLoeschen: (id) => q.punkteLoeschen.run(id).changes > 0,

  // ----- Zuletzt gespielt -----
  gespieltMerken: (benutzerId, spiel) => q.gespieltSetzen.run(benutzerId, spiel, jetzt()),
  zuletztGespielt: (benutzerId, limit = 30) => q.zuletzt.all(benutzerId, limit),

  // ----- Spiele -----
  spielStatus() {
    const map = {};
    for (const s of q.spielStatus.all()) map[s.spiel] = s.sichtbar;
    return map;
  },
  spielSichtbarSetzen: (spiel, sichtbar) => q.spielSichtbar.run(spiel, sichtbar ? 1 : 0),
};
