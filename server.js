'use strict';
// =============================================================
//  Freistunden.exe – Server
//  Start: npm start   (oder start.bat)
// =============================================================
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const WURZEL = __dirname;
const SPIELE_ORDNER = process.env.SPIELE_ORDNER || path.join(WURZEL, 'spiele');
const PUBLIC_ORDNER = path.join(WURZEL, 'public');

// ---------- Sonderfall: Admin-Konto zurücksetzen ----------
if (process.argv.includes('--admin-zuruecksetzen')) {
  const n = require('./db').adminLoeschen();
  console.log(
    n
      ? 'Admin-Konto gelöscht. Beim nächsten Start kann ein neues eingerichtet werden.'
      : 'Es gab kein Admin-Konto.'
  );
  process.exit(0);
}

const express = require('express');
const db = require('./db');

// ---------- Einstellungen ----------
function ladeEinstellungen() {
  const standard = { seitenname: 'Freistunden.exe', untertitel: 'Spiele aus dem IO-Unterricht', port: 3000 };
  try {
    const roh = fs.readFileSync(path.join(WURZEL, 'einstellungen.json'), 'utf8').replace(/^﻿/, '');
    return { ...standard, ...JSON.parse(roh) };
  } catch {
    return standard;
  }
}
const einstellungen = ladeEinstellungen();

// Einrichtungscode: schützt das erste Anlegen des Admin-Kontos.
let einrichtungscode = db.adminExistiert() ? null : crypto.randomInt(100000, 1000000).toString();

// ---------- Hilfsfunktionen ----------
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const BENUTZERNAME = /^[a-z0-9._-]{2,40}$/i;
const KURZNAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ganzzahl = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const idListe = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);
const istEindeutigFehler = (e) => /UNIQUE/i.test(String(e && e.message));

function fehler(res, status, meldung) {
  return res.status(status).json({ fehler: meldung });
}

function cookieLesen(req, name) {
  const kopf = req.headers.cookie;
  if (!kopf) return null;
  for (const teil of kopf.split(';')) {
    const i = teil.indexOf('=');
    if (i > 0 && teil.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(teil.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function neuesPasswort() {
  const k = 'bdfghkmnprstvz';
  const v = 'aeiou';
  let s = '';
  for (let i = 0; i < 3; i++) s += k[crypto.randomInt(k.length)] + v[crypto.randomInt(v.length)];
  return s + crypto.randomInt(10, 100);
}

function benutzernameVorschlag(name) {
  let s = String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[ıİ]/g, 'i').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30);
  if (s.length < 2) s = (s + 'schueler').slice(0, 8);
  return s;
}

function eindeutigerBenutzername(basis) {
  let name = basis;
  let i = 2;
  while (!db.benutzernameFrei(name)) name = `${basis}${i++}`;
  return name;
}

// "Max Mustermann" -> "Max M."
function kurzform(name) {
  const teile = name.split(/\s+/).filter(Boolean);
  if (teile.length < 2) return name;
  return `${teile[0]} ${teile[teile.length - 1][0].toUpperCase()}.`;
}

function oeffentlich(u) {
  if (!u) return null;
  return { id: u.id, benutzername: u.benutzername, anzeigename: u.anzeigename, rolle: u.rolle, gruppen: db.gruppenVon(u.id) };
}

// ---------- Spiele einlesen (Ordner spiele/*) ----------
const COVER_NAMEN = ['cover.png', 'cover.jpg', 'cover.jpeg', 'cover.webp', 'cover.gif', 'cover.svg'];

function spielOrdnerGueltig(kurzname) {
  return KURZNAME.test(kurzname) && fs.existsSync(path.join(SPIELE_ORDNER, kurzname, 'index.html'));
}

function zahlImBereich(v, standard, min, max) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : standard;
}

function spielLesen(kurzname, status, statistik) {
  const ordner = path.join(SPIELE_ORDNER, kurzname);
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(ordner, 'spiel.json'), 'utf8').replace(/^﻿/, '')) || {};
  } catch {
    meta = {};
  }

  let cover = null;
  const kandidaten = typeof meta.cover === 'string' && meta.cover ? [meta.cover, ...COVER_NAMEN] : COVER_NAMEN;
  for (const c of kandidaten) {
    const sauber = c.replace(/\\/g, '/').replace(/^\.?\//, '');
    if (sauber.includes('..') || path.isAbsolute(sauber)) continue;
    if (fs.existsSync(path.join(ordner, sauber))) {
      cover = `/spiele/${kurzname}/${sauber.split('/').map(encodeURIComponent).join('/')}`;
      break;
    }
  }

  let datum = typeof meta.datum === 'string' && /^\d{4}-\d{2}-\d{2}/.test(meta.datum) ? meta.datum.slice(0, 10) : null;
  if (!datum) {
    try {
      datum = fs.statSync(ordner).birthtime.toISOString().slice(0, 10);
    } catch {
      datum = null;
    }
  }

  const beschreibung = text(meta.beschreibung, 4000);
  const s = statistik[kurzname] || { eintraege: 0, bestwert: null, spieler: 0 };
  return {
    kurzname,
    titel: text(meta.titel, 80) || kurzname,
    kurzbeschreibung: text(meta.kurzbeschreibung, 160) || (beschreibung.length > 140 ? beschreibung.slice(0, 137) + '…' : beschreibung),
    beschreibung,
    autor: text(meta.autor, 120),
    tags: Array.isArray(meta.tags) ? meta.tags.map((t) => text(t, 30)).filter(Boolean).slice(0, 8) : [],
    steuerung: text(meta.steuerung, 2000),
    breite: zahlImBereich(meta.breite, 960, 200, 4000),
    hoehe: zahlImBereich(meta.hoehe, 600, 150, 4000),
    cover,
    datum,
    sichtbar: status[kurzname] !== 0,
    eintraege: s.eintraege,
    bestwert: s.bestwert,
    spieler: s.spieler,
  };
}

