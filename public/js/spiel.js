'use strict';
(async () => {
  const { el, $, zahl, datum, medaille } = IO;
  const status = await IO.start('spiele');
  const ich = status.ich;
  const kurzname = IO.param('s') || '';

  let spiel;
  try {
    spiel = await IO.api(`/api/spiele/${encodeURIComponent(kurzname)}`);
  } catch {
    $('#inhalt').hidden = true;
    $('#nichtGefunden').hidden = false;
    return;
  }

  document.title = `${spiel.titel} · ${status.seitenname}`;
  $('#titel').textContent = spiel.titel;

  // ---------- Kopf & Infos ----------
  const meta = $('#meta');
  if (spiel.autor) meta.append(el('span', { text: `von ${spiel.autor}` }));
  for (const t of spiel.tags) meta.append(IO.tag(t));
  if (!spiel.sichtbar) meta.append(el('span', { class: 'tag akzent', text: 'Ausgeblendet' }));

  if (spiel.beschreibung) {
    $('#beschreibung').textContent = spiel.beschreibung;
    $('#beschreibungBox').hidden = false;
  }
  if (spiel.steuerung) {
    $('#steuerung').textContent = spiel.steuerung;
    $('#steuerungBox').hidden = false;
  }
  const infos = $('#infos');
  const info = (k, v) => v && infos.append(el('dt', { text: k }), el('dd', { text: v }));
  info('Autor', spiel.autor);
  info('Veröffentlicht', spiel.datum ? datum(spiel.datum, false) : '');
  info('Tags', spiel.tags.join(', '));
  info('Einträge', spiel.eintraege ? `${zahl(spiel.eintraege)} von ${zahl(spiel.spieler)} Spieler(n)` : 'Noch keine');

  if (!ich) {
    $('#gastHinweis').hidden = false;
    $('#gastLogin').href = `/login.html?zurueck=${encodeURIComponent(location.pathname + location.search)}`;
  }

  // ---------- Spiel einbetten ----------
  const rahmen = $('#rahmen');
  rahmen.style.setProperty('--b', spiel.breite);
  rahmen.style.setProperty('--h', spiel.hoehe);
  let frame = null;

  // Spielstände des Spiels (localStorage im Spiel) werden pro Konto hier gespeichert.
  const SPEICHER_SCHLUESSEL = `io-spiel:${spiel.kurzname}:${ich ? ich.id : 'gast'}`;
  function speicherLesen() {
    try {
      return JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) || '{}') || {};
    } catch {
      return {};
    }
  }

  function startbild() {
    const knopf = el('button', { class: 'btn primaer gross', type: 'button', text: '▶ Spielen' });
    const bild = el(
      'div',
      { class: 'startbild', onclick: spielStarten },
      spiel.cover ? el('div', { class: 'hintergrund', style: { backgroundImage: `url("${spiel.cover}")` } }) : IO.platzhalter(spiel.titel),
      knopf
    );
    rahmen.replaceChildren(bild);
    $('#neustart').hidden = true;
  }

  // "Zuletzt gespielt" merken: angemeldet auf dem Server, sonst im Browser
  function spielMerken() {
    if (ich) {
      IO.api('/api/gespielt', { methode: 'POST', daten: { spiel: spiel.kurzname } }).catch(() => {});
      return;
    }
    try {
      const liste = JSON.parse(localStorage.getItem('io-zuletzt') || '[]').filter((e) => e && e.spiel !== spiel.kurzname);
      liste.unshift({ spiel: spiel.kurzname, zuletzt: new Date().toISOString() });
      localStorage.setItem('io-zuletzt', JSON.stringify(liste.slice(0, 30)));
    } catch {
      /* Speicher gesperrt – egal */
    }
  }

  function spielStarten() {
    spielMerken();
    frame = el('iframe', {
      src: `/spiele/${encodeURIComponent(spiel.kurzname)}/index.html`,
      title: spiel.titel,
      sandbox: 'allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads allow-orientation-lock',
      allow: 'fullscreen; autoplay; gamepad; accelerometer; gyroscope',
    });
    // Startdaten für das Launcher-SDK im Spiel (Spielername + gespeicherte Spielstände)
    frame.name = 'io-launcher:' + JSON.stringify({ spieler: ich ? ich.anzeigename : null, speicher: speicherLesen() });
    frame.addEventListener('load', () => frame.focus());
    rahmen.replaceChildren(frame);
    $('#neustart').hidden = false;
  }

  $('#neustart').addEventListener('click', spielStarten);
  $('#vollbild').addEventListener('click', () => {
    if (!frame) spielStarten();
    if (document.fullscreenElement) document.exitFullscreen();
    else if (rahmen.requestFullscreen) rahmen.requestFullscreen().catch(() => IO.toast('Vollbild ist hier nicht möglich.', 'fehler'));
  });

  // ---------- Nachrichten vom Spiel (Launcher-SDK) ----------
  window.addEventListener('message', async (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || d.io !== 'launcher') return;

    if (d.typ === 'speicher' && d.daten && typeof d.daten === 'object') {
      try {
        const json = JSON.stringify(d.daten);
        if (json.length < 512 * 1024) localStorage.setItem(SPEICHER_SCHLUESSEL, json);
      } catch {
        /* Speicher voll oder gesperrt – egal */
      }
      return;
    }

    if (d.typ === 'punkte') {
      const antworten = (ergebnis) => {
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ io: 'launcher', typ: 'punkte-ergebnis', id: d.id, ergebnis }, '*');
      };
      if (!ich) {
        IO.toast(`${zahl(d.punkte)} Punkte – nicht gespeichert (nicht angemeldet).`);
        antworten({ gespeichert: false, grund: 'nicht angemeldet' });
        return;
      }
      try {
        const r = await IO.api('/api/punkte', { methode: 'POST', daten: { spiel: spiel.kurzname, punktzahl: d.punkte } });
        IO.toast(`${zahl(r.punktzahl)} Punkte gespeichert – Platz ${r.platz}!`, 'erfolg');
        antworten({ gespeichert: true, platz: r.platz, punktzahl: r.punktzahl });
        ranglisteLaden();
      } catch (err) {
        IO.toast(err.message, 'fehler');
        antworten({ gespeichert: false, grund: err.message });
      }
    }
  });

  // ---------- Rangliste ----------
  const gruppeWahl = $('#gruppe');
  $('#alleLink').href = `/statistik.html#${encodeURIComponent(spiel.kurzname)}`;

  async function gruppenLaden() {
    if (!ich) return;
    try {
      const gruppen = await IO.api('/api/gruppen');
      if (!gruppen.length) return;
      gruppeWahl.append(el('option', { value: '', text: 'Alle' }), ...gruppen.map((g) => el('option', { value: g.id, text: g.name })));
      gruppeWahl.hidden = false;
      gruppeWahl.addEventListener('change', ranglisteLaden);
    } catch {
      /* ohne Gruppenfilter weiter */
    }
  }

  async function ranglisteLaden() {
    const box = $('#tabelle');
    if (!ich) {
      box.replaceChildren(el('p', { class: 'muted klein-text', text: 'Melde dich an, um die Rangliste zu sehen und Punkte zu sammeln.' }));
      return;
    }
    try {
      const g = gruppeWahl.value ? `&gruppe=${gruppeWahl.value}` : '';
      const r = await IO.api(`/api/statistik/${encodeURIComponent(spiel.kurzname)}?limit=20${g}`);
      if (!r.eintraege.length) {
        box.replaceChildren(el('p', { class: 'muted klein-text', text: 'Noch keine Punkte. Sei die oder der Erste!' }));
        return;
      }
      box.replaceChildren(ranglistenTabelle(r.eintraege));
    } catch (err) {
      box.replaceChildren(el('p', { class: 'fehlermeldung', text: err.message }));
    }
  }

  function ranglistenTabelle(eintraege) {
    return el(
      'table',
      { class: 'tabelle' },
      el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Name' }), el('th', { class: 'zahl', text: 'Punkte' }), el('th', { class: 'datum', text: 'Datum' }))),
      el(
        'tbody',
        {},
        eintraege.map((e) =>
          el(
            'tr',
            { class: e.eigen ? 'eigen' : null },
            el('td', { class: 'platz' }, medaille(e.platz)),
            el('td', { text: e.name }),
            el('td', { class: 'zahl', text: zahl(e.punktzahl) }),
            el('td', { class: 'datum', text: datum(e.erspielt_am) })
          )
        )
      )
    );
  }

  // Aus dem Regal auf dem Homebildschirm kommend: Spiel sofort starten
  if (IO.param('start') === '1') {
    spielStarten();
    history.replaceState(null, '', `/spiel.html?s=${encodeURIComponent(spiel.kurzname)}`);
  } else startbild();
  await gruppenLaden();
  ranglisteLaden();
})();
