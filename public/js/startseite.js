'use strict';
(async () => {
  const { el, $, zahl, coverBild } = IO;
  const status = await IO.start('spiele');
  if (!status.eingerichtet) {
    location.href = '/einrichten.html';
    return;
  }
  document.title = status.seitenname;

  let spiele = [];
  let aktiverTag = null;

  try {
    spiele = await IO.api('/api/spiele');
  } catch (e) {
    IO.toast(e.message, 'fehler');
  }

  const suche = $('#suche');
  const sortierung = $('#sortierung');

  function tagsZeichnen() {
    const alle = [...new Set(spiele.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b, 'de'));
    const box = $('#tags');
    box.replaceChildren();
    if (!alle.length) return;
    const chip = (name, wert) =>
      el('button', {
        class: 'chip',
        type: 'button',
        text: name,
        'aria-pressed': String(aktiverTag === wert),
        onclick: () => {
          aktiverTag = wert;
          tagsZeichnen();
          rasterZeichnen();
        },
      });
    box.append(chip('Alle', null), ...alle.map((t) => chip(t, t)));
  }

  // ---------- Dashboard-Kopf ----------
  const IKONEN = {
    spiele: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="6"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>',
    runden: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 13 4 4 8-9"/><path d="m11 16 1 1 9-10"/></svg>',
    rekord: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  };

  function kopfZeichnen() {
    const ich = status.ich;
    const n = spiele.length;
    const text = n === 1 ? '1 Spiel' : `${n} Spiele`;
    $('#anzahl').textContent = ich ? `Hallo ${ich.anzeigename}! ${text} ${n === 1 ? 'wartet' : 'warten'} auf dich.` :`${text} aus dem IO-Unterricht – melde dich an, um Punkte zu sammeln.`;

    const runden = spiele.reduce((s, x) => s + x.eintraege, 0);
    const rekord = spiele.reduce((m, x) => (x.bestwert != null && (m == null || x.bestwert > m) ? x.bestwert : m), null);
    const kennzahl = (farbe, ikon, wert, label) => {
      const i = el('div', { class: `ikon ${farbe}` });
      i.innerHTML = IKONEN[ikon];
      return el('div', { class: 'kennzahl' }, i, el('strong', { text: wert }), el('span', { text: label }));
    };
    $('#kennzahlen').replaceChildren(
      kennzahl('lime', 'spiele', zahl(n), 'Spiele'),
      kennzahl('cyan', 'runden', zahl(runden), 'Gespielte Runden'),
      kennzahl('amber', 'rekord', rekord == null ? '–' : zahl(rekord), 'Höchster Rekord')
    );

    // Farbbalken: Anteil der meistgespielten Spiele
    const FARBEN = ['var(--lime)', 'var(--cyan)', 'var(--amber)', 'rgba(255,255,255,.35)'];
    const box = $('#segmente');
    if (!runden) {
      box.replaceChildren(el('div', { class: 'seg', style: { '--c': 'rgba(255,255,255,.14)' } }, el('i'), el('small', { text: 'Noch keine Runden gespielt' })));
      return;
    }
    const sortiert = [...spiele].filter((s) => s.eintraege > 0).sort((a, b) => b.eintraege - a.eintraege);
    const teile = sortiert.slice(0, 3).map((s) => ({ name: s.titel, wert: s.eintraege }));
    const rest = sortiert.slice(3).reduce((s, x) => s + x.eintraege, 0);
    if (rest) teile.push({ name: 'Andere', wert: rest });
    box.replaceChildren(
      ...teile.map((t, i) =>
        el(
          'div',
          { class: 'seg', style: { '--w': t.wert, '--c': FARBEN[i], '--i': i }, title: `${t.name}: ${zahl(t.wert)} Runden` },
          el('i'),
          el('small', { text: `${Math.round((t.wert / runden) * 100)}% · ${t.name}` })
        )
      )
    );
  }

  function karte(s, index) {
    const fuss = [];
    if (s.bestwert != null) fuss.push(el('span', { class: 'rekord', text: `🏆 ${zahl(s.bestwert)}`, title: 'Höchste Punktzahl' }));
    for (const t of s.tags.slice(0, 3)) fuss.push(IO.tag(t));
    return el(
      'a',
      { class: 'spielkarte erscheinen', style: { '--i': Math.min(index, 12) }, href: `/spiel.html?s=${encodeURIComponent(s.kurzname)}` },
      el('div', { class: 'cover' }, coverBild(s), s.sichtbar ? null : el('span', { class: 'ausgeblendet', text: 'Ausgeblendet' })),
      el('div', { class: 'titel', text: s.titel }),
      s.autor ? el('div', { class: 'autor', text: `von ${s.autor}` }) : null,
      s.kurzbeschreibung ? el('div', { class: 'text', text: s.kurzbeschreibung }) : null,
      fuss.length ? el('div', { class: 'fuss' }, fuss) : null
    );
  }

  function rasterZeichnen() {
    const q = suche.value.trim().toLowerCase();
    let liste = spiele.filter((s) => {
      if (aktiverTag && !s.tags.includes(aktiverTag)) return false;
      if (!q) return true;
      return [s.titel, s.autor, s.kurzbeschreibung, ...s.tags].join(' ').toLowerCase().includes(q);
    });
    if (sortierung.value === 'az') liste = [...liste].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
    if (sortierung.value === 'beliebt') liste = [...liste].sort((a, b) => b.eintraege - a.eintraege);

    $('#raster').replaceChildren(...liste.map(karte));
    const leer = $('#leer');
    leer.hidden = liste.length > 0;
    leer.textContent = spiele.length
      ? 'Kein Spiel passt zu deiner Suche.'
      : 'Noch keine Spiele vorhanden. Neue Spiele kommen in den Ordner „spiele“ (siehe SPIELE_EINFUEGEN.md).';
  }

  suche.addEventListener('input', rasterZeichnen);
  sortierung.addEventListener('change', rasterZeichnen);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== suche) {
      e.preventDefault();
      suche.focus();
    }
  });

  kopfZeichnen();
  tagsZeichnen();
  rasterZeichnen();
})();