function spieleEinlesen() {
  let eintraege = [];
  try {
    eintraege = fs.readdirSync(SPIELE_ORDNER, { withFileTypes: true });
  } catch {
    return [];
  }
  const status = db.spielStatus();
  const statistik = db.punkteZusammenfassung();
  return eintraege
    .filter((e) => e.isDirectory() && spielOrdnerGueltig(e.name))
    .map((e) => spielLesen(e.name, status, statistik))
    .sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || a.titel.localeCompare(b.titel, 'de'));
}

function einSpiel(kurzname) {
  if (!spielOrdnerGueltig(kurzname)) return null;
  return spielLesen(kurzname, db.spielStatus(), db.punkteZusammenfassung());
}

// ---------- Schutz gegen Durchprobieren von Passwörtern ----------
const fehlversuche = new Map();
const SPERRE_MS = 10 * 60 * 1000;
function istGesperrt(schluessel) {
  const e = fehlversuche.get(schluessel);
  return !!e && e.anzahl >= 10 && e.bis > Date.now();
}
function fehlversuch(schluessel) {
  const e = fehlversuche.get(schluessel);
  if (!e || e.bis < Date.now()) fehlversuche.set(schluessel, { anzahl: 1, bis: Date.now() + SPERRE_MS });
  else e.anzahl++;
}

// =============================================================
//  App
// =============================================================
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});

// Sitzung aus dem Cookie lesen
app.use((req, res, next) => {
  req.token = cookieLesen(req, 'io_sitzung');
  req.benutzer = req.token ? db.sitzungBenutzer(req.token) : null;
  next();
});

// Schreibende API-Aufrufe nur als JSON (schützt zusätzlich vor fremden Formularen)
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
    return fehler(res, 415, 'Bitte als JSON senden.');
  }
  res.set('Cache-Control', 'no-store');
  next();
});

const angemeldet = (req, res, next) => (req.benutzer ? next() : fehler(res, 401, 'Bitte zuerst anmelden.'));
const nurAdmin = (req, res, next) =>
  req.benutzer && req.benutzer.rolle === 'admin' ? next() : fehler(res, 403, 'Nur für den Admin.');
const istAdmin = (req) => !!req.benutzer && req.benutzer.rolle === 'admin';

