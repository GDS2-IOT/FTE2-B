'use strict';
// =============================================================
//  Gemeinsame Funktionen für alle Seiten
// =============================================================
const IO = (() => {
  let status = null;

  // ---------- Server-Anfragen ----------
  async function api(pfad, { methode = 'GET', daten } = {}) {
    const opt = { method: methode, headers: {}, credentials: 'same-origin' };
    if (methode !== 'GET') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(daten || {});
    }
    let antwort;
    try {
      antwort = await fetch(pfad, opt);
    } catch {
      throw new Error('Keine Verbindung zum Server.');
    }
    let json = null;
    try {
      json = await antwort.json();
    } catch {
      json = null;
    }
    if (!antwort.ok) {
      const fehler = new Error((json && json.fehler) || `Fehler ${antwort.status}`);
      fehler.status = antwort.status;
      throw fehler;
    }
    return json;
  }

  // ---------- DOM-Helfer ----------
  function el(tag, attrs, ...kinder) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [s, w] of Object.entries(v)) s.startsWith('--') ? e.style.setProperty(s, w) : (e.style[s] = w);
      }
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kind of kinder.flat(Infinity)) {
      if (kind == null || kind === false) continue;
      e.append(kind instanceof Node ? kind : String(kind));
    }
    return e;
  }

  const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
  const $$ = (sel, wurzel = document) => [...wurzel.querySelectorAll(sel)];

  // ---------- Formatierung ----------
  const zahl = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));
  function datum(iso, mitZeit = true) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return mitZeit
      ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  // Platz als farbiges Abzeichen (1 = Lime, 2 = Cyan, 3 = Amber)
  const medaille = (platz) => el('span', { class: `platz-badge${platz <= 3 ? ` p${platz}` : ''}`, text: platz });
  const param = (name) => new URLSearchParams(location.search).get(name);

  // ---------- Cover-Platzhalter (wenn ein Spiel kein Bild hat) ----------
  function farbwert(t) {
    let h = 0;
    for (const c of String(t)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h % 360;
  }
  function initialen(titel) {
    const w = String(titel).split(/[\s_-]+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
  }
  function platzhalter(titel) {
    const h = farbwert(titel);
    return el('div', {
      class: 'platzhalter',
      text: initialen(titel),
      style: { background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 70% 40%))` },
      'aria-hidden': 'true',
    });
  }
  function coverBild(spiel) {
    return spiel.cover ? el('img', { src: spiel.cover, alt: '', loading: 'lazy' }) : platzhalter(spiel.titel);
  }

  // Tag in einer festen Farbe je Name (Lime, Cyan oder Amber)
  const TAG_FARBEN = ['t-lime', 't-cyan', 't-amber'];
  const tag = (name) => el('span', { class: `tag ${TAG_FARBEN[farbwert(name.toLowerCase()) % 3]}`, text: name });

  // Klick-Welle auf Buttons, Chips, Navigation und Reitern
  function wellenAktivieren() {
    document.addEventListener('pointerdown', (e) => {
      const ziel = e.target.closest('.btn, .chip, .nav a, .reiter button');
      if (!ziel || ziel.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const r = ziel.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const w = el('span', {
        class: 'welle',
        style: { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` },
      });
      ziel.append(w);
      w.addEventListener('animationend', () => w.remove());
    });
  }

  // ---------- Toasts ----------
  function toast(meldung, art = '') {
    let box = $('#toasts');
    if (!box) {
      box = el('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.append(box);
    }
    const t = el('div', { class: `toast ${art}`, text: meldung });
    box.append(t);
    setTimeout(() => t.remove(), art === 'fehler' ? 5000 : 3500);
  }

  // ---------- Kopfzeile ----------
  const LOGO = `<svg width="50" height="50" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="22.5" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.16)"/><g transform="translate(7 7)"><path d="M9 12h3v-3h2v3h3v2h-3v3h-2v-3H9z" fill="#d4f53c"/><circle cx="21" cy="12" r="1.8" fill="#3fe3ec"/><circle cx="24" cy="16" r="1.8" fill="#fbbd3b"/><path d="M7 21c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3v1H7z" fill="#fff" opacity=".5"/></g></svg>`;

  function kopfzeile(aktiv) {
    const kopf = $('#kopf');
    if (!kopf) return;
    const ich = status && status.ich;
    const marke = el('a', { class: 'marke', href: '/', title: 'Zum Homebildschirm' });
    marke.innerHTML = LOGO;
    // Dateiendung (z. B. ".exe") farbig absetzen
    const name = (status && status.seitenname) || 'Freistunden.exe';
    const punkt = name.lastIndexOf('.');
    marke.append(
      punkt > 0 ? el('span', {}, name.slice(0, punkt), el('em', { text: name.slice(punkt) })) : el('span', { text: name })
    );

    const links = [
      ['spiele', '/uebersicht.html', 'Spiele'],
      ['statistik', '/statistik.html', 'Statistik'],
    ];
    if (ich && ich.rolle === 'admin') links.push(['admin', '/admin.html', 'Admin']);
    const indikator = el('span', { class: 'nav-indikator', 'aria-hidden': 'true' });
    const nav = el(
      'nav',
      { class: 'nav' },
      indikator,
      links.map(([id, href, t]) => el('a', { href, text: t, class: id === aktiv ? 'aktiv' : null }))
    );
    // Gleitende Markierung hinter dem aktiven bzw. überfahrenen Menüpunkt
    const indikatorAuf = (a) => {
      if (!a) {
        indikator.style.opacity = '0';
        return;
      }
      indikator.style.opacity = '1';
      indikator.style.width = `${a.offsetWidth}px`;
      indikator.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const aktiverLink = () => nav.querySelector('a.aktiv');
    nav.addEventListener('pointerover', (e) => {
      const a = e.target.closest('a');
      if (a) indikatorAuf(a);
    });
    nav.addEventListener('pointerleave', () => indikatorAuf(aktiverLink()));
    window.addEventListener('resize', () => indikatorAuf(aktiverLink()));
    requestAnimationFrame(() => {
      indikatorAuf(aktiverLink());
      requestAnimationFrame(() => nav.classList.add('bereit'));
    });

    let rechts;
    if (ich) {
      const menue = el('div', { class: 'benutzermenue' });
      const knopf = el(
        'button',
        { class: 'btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
        el('span', { class: 'avatar', text: initialen(ich.anzeigename) }),
        el('span', { class: 'name', text: ich.anzeigename })
      );
      const liste = el(
        'div',
        { class: 'liste' },
        el(
          'div',
          { class: 'info' },
          el('strong', { text: ich.anzeigename }),
          `@${ich.benutzername}`,
          ich.gruppen && ich.gruppen.length ? el('div', { text: ich.gruppen.map((g) => g.name).join(', ') }) : null
        ),
        el('button', { type: 'button', text: 'Passwort ändern', onclick: passwortDialog }),
        el('button', { type: 'button', text: 'Abmelden', onclick: abmelden })
      );
      knopf.addEventListener('click', (e) => {
        e.stopPropagation();
        const offen = menue.classList.toggle('offen');
        knopf.setAttribute('aria-expanded', String(offen));
      });
      document.addEventListener('click', (e) => {
        if (!menue.contains(e.target)) menue.classList.remove('offen');
      });
      menue.append(knopf, liste);
      rechts = el('div', { class: 'rechts' }, menue);
    } else {
      const zurueck = encodeURIComponent(location.pathname + location.search);
      rechts = el('div', { class: 'rechts' }, el('a', { class: 'btn primaer', href: `/login.html?zurueck=${zurueck}`, text: 'Anmelden' }));
    }
    kopf.className = 'kopf';
    kopf.replaceChildren(el('div', { class: 'wrap' }, marke, nav, rechts));
  }

  async function abmelden() {
    try {
      await api('/api/logout', { methode: 'POST' });
    } finally {
      location.href = '/';
    }
  }

  function passwortDialog() {
    const fehler = el('p', { class: 'fehlermeldung' });
    const alt = el('input', { type: 'password', autocomplete: 'current-password', required: true });
    const neu = el('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '6' });
    const neu2 = el('input', { type: 'password', autocomplete: 'new-password', required: true });
    const dlg = el(
      'dialog',
      {},
      el(
        'form',
        { method: 'dialog' },
        el('h2', { text: 'Passwort ändern' }),
        el('label', { class: 'feld' }, el('span', { text: 'Bisheriges Passwort' }), alt),
        el('label', { class: 'feld' }, el('span', { text: 'Neues Passwort' }), neu),
        el('label', { class: 'feld' }, el('span', { text: 'Neues Passwort wiederholen' }), neu2),
        fehler,
        el(
          'div',
          { class: 'knopfreihe' },
          el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => dlg.close() }),
          el('button', { class: 'btn primaer', type: 'submit', text: 'Speichern' })
        )
      )
    );
    dlg.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (neu.value !== neu2.value) {
        fehler.textContent = 'Die neuen Passwörter stimmen nicht überein.';
        return;
      }
      try {
        await api('/api/passwort', { methode: 'POST', daten: { alt: alt.value, neu: neu.value } });
        dlg.close();
        toast('Passwort geändert.', 'erfolg');
      } catch (err) {
        fehler.textContent = err.message;
      }
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function fusszeile() {
    if ($('.fussleiste')) return;
    document.body.append(
      el(
        'footer',
        { class: 'fussleiste' },
        el('div', { class: 'wrap', text: `${(status && status.seitenname) || 'Freistunden.exe'} · ${(status && status.untertitel) || ''}` })
      )
    );
  }

  // Lädt den Status, baut Kopf- und Fußzeile.
  async function start(aktiv) {
    try {
      status = await api('/api/status');
    } catch (e) {
      status = { seitenname: 'Freistunden.exe', untertitel: '', eingerichtet: true, ich: null };
      toast(e.message, 'fehler');
    }
    kopfzeile(aktiv);
    fusszeile();
    wellenAktivieren();
    return status;
  }

  return {
    api, el, $, $$, zahl, datum, medaille, tag, param, platzhalter, coverBild, initialen, toast, start,
    get status() { return status; },
  };
})();
