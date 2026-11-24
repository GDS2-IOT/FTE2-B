'use strict';
(async () => {
  const { el, $, zahl, datum, medaille } = IO;
  const status = await IO.start('statistik');
  const leer = $('#leer');

  if (!status.ich) {
    leer.hidden = false;
    leer.replaceChildren(
      'Die Statistik ist nur für angemeldete Spieler sichtbar. ',
      el('a', { href: `/login.html?zurueck=${encodeURIComponent('/statistik.html')}`, text: 'Jetzt anmelden' })
    );
    return;
  }

  const gruppeWahl = $('#gruppe');
  let spiele = [];
  try {
    const [s, gruppen] = await Promise.all([IO.api('/api/spiele'), IO.api('/api/gruppen')]);
    spiele = s;
    if (gruppen.length) {
      gruppeWahl.append(el('option', { value: '', text: 'Alle Gruppen' }), ...gruppen.map((g) => el('option', { value: g.id, text: g.name })));
      gruppeWahl.hidden = false;
    }
  } catch (e) {
    IO.toast(e.message, 'fehler');
  }

  const GROSS = 500;
  const KLEIN = 10;

  function tabelle(eintraege) {
    return el(
      'div',
      { class: 'tabellenrahmen' },
      el(
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
      )
    );
  }

  async function karteLaden(spiel, karte, limit) {
    const inhalt = karte.querySelector('.inhalt');
    const g = gruppeWahl.value ? `&gruppe=${gruppeWahl.value}` : '';
    try {
      const r = await IO.api(`/api/statistik/${encodeURIComponent(spiel.kurzname)}?limit=${limit}${g}`);
      if (!r.eintraege.length) {
        inhalt.replaceChildren(el('p', { class: 'muted klein-text', text: 'Noch keine Einträge.' }));
        return;
      }
      const teile = [tabelle(r.eintraege)];
      if (r.gesamt > r.eintraege.length && limit < GROSS) {
        teile.push(
          el('button', {
            class: 'btn klein',
            type: 'button',
            style: { marginTop: '10px' },
            text: `Alle ${zahl(r.gesamt)} Einträge anzeigen`,
            onclick: () => karteLaden(spiel, karte, GROSS),
          })
        );
      }
      inhalt.replaceChildren(...teile);
    } catch (e) {
      inhalt.replaceChildren(el('p', { class: 'fehlermeldung', text: e.message }));
    }
  }

  function zeichnen() {
    const liste = $('#liste');
    liste.replaceChildren();
    leer.hidden = spiele.length > 0;
    leer.textContent = 'Noch keine Spiele vorhanden.';
    for (const s of spiele) {
      const bild = s.cover ? el('img', { src: s.cover, alt: '' }) : el('span', { class: 'mini' }, IO.platzhalter(s.titel));
      const karte = el(
        'section',
        { class: 'karte', id: s.kurzname },
        el('h2', {}, bild, el('a', { href: `/spiel.html?s=${encodeURIComponent(s.kurzname)}`, text: s.titel })),
        el('div', { class: 'inhalt' }, el('p', { class: 'muted klein-text', text: 'Lädt …' }))
      );
      liste.append(karte);
      karteLaden(s, karte, location.hash === `#${s.kurzname}` ? GROSS : KLEIN);
    }
    if (location.hash) {
      const ziel = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (ziel) ziel.scrollIntoView({ block: 'start' });
    }
  }

  gruppeWahl.addEventListener('change', zeichnen);
  zeichnen();
})();