function sitzungSetzen(req, res, benutzerId) {
  const token = db.sitzungErstellen(benutzerId);
  res.cookie('io_sitzung', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

// ---------- Allgemein ----------
app.get('/api/status', (req, res) => {
  res.json({
    seitenname: einstellungen.seitenname,
    untertitel: einstellungen.untertitel,
    eingerichtet: db.adminExistiert(),
    ich: oeffentlich(req.benutzer),
  });
});

app.post('/api/einrichten', (req, res) => {
  if (db.adminExistiert()) return fehler(res, 409, 'Es gibt bereits ein Admin-Konto.');
  if (text(req.body.code, 20) !== einrichtungscode) {
    return fehler(res, 403, 'Der Einrichtungscode stimmt nicht. Er steht im Server-Fenster.');
  }
  const benutzername = text(req.body.benutzername, 40) || 'admin';
  const anzeigename = text(req.body.anzeigename, 60) || 'Admin';
  const passwort = typeof req.body.passwort === 'string' ? req.body.passwort : '';
  if (!BENUTZERNAME.test(benutzername)) {
    return fehler(res, 400, 'Benutzername: 2–40 Zeichen, nur Buchstaben, Zahlen, Punkt, - und _.');
  }
  if (passwort.length < 8) return fehler(res, 400, 'Das Passwort muss mindestens 8 Zeichen haben.');
  try {
    const id = db.benutzerAnlegen({ benutzername, anzeigename, passwort, rolle: 'admin' });
    einrichtungscode = null;
    sitzungSetzen(req, res, id);
    res.json({ ok: true });
  } catch (e) {
    if (istEindeutigFehler(e)) return fehler(res, 409, 'Es gibt bereits ein Admin-Konto.');
    throw e;
  }
});

app.post('/api/login', (req, res) => {
  const benutzername = text(req.body.benutzername, 40);
  const passwort = typeof req.body.passwort === 'string' ? req.body.passwort.slice(0, 200) : '';
  const schluessel = `${req.ip}|${benutzername.toLowerCase()}`;
  if (istGesperrt(schluessel)) return fehler(res, 429, 'Zu viele Fehlversuche. Bitte 10 Minuten warten.');
  const u = db.anmelden(benutzername, passwort);
  if (!u) {
    fehlversuch(schluessel);
    return fehler(res, 401, 'Benutzername oder Passwort ist falsch.');
  }
  fehlversuche.delete(schluessel);
  sitzungSetzen(req, res, u.id);
  res.json({ ok: true, ich: oeffentlich(u) });
});

app.post('/api/logout', (req, res) => {
  if (req.token) db.sitzungLoeschen(req.token);
  res.clearCookie('io_sitzung', { path: '/' });
  res.json({ ok: true });
});

app.post('/api/passwort', angemeldet, (req, res) => {
  const alt = typeof req.body.alt === 'string' ? req.body.alt : '';
  const neu = typeof req.body.neu === 'string' ? req.body.neu : '';
  const min = req.benutzer.rolle === 'admin' ? 8 : 6;
  if (!db.anmelden(req.benutzer.benutzername, alt)) return fehler(res, 400, 'Das bisherige Passwort ist falsch.');
  if (neu.length < min || neu.length > 200) return fehler(res, 400, `Das neue Passwort braucht mindestens ${min} Zeichen.`);
  db.passwortSetzen(req.benutzer.id, neu);
  res.json({ ok: true });
});

// ---------- Spiele & Statistik ----------
app.get('/api/spiele', (req, res) => {
  const admin = istAdmin(req);
  res.json(spieleEinlesen().filter((s) => admin || s.sichtbar));
});

app.get('/api/spiele/:kurzname', (req, res) => {
  const spiel = einSpiel(req.params.kurzname);
  if (!spiel || (!spiel.sichtbar && !istAdmin(req))) return fehler(res, 404, 'Spiel nicht gefunden.');
  res.json(spiel);
});

app.get('/api/gruppen', angemeldet, (req, res) => {
  res.json(db.alleGruppen().map(({ id, name }) => ({ id, name })));
});

// Rangliste: Name, Punktzahl, Datum – absteigend nach Punktzahl
app.get('/api/statistik/:kurzname', angemeldet, (req, res) => {
  const spiel = einSpiel(req.params.kurzname);
  if (!spiel || (!spiel.sichtbar && !istAdmin(req))) return fehler(res, 404, 'Spiel nicht gefunden.');
  const gruppe = ganzzahl(req.query.gruppe);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 50));
  let platz = 0;
  let vorher = null;
  const eintraege = db.rangliste(spiel.kurzname, gruppe, limit).map((e, i) => {
    if (e.punktzahl !== vorher) platz = i + 1;
    vorher = e.punktzahl;
    return {
      platz,
      id: e.id,
      name: e.name,
      punktzahl: e.punktzahl,
      erspielt_am: e.erspielt_am,
      eigen: e.benutzer_id === req.benutzer.id,
      ...(istAdmin(req) ? { benutzername: e.benutzername } : {}),
    };
  });
  res.json({ spiel: spiel.kurzname, gruppe, gesamt: db.anzahlEintraege(spiel.kurzname, gruppe), eintraege });
});

