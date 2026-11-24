'use strict';
(async () => {
  const { el, $, $$, zahl, datum, medaille, api, toast } = IO;
  const status = await IO.start('admin');
  if (!status.ich || status.ich.rolle !== 'admin') {
    location.href = `/login.html?zurueck=${encodeURIComponent('/admin.html')}`;
    return;
  }

  let benutzer = [];
  let gruppen = [];
  let spiele = [];
  const auswahl = new Set();
  let neueZugaenge = [];

  const gruppenName = (id) => (gruppen.find((g) => g.id === id) || {}).name || '?';

  // ---------- Reiter ----------
  const REITER = ['konten', 'gruppen', 'spiele', 'punkte'];
  function zeigeReiter(id) {
    if (!REITER.includes(id)) id = 'konten';
    for (const b of $$('.reiter button')) b.setAttribute('aria-selected', String(b.dataset.reiter === id));
    for (const p of $$('.panel')) p.hidden = p.id !== `p-${id}`;
    history.replaceState(null, '', `#${id}`);
    if (id === 'punkte') punkteLaden();
  }
  for (const b of $$('.reiter button')) b.addEventListener('click', () => zeigeReiter(b.dataset.reiter));

  // ---------- Daten laden ----------
  async function laden() {
    try {
      [benutzer, gruppen, spiele] = await Promise.all([api('/api/admin/benutzer'), api('/api/admin/gruppen'), api('/api/spiele')]);
    } catch (e) {
      toast(e.message, 'fehler');
    }
    for (const id of [...auswahl]) if (!benutzer.some((b) => b.id === id)) auswahl.delete(id);
    gruppenwahlenZeichnen();
    gruppenSelectsZeichnen();
    kontenZeichnen();
    gruppenZeichnen();
    spieleZeichnen();
  }

  // ---------- Gruppen-Auswahl (Checkboxen) ----------
  function gruppenwahlFuellen(box, ausgewaehlt = []) {
    box.replaceChildren();
    if (!gruppen.length) {
      box.append(el('span', { class: 'leer-hinweis', text: 'Noch keine Gruppen – im Reiter „Gruppen“ anlegen.' }));
      return;
    }
    for (const g of gruppen) {
      box.append(el('label', { class: 'check' }, el('input', { type: 'checkbox', value: g.id, checked: ausgewaehlt.includes(g.id) }), g.name));
    }
  }
  const gewaehlteGruppen = (box) => $$('input:checked', box).map((i) => Number(i.value));

  function gruppenwahlenZeichnen() {
    for (const box of [$('#einzelGruppen'), $('#listeGruppen')]) gruppenwahlFuellen(box, gewaehlteGruppen(box));
  }

  function selectFuellen(select, erste, behalten = true) {
    const alt = select.value;
    select.replaceChildren(...erste.map(([v, t]) => el('option', { value: v, text: t })), ...gruppen.map((g) => el('option', { value: g.id, text: g.name })));
    if (behalten && [...select.options].some((o) => o.value === alt)) select.value = alt;
  }

  function gruppenSelectsZeichnen() {
    selectFuellen($('#kontoFilter'), [['', 'Alle Gruppen'], ['ohne', 'Ohne Gruppe']]);
    selectFuellen($('#sammelGruppe'), gruppen.length ? [] : [['', '– keine Gruppe –']]);
    selectFuellen($('#punkteGruppe'), [['', 'Alle Gruppen']]);
    sammelleisteAktualisieren();
  }

  // ---------- Fehleranzeige in Formularen ----------
  const formFehler = (form, text) => {
    const p = form.querySelector('[data-fehler]');
    if (p) p.textContent = text || '';
  };

  // ---------- Neue Zugangsdaten ----------
  function zugaengeZeichnen() {
    const bereich = $('#druckbereich');
    bereich.hidden = neueZugaenge.length === 0;
    $('#zugangsTabelle').replaceChildren(
      el('thead', {}, el('tr', {}, el('th', { text: 'Name' }), el('th', { text: 'Benutzername' }), el('th', { text: 'Passwort' }), el('th', { text: 'Gruppen' }))),
      el(
        'tbody',
        {},
        neueZugaenge.map((z) => {
          const b = benutzer.find((x) => x.id === z.id);
          return el(
            'tr',
            {},
            el('td', { text: z.anzeigename }),
            el('td', {}, el('code', { text: z.benutzername })),
            el('td', {}, el('code', { text: z.passwort })),
            el('td', { class: 'klein-text', text: b ? b.gruppen.map(gruppenName).join(', ') : '' })
          );
        })
      )
    );
  }
  $('#drucken').addEventListener('click', () => window.print());
  $('#zugaengeLeeren').addEventListener('click', () => {
    if (!confirm('Zugangsdaten ausblenden? Die Passwörter können danach nicht mehr angezeigt werden (nur neu erzeugt).')) return;
    neueZugaenge = [];
    zugaengeZeichnen();
  });

  // ---------- Konto anlegen ----------
  $('#einzelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    formFehler(f, '');
    try {
      const r = await api('/api/admin/benutzer', {
        methode: 'POST',
        daten: {
          anzeigename: f.elements.anzeigename.value,
          benutzername: f.elements.benutzername.value,
          passwort: f.elements.passwort.value,
          gruppen: gewaehlteGruppen($('#einzelGruppen')),
        },
      });
      f.elements.anzeigename.value = '';
      f.elements.benutzername.value = '';
      f.elements.passwort.value = '';
      neueZugaenge.unshift(r);
      await laden();
      zugaengeZeichnen();
      toast(`Konto „${r.anzeigename}“ angelegt.`, 'erfolg');
      f.elements.anzeigename.focus();
    } catch (err) {
      formFehler(f, err.message);
    }
  });

  $('#listeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    formFehler(f, '');
    try {
      const r = await api('/api/admin/benutzer/liste', {
        methode: 'POST',
        daten: { namen: f.elements.namen.value, abkuerzen: f.elements.abkuerzen.checked, gruppen: gewaehlteGruppen($('#listeGruppen')) },
      });
      f.elements.namen.value = '';
      neueZugaenge = [...r, ...neueZugaenge];
      await laden();
      zugaengeZeichnen();
      toast(`${r.length} Konten angelegt.`, 'erfolg');
      $('#druckbereich').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      formFehler(f, err.message);
    }
  });

  // ---------- Kontenliste ----------
  function gefilterteKonten() {
    const q = $('#kontoSuche').value.trim().toLowerCase();
    const filter = $('#kontoFilter').value;
    return benutzer.filter((b) => {
      if (q && !`${b.anzeigename} ${b.benutzername}`.toLowerCase().includes(q)) return false;
      if (filter === 'ohne') return b.gruppen.length === 0;
      if (filter) return b.gruppen.includes(Number(filter));
      return true;
    });
  }

  function sammelleisteAktualisieren() {
    $('#auswahlZahl').textContent = `${auswahl.size} ausgewählt`;
    const aus = auswahl.size === 0 || !$('#sammelGruppe').value;
    $('#sammelHinzu').disabled = aus;
    $('#sammelWeg').disabled = aus;
  }

  function kontenZeichnen() {
    const liste = gefilterteKonten();
    const waehlbar = liste.filter((b) => b.rolle !== 'admin');
    const alleAn = waehlbar.length > 0 && waehlbar.every((b) => auswahl.has(b.id));
    const kopfCheck = el('input', {
      type: 'checkbox',
      checked: alleAn,
      'aria-label': 'Alle auswählen',
      onchange: (e) => {
        for (const b of waehlbar) e.target.checked ? auswahl.add(b.id) : auswahl.delete(b.id);
        kontenZeichnen();
      },
    });

    const zeilen = liste.map((b) => {
      const check =
        b.rolle === 'admin'
          ? ''
          : el('input', {
              type: 'checkbox',
              checked: auswahl.has(b.id),
              'aria-label': `${b.anzeigename} auswählen`,
              onchange: (e) => {
                e.target.checked ? auswahl.add(b.id) : auswahl.delete(b.id);
                sammelleisteAktualisieren();
              },
            });
      const aktionen =
        b.rolle === 'admin'
          ? el('td', { class: 'aktionen' }, el('button', { class: 'btn klein', type: 'button', text: 'Bearbeiten', onclick: () => bearbeiten(b) }))
          : el(
              'td',
              { class: 'aktionen' },
              el('button', { class: 'btn klein', type: 'button', text: 'Bearbeiten', onclick: () => bearbeiten(b) }),
              el('button', { class: 'btn klein', type: 'button', text: 'Neues Passwort', onclick: () => passwortNeu(b) }),
              el('button', { class: 'btn klein gefahr', type: 'button', text: 'Löschen', onclick: () => loeschen(b) })
            );
      return el(
        'tr',
        {},
        el('td', { style: { width: '32px' } }, check),
        el('td', {}, b.anzeigename, b.rolle === 'admin' ? [' ', el('span', { class: 'tag akzent', text: 'Admin' })] : null),
        el('td', {}, el('code', { text: b.benutzername })),
        el('td', {}, b.gruppen.length ? b.gruppen.map((g) => [IO.tag(gruppenName(g)), ' ']) : el('span', { class: 'muted klein-text', text: '–' })),
        el('td', { class: 'zahl', text: zahl(b.punkte) }),
        aktionen
      );
    });

    $('#kontoTabelle').replaceChildren(
      el(
        'thead',
        {},
        el('tr', {}, el('th', {}, kopfCheck), el('th', { text: 'Name' }), el('th', { text: 'Benutzername' }), el('th', { text: 'Gruppen' }), el('th', { class: 'zahl', text: 'Einträge' }), el('th', {}))
      ),
      el('tbody', {}, zeilen.length ? zeilen : el('tr', {}, el('td', { colspan: '6', class: 'muted', text: 'Keine Konten gefunden.' })))
    );
    sammelleisteAktualisieren();
  }

  $('#kontoSuche').addEventListener('input', kontenZeichnen);
  $('#kontoFilter').addEventListener('change', kontenZeichnen);
  $('#sammelGruppe').addEventListener('change', sammelleisteAktualisieren);

  async function sammelAktion(art) {
    const gid = Number($('#sammelGruppe').value);
    if (!gid || !auswahl.size) return;
    try {
      const r = await api(`/api/admin/gruppen/${gid}/${art}`, { methode: 'POST', daten: { benutzer: [...auswahl] } });
      const anzahl = r.geaendert === 1 ? '1 Konto' : `${r.geaendert} Konten`;
      toast(
        art === 'hinzufuegen' ? `${anzahl} zu „${gruppenName(gid)}“ hinzugefügt.` : `${anzahl} aus „${gruppenName(gid)}“ entfernt.`,
        'erfolg'
      );
      await laden();
    } catch (e) {
      toast(e.message, 'fehler');
    }
  }
  $('#sammelHinzu').addEventListener('click', () => sammelAktion('hinzufuegen'));
  $('#sammelWeg').addEventListener('click', () => sammelAktion('entfernen'));

  // ---------- Konto bearbeiten ----------
  function bearbeiten(b) {
    const anzeigename = el('input', { type: 'text', value: b.anzeigename, required: true });
    const benutzername = el('input', { type: 'text', value: b.benutzername, required: true, autocapitalize: 'none', spellcheck: 'false' });
    const wahl = el('div', { class: 'gruppenwahl' });
    gruppenwahlFuellen(wahl, b.gruppen);
    const fehler = el('p', { class: 'fehlermeldung' });
    const dlg = el(
      'dialog',
      {},
      el(
        'form',
        { method: 'dialog' },
        el('h2', { text: 'Konto bearbeiten' }),
        el('label', { class: 'feld' }, el('span', { text: 'Anzeigename' }), anzeigename),
        el('label', { class: 'feld' }, el('span', { text: 'Benutzername' }), benutzername),
        el('div', { class: 'feld' }, el('span', { class: 'klein-text', style: { fontWeight: '600', display: 'block', marginBottom: '5px' }, text: 'Gruppen' }), wahl),
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
      try {
        await api(`/api/admin/benutzer/${b.id}`, { methode: 'PATCH', daten: { anzeigename: anzeigename.value, benutzername: benutzername.value } });
        await api(`/api/admin/benutzer/${b.id}/gruppen`, { methode: 'PUT', daten: { gruppen: gewaehlteGruppen(wahl) } });
        dlg.close();
        toast('Gespeichert.', 'erfolg');
        await laden();
      } catch (err) {
        fehler.textContent = err.message;
      }
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  async function passwortNeu(b) {
    if (!confirm(`Für „${b.anzeigename}“ ein neues Passwort erzeugen? Das alte gilt dann nicht mehr.`)) return;
    try {
      const r = await api(`/api/admin/benutzer/${b.id}/passwort`, { methode: 'POST' });
      neueZugaenge.unshift({ id: b.id, ...r });
      zugaengeZeichnen();
      toast('Neues Passwort erzeugt – siehe „Neue Zugangsdaten“.', 'erfolg');
      $('#druckbereich').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      toast(e.message, 'fehler');
    }
  }

  async function loeschen(b) {
    if (!confirm(`Konto „${b.anzeigename}“ wirklich löschen?\nAlle Punkte dieses Kontos werden ebenfalls gelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await api(`/api/admin/benutzer/${b.id}`, { methode: 'DELETE' });
      auswahl.delete(b.id);
      neueZugaenge = neueZugaenge.filter((z) => z.id !== b.id);
      zugaengeZeichnen();
      toast('Konto gelöscht.');
      await laden();
    } catch (e) {
      toast(e.message, 'fehler');
    }
  }

  // ---------- Gruppen ----------
  $('#gruppeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    formFehler(f, '');
    try {
      const r = await api('/api/admin/gruppen', { methode: 'POST', daten: { name: f.elements.name.value } });
      f.elements.name.value = '';
      toast(`Gruppe „${r.name}“ angelegt.`, 'erfolg');
      await laden();
    } catch (err) {
      formFehler(f, err.message);
    }
  });

  function gruppenZeichnen() {
    const zeilen = gruppen.map((g) =>
      el(
        'tr',
        {},
        el('td', { text: g.name }),
        el('td', { class: 'zahl', text: zahl(g.mitglieder) }),
        el('td', { class: 'datum', text: datum(g.erstellt_am, false) }),
        el(
          'td',
          { class: 'aktionen' },
          el('button', {
            class: 'btn klein',
            type: 'button',
            text: 'Mitglieder',
            onclick: () => {
              $('#kontoFilter').value = String(g.id);
              kontenZeichnen();
              zeigeReiter('konten');
            },
          }),
          el('button', { class: 'btn klein', type: 'button', text: 'Umbenennen', onclick: () => gruppeUmbenennen(g) }),
          el('button', { class: 'btn klein gefahr', type: 'button', text: 'Löschen', onclick: () => gruppeLoeschen(g) })
        )
      )
    );
    $('#gruppenTabelle').replaceChildren(
      el('thead', {}, el('tr', {}, el('th', { text: 'Name' }), el('th', { class: 'zahl', text: 'Mitglieder' }), el('th', { class: 'datum', text: 'Angelegt' }), el('th', {}))),
      el('tbody', {}, zeilen.length ? zeilen : el('tr', {}, el('td', { colspan: '4', class: 'muted', text: 'Noch keine Gruppen.' })))
    );
  }

  async function gruppeUmbenennen(g) {
    const name = prompt('Neuer Name der Gruppe:', g.name);
    if (!name || name.trim() === g.name) return;
    try {
      await api(`/api/admin/gruppen/${g.id}`, { methode: 'PATCH', daten: { name } });
      await laden();
    } catch (e) {
      toast(e.message, 'fehler');
    }
  }

  async function gruppeLoeschen(g) {
    if (!confirm(`Gruppe „${g.name}“ löschen?\nDie Konten bleiben erhalten, sie sind danach nur nicht mehr in dieser Gruppe.`)) return;
    try {
      await api(`/api/admin/gruppen/${g.id}`, { methode: 'DELETE' });
      toast('Gruppe gelöscht.');
      await laden();
    } catch (e) {
      toast(e.message, 'fehler');
    }
  }

  // ---------- Spiele ----------
  function spieleZeichnen() {
    const zeilen = spiele.map((s) => {
      const schalter = el('input', {
        type: 'checkbox',
        checked: s.sichtbar,
        'aria-label': `${s.titel} sichtbar`,
        onchange: async (e) => {
          try {
            await api(`/api/admin/spiele/${encodeURIComponent(s.kurzname)}/sichtbar`, { methode: 'POST', daten: { sichtbar: e.target.checked } });
            s.sichtbar = e.target.checked;
            toast(s.sichtbar ? `„${s.titel}“ ist jetzt sichtbar.` : `„${s.titel}“ ist ausgeblendet.`);
          } catch (err) {
            e.target.checked = !e.target.checked;
            toast(err.message, 'fehler');
          }
        },
      });
      return el(
        'tr',
        {},
        el('td', { style: { width: '76px' } }, el('div', { class: 'daumen' }, IO.coverBild(s))),
        el('td', {}, el('strong', { text: s.titel }), el('div', { class: 'muted klein-text' }, `spiele/${s.kurzname}/`)),
        el('td', { class: 'klein-text', text: s.autor || '–' }),
        el('td', { class: 'zahl', text: zahl(s.eintraege) }),
        el('td', {}, el('label', { class: 'schalter', title: 'Sichtbar' }, schalter, el('span'))),
        el('td', { class: 'aktionen' }, el('a', { class: 'btn klein', href: `/spiel.html?s=${encodeURIComponent(s.kurzname)}`, text: 'Öffnen' }))
      );
    });
    $('#spieleTabelle').replaceChildren(
      el(
        'thead',
        {},
        el('tr', {}, el('th', {}), el('th', { text: 'Spiel' }), el('th', { text: 'Autor' }), el('th', { class: 'zahl', text: 'Einträge' }), el('th', { text: 'Sichtbar' }), el('th', {}))
      ),
      el('tbody', {}, zeilen.length ? zeilen : el('tr', {}, el('td', { colspan: '6', class: 'muted', text: 'Noch keine Spiele im Ordner „spiele“.' })))
    );

    const wahl = $('#punkteSpiel');
    const alt = wahl.value;
    wahl.replaceChildren(...spiele.map((s) => el('option', { value: s.kurzname, text: s.titel })));
    if (spiele.some((s) => s.kurzname === alt)) wahl.value = alt;
  }
  $('#spieleNeu').addEventListener('click', async () => {
    await laden();
    toast('Spieleliste neu geladen.');
  });

  // ---------- Punkte ----------
  async function punkteLaden() {
    const tabelle = $('#punkteTabelle');
    const k = $('#punkteSpiel').value;
    if (!k) {
      tabelle.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'muted', text: 'Noch keine Spiele vorhanden.' }))));
      return;
    }
    const g = $('#punkteGruppe').value ? `&gruppe=${$('#punkteGruppe').value}` : '';
    try {
      const r = await api(`/api/statistik/${encodeURIComponent(k)}?limit=1000${g}`);
      const zeilen = r.eintraege.map((e) =>
        el(
          'tr',
          {},
          el('td', { class: 'platz' }, medaille(e.platz)),
          el('td', {}, e.name, el('div', { class: 'muted klein-text', text: `@${e.benutzername}` })),
          el('td', { class: 'zahl', text: zahl(e.punktzahl) }),
          el('td', { class: 'datum', text: datum(e.erspielt_am) }),
          el(
            'td',
            { class: 'aktionen' },
            el('button', {
              class: 'btn klein gefahr',
              type: 'button',
              text: 'Löschen',
              onclick: async () => {
                if (!confirm(`Eintrag von „${e.name}“ mit ${zahl(e.punktzahl)} Punkten löschen?`)) return;
                try {
                  await api(`/api/admin/punkte/${e.id}`, { methode: 'DELETE' });
                  toast('Eintrag gelöscht.');
                  punkteLaden();
                } catch (err) {
                  toast(err.message, 'fehler');
                }
              },
            })
          )
        )
      );
      tabelle.replaceChildren(
        el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Name' }), el('th', { class: 'zahl', text: 'Punkte' }), el('th', { class: 'datum', text: 'Datum' }), el('th', {}))),
        el('tbody', {}, zeilen.length ? zeilen : el('tr', {}, el('td', { colspan: '5', class: 'muted', text: 'Keine Einträge.' })))
      );
    } catch (e) {
      tabelle.replaceChildren(el('tbody', {}, el('tr', {}, el('td', { class: 'fehlermeldung', text: e.message }))));
    }
  }
  $('#punkteSpiel').addEventListener('change', punkteLaden);
  $('#punkteGruppe').addEventListener('change', punkteLaden);

  // ---------- Los geht's ----------
  window.addEventListener('beforeunload', (e) => {
    if (neueZugaenge.length) e.preventDefault();
  });
  await laden();
  zeigeReiter(location.hash.slice(1));
})();