const letzteMeldung = new Map();
app.post('/api/punkte', angemeldet, (req, res) => {
  const spiel = einSpiel(text(req.body.spiel, 64));
  if (!spiel || (!spiel.sichtbar && !istAdmin(req))) return fehler(res, 404, 'Spiel nicht gefunden.');
  const n = Number(req.body.punktzahl);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return fehler(res, 400, 'Ungültige Punktzahl.');
  const schluessel = `${req.benutzer.id}|${spiel.kurzname}`;
  if (Date.now() - (letzteMeldung.get(schluessel) || 0) < 2000) {
    return fehler(res, 429, 'Zu schnell hintereinander – bitte kurz warten.');
  }
  letzteMeldung.set(schluessel, Date.now());
  const punktzahl = Math.round(n);
  const { id, platz } = db.punkteEintragen(spiel.kurzname, req.benutzer.id, punktzahl);
  res.json({ ok: true, id, platz, punktzahl });
});

// Zuletzt gespielte Spiele (für das Regal auf dem Homebildschirm)
app.get('/api/zuletzt', angemeldet, (req, res) => {
  res.json(db.zuletztGespielt(req.benutzer.id, 30));
});

app.post('/api/gespielt', angemeldet, (req, res) => {
  const spiel = einSpiel(text(req.body.spiel, 64));
  if (!spiel || (!spiel.sichtbar && !istAdmin(req))) return fehler(res, 404, 'Spiel nicht gefunden.');
  db.gespieltMerken(req.benutzer.id, spiel.kurzname);
  res.json({ ok: true });
});

// =============================================================
//  Admin
// =============================================================
const admin = express.Router();
admin.use(nurAdmin);

// ----- Konten -----
admin.get('/benutzer', (req, res) => res.json(db.alleBenutzer()));

admin.post('/benutzer', (req, res) => {
  const anzeigename = text(req.body.anzeigename, 60);
  if (!anzeigename) return fehler(res, 400, 'Bitte einen Anzeigenamen eingeben.');
  let benutzername = text(req.body.benutzername, 40);
  if (benutzername && !BENUTZERNAME.test(benutzername)) {
    return fehler(res, 400, 'Benutzername: 2–40 Zeichen, nur Buchstaben, Zahlen, Punkt, - und _.');
  }
  if (benutzername && !db.benutzernameFrei(benutzername)) return fehler(res, 409, 'Dieser Benutzername ist schon vergeben.');
  if (!benutzername) benutzername = eindeutigerBenutzername(benutzernameVorschlag(anzeigename));
  const passwort = text(req.body.passwort, 200) || neuesPasswort();
  if (passwort.length < 6) return fehler(res, 400, 'Das Passwort braucht mindestens 6 Zeichen.');
  const id = db.benutzerAnlegen({ benutzername, anzeigename, passwort, gruppen: idListe(req.body.gruppen) });
  res.json({ id, benutzername, anzeigename, passwort });
});

admin.post('/benutzer/liste', (req, res) => {
  const namen = String(req.body.namen || '')
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 300);
  if (!namen.length) return fehler(res, 400, 'Bitte mindestens einen Namen eingeben (einer pro Zeile).');
  const gruppen = idListe(req.body.gruppen);
  const abkuerzen = req.body.abkuerzen !== false;
  const erstellt = [];
  for (const voll of namen) {
    const anzeigename = abkuerzen ? kurzform(voll) : voll;
    const benutzername = eindeutigerBenutzername(benutzernameVorschlag(voll));
    const passwort = neuesPasswort();
    const id = db.benutzerAnlegen({ benutzername, anzeigename, passwort, gruppen });
    erstellt.push({ id, anzeigename, benutzername, passwort });
  }
  res.json(erstellt);
});

admin.patch('/benutzer/:id', (req, res) => {
  const u = db.benutzerNachId(ganzzahl(req.params.id));
  if (!u) return fehler(res, 404, 'Konto nicht gefunden.');
  const anzeigename = text(req.body.anzeigename, 60) || u.anzeigename;
  const benutzername = text(req.body.benutzername, 40) || u.benutzername;
  if (!BENUTZERNAME.test(benutzername)) {
    return fehler(res, 400, 'Benutzername: 2–40 Zeichen, nur Buchstaben, Zahlen, Punkt, - und _.');
  }
  try {
    db.benutzerAendern(u.id, benutzername, anzeigename);
  } catch (e) {
    if (istEindeutigFehler(e)) return fehler(res, 409, 'Dieser Benutzername ist schon vergeben.');
    throw e;
  }
  res.json({ ok: true });
});

admin.put('/benutzer/:id/gruppen', (req, res) => {
  const u = db.benutzerNachId(ganzzahl(req.params.id));
  if (!u) return fehler(res, 404, 'Konto nicht gefunden.');
  db.gruppenSetzen(u.id, idListe(req.body.gruppen));
  res.json({ ok: true });
});

admin.post('/benutzer/:id/passwort', (req, res) => {
  const u = db.benutzerNachId(ganzzahl(req.params.id));
  if (!u) return fehler(res, 404, 'Konto nicht gefunden.');
  if (u.rolle === 'admin') return fehler(res, 400, 'Das eigene Passwort bitte über „Passwort ändern“ setzen.');
  const passwort = neuesPasswort();
  db.passwortSetzen(u.id, passwort);
  db.sitzungenVonLoeschen(u.id);
  res.json({ benutzername: u.benutzername, anzeigename: u.anzeigename, passwort });
});

admin.delete('/benutzer/:id', (req, res) => {
  const id = ganzzahl(req.params.id);
  if (id === req.benutzer.id) return fehler(res, 400, 'Das Admin-Konto kann nicht gelöscht werden.');
  if (!db.benutzerLoeschen(id)) return fehler(res, 404, 'Konto nicht gefunden.');
  res.json({ ok: true });
});

// ----- Gruppen -----
admin.get('/gruppen', (req, res) => res.json(db.alleGruppen()));

admin.post('/gruppen', (req, res) => {
  const name = text(req.body.name, 60);
  if (!name) return fehler(res, 400, 'Bitte einen Gruppennamen eingeben.');
  try {
    res.json({ id: db.gruppeAnlegen(name), name });
  } catch (e) {
    if (istEindeutigFehler(e)) return fehler(res, 409, 'Diese Gruppe gibt es schon.');
    throw e;
  }
});

admin.patch('/gruppen/:id', (req, res) => {
  const name = text(req.body.name, 60);
  if (!name) return fehler(res, 400, 'Bitte einen Gruppennamen eingeben.');
  try {
    if (!db.gruppeUmbenennen(ganzzahl(req.params.id), name)) return fehler(res, 404, 'Gruppe nicht gefunden.');
  } catch (e) {
    if (istEindeutigFehler(e)) return fehler(res, 409, 'Diese Gruppe gibt es schon.');
    throw e;
  }
  res.json({ ok: true });
});

admin.delete('/gruppen/:id', (req, res) => {
  if (!db.gruppeLoeschen(ganzzahl(req.params.id))) return fehler(res, 404, 'Gruppe nicht gefunden.');
  res.json({ ok: true });
});

admin.post('/gruppen/:id/hinzufuegen', (req, res) => {
  const gid = ganzzahl(req.params.id);
  if (!gid || !db.gruppeExistiert(gid)) return fehler(res, 404, 'Gruppe nicht gefunden.');
  res.json({ ok: true, geaendert: db.mitgliederHinzufuegen(gid, idListe(req.body.benutzer)) });
});

admin.post('/gruppen/:id/entfernen', (req, res) => {
  const gid = ganzzahl(req.params.id);
  if (!gid || !db.gruppeExistiert(gid)) return fehler(res, 404, 'Gruppe nicht gefunden.');
  res.json({ ok: true, geaendert: db.mitgliederEntfernen(gid, idListe(req.body.benutzer)) });
});

// ----- Spiele & Punkte -----
admin.post('/spiele/:kurzname/sichtbar', (req, res) => {
  if (!spielOrdnerGueltig(req.params.kurzname)) return fehler(res, 404, 'Spiel nicht gefunden.');
  db.spielSichtbarSetzen(req.params.kurzname, req.body.sichtbar !== false);
  res.json({ ok: true });
});

admin.delete('/punkte/:id', (req, res) => {
  if (!db.punkteLoeschen(ganzzahl(req.params.id))) return fehler(res, 404, 'Eintrag nicht gefunden.');
  res.json({ ok: true });
});

app.use('/api/admin', admin);
app.use('/api', (req, res) => fehler(res, 404, 'Nicht gefunden.'));

// =============================================================
//  Statische Dateien
// =============================================================
// Spiele laufen immer in einer Sandbox (eigener, abgeschotteter Ursprung).
// So kann kein Spiel auf Logins oder die Admin-Funktionen zugreifen.
app.use(
  '/spiele',
  (req, res, next) => {
    res.set(
      'Content-Security-Policy',
      'sandbox allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads allow-orientation-lock'
    );
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    next();
  },
  express.static(SPIELE_ORDNER, { dotfiles: 'ignore' })
);

app.use(
  (req, res, next) => {
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  },
  express.static(PUBLIC_ORDNER, { extensions: ['html'] })
);

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_ORDNER, '404.html')));

// Fehlerbehandlung
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return fehler(res, 400, 'Ungültige Daten.');
  if (err && err.type === 'entity.too.large') return fehler(res, 413, 'Die Daten sind zu groß.');
  console.error(err);
  if (res.headersSent) return next(err);
  fehler(res, 500, 'Interner Fehler.');
});

// Abgelaufene Sitzungen regelmäßig aufräumen
setInterval(() => db.abgelaufeneSitzungenLoeschen(), 60 * 60 * 1000).unref();
db.abgelaufeneSitzungenLoeschen();

// =============================================================
//  Start
// =============================================================
const PORT = Number(process.env.PORT) || Number(einstellungen.port) || 3000;
const HOST = process.env.HOST || einstellungen.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const adressen = [];
  const nurLokal = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  if (!nurLokal) for (const liste of Object.values(os.networkInterfaces())) {
    for (const a of liste || []) if (a.family === 'IPv4' && !a.internal) adressen.push(`http://${a.address}:${PORT}`);
  }
  console.log('');
  console.log(`  ${einstellungen.seitenname} läuft.`);
  console.log(`  Auf diesem PC:     http://localhost:${PORT}`);
  if (adressen.length) console.log(`  Im Schulnetz:      ${adressen.join('   ')}`);
  console.log(`  Spiele gefunden:   ${spieleEinlesen().length}`);
  if (einrichtungscode) {
    console.log('');
    console.log('  Noch kein Admin-Konto vorhanden.');
    console.log(`  Öffne http://localhost:${PORT}/einrichten und gib diesen Code ein:  ${einrichtungscode}`);
  }
  console.log('');
  console.log('  Zum Beenden dieses Fenster schließen (oder Strg+C).');
  console.log('');

  if (process.argv.includes('--oeffnen')) {
    const url = `http://localhost:${PORT}${einrichtungscode ? '/einrichten' : ''}`;
    const { exec } = require('node:child_process');
    if (process.platform === 'win32') exec(`start "" "${url}"`);
    else if (process.platform === 'darwin') exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  }
});
