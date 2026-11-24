'use strict';
(async () => {
  const { $, el } = IO;
  const bild = $('#szeneBild');
  const glanz = $('#szeneGlanz');
  const box = $('#szene');
  const wenigBewegung = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Szene bildschirmfüllend skalieren (wie "cover"), Pixel bleiben scharf
  function anpassen() {
    const s = Math.max(box.clientWidth / HomeSzene.W, box.clientHeight / HomeSzene.H);
    const w = `${Math.ceil(HomeSzene.W * s)}px`;
    const h = `${Math.ceil(HomeSzene.H * s)}px`;
    for (const c of [bild, glanz]) {
      c.style.width = w;
      c.style.height = h;
    }
    regalKnopfPruefen();
  }

  const szene = HomeSzene.start(bild, glanz, { bewegt: !wenigBewegung });

  // ---------- Pause ----------
  const knopf = $('#pause');
  function knopfAktualisieren() {
    knopf.textContent = szene.laeuft ? '❚❚' : '▶';
    const text = szene.laeuft ? 'Animation anhalten' : 'Animation abspielen';
    knopf.setAttribute('aria-label', text);
    knopf.title = text;
  }
  knopf.addEventListener('click', () => {
    szene.laeuft ? szene.pause() : szene.weiter();
    knopfAktualisieren();
  });
  knopfAktualisieren();

  // =============================================================
  //  Regal mit den zuletzt gespielten Spielen
  // =============================================================
  let regalSpiele = [];
  let hoverIndex = -1;
  let offen = false;
  let aktuell = null;
  let aktuellIndex = -1;
  let herkunft = null; // Bildschirm-Rechteck, aus dem die Hülle kommt

  const hash = (t) => {
    let h = 0;
    for (const c of String(t)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
  };
  const warte = (ms) => new Promise((r) => setTimeout(r, wenigBewegung ? 0 : ms));

  // Raster-Koordinaten (640×360) <-> Bildschirm
  function rasterPunkt(e) {
    const r = bild.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * HomeSzene.W, ((e.clientY - r.top) / r.height) * HomeSzene.H];
  }
  function aufBildschirm(q) {
    const r = bild.getBoundingClientRect();
    const f = r.width / HomeSzene.W;
    return { left: r.left + q.x * f, top: r.top + q.y * f, width: q.w * f, height: q.h * f };
  }

  // Auf kleinen Bildschirmen liegt das Regal außerhalb des sichtbaren Bereichs -> Ersatz-Knopf
  function regalKnopfPruefen() {
    const k = $('#regalKnopf');
    if (!regalSpiele.length) {
      k.hidden = true;
      return;
    }
    const links = aufBildschirm({ x: 507, y: 138, w: 50, h: 86 });
    k.hidden = links.left >= 0 && links.left + links.width <= innerWidth && links.top + links.height <= innerHeight;
  }

  async function regalFuellen(ich) {
    let spiele = [];
    let zuletzt = [];
    try {
      spiele = await IO.api('/api/spiele');
    } catch {
      return;
    }
    try {
      zuletzt = ich ? await IO.api('/api/zuletzt') : JSON.parse(localStorage.getItem('io-zuletzt') || '[]');
    } catch {
      zuletzt = [];
    }
    const nachName = new Map(spiele.map((s) => [s.kurzname, s]));
    const liste = [];
    for (const z of zuletzt) {
      const s = z && nachName.get(z.spiel);
      if (s && !liste.includes(s)) {
        s.zuletzt = z.zuletzt;
        liste.push(s);
      }
    }
    // Restliche Plätze mit den neuesten Spielen auffüllen
    for (const s of spiele) if (!liste.includes(s)) liste.push(s);
    regalSpiele = liste.slice(0, 10).map((s) => ({ ...s, hash: hash(s.kurzname), farbe: hash(s.titel) % 360 }));
    szene.regal.setzen(regalSpiele);
    regalKnopfPruefen();
  }

  // ---------- Darüberfahren und Klicken ----------
  const tipp = $('#regalTipp');
  function tippZeigen(i) {
    if (i < 0) {
      tipp.hidden = true;
      return;
    }
    const q = szene.regal.rechteck(i);
    const r = aufBildschirm(q);
    // oberhalb des "ZULETZT"-Schilds bzw. über dem oberen Regalboden anzeigen
    const oben = aufBildschirm({ x: 0, y: q.y - 10, w: 0, h: 0 }).top;
    tipp.textContent = regalSpiele[i].titel;
    tipp.style.left = `${r.left + r.width / 2}px`;
    tipp.style.top = `${oben}px`;
    tipp.hidden = false;
  }
  // Hinweis über dem roten Knopf
  function knopfTipp() {
    const r = aufBildschirm({ x: 524, y: 206, w: 17, h: 0 });
    tipp.textContent = szene.knopf.strand ? 'Zurück in die Stadt' : 'Ab an den Strand';
    tipp.style.left = `${r.left + r.width / 2}px`;
    tipp.style.top = `${r.top}px`;
    tipp.hidden = false;
  }

  bild.addEventListener('pointermove', (e) => {
    if (offen) return;
    const [x, y] = rasterPunkt(e);
    if (szene.knopf.treffer(x, y)) {
      if (hoverIndex !== -1) {
        hoverIndex = -1;
        szene.regal.hover(-1);
      }
      bild.style.cursor = 'pointer';
      knopfTipp();
      return;
    }
    const i = szene.regal.treffer(x, y);
    if (i !== hoverIndex) {
      hoverIndex = i;
      szene.regal.hover(i);
    }
    bild.style.cursor = i >= 0 ? 'pointer' : '';
    tippZeigen(i);
  });
  bild.addEventListener('pointerleave', () => {
    if (offen) return;
    hoverIndex = -1;
    szene.regal.hover(-1);
    bild.style.cursor = '';
    tippZeigen(-1);
  });
  bild.addEventListener('click', (e) => {
    const [x, y] = rasterPunkt(e);
    if (szene.knopf.treffer(x, y)) {
      szene.knopf.druecken();
      knopfTipp();
      return;
    }
    const i = szene.regal.treffer(x, y);
    if (i >= 0) herausnehmen(i);
  });

  // ---------- Spielhülle herausnehmen und groß zeigen ----------
  const overlay = $('#regalOverlay');
  const huelle = $('#spielhuelle');
  const liste = $('#regalListe');

  async function herausnehmen(i) {
    if (offen) return;
    offen = true;
    aktuellIndex = i;
    hoverIndex = -1;
    tippZeigen(-1);
    bild.style.cursor = '';
    herkunft = aufBildschirm(szene.regal.rechteck(i));
    szene.regal.hover(-1);
    szene.regal.heraus(i); // Hülle gleitet in der Szene aus dem Regal
    await warte(320);
    detailZeigen(regalSpiele[i]);
  }

  function detailFuellen(s) {
    aktuell = s;
    $('#huelleBox').style.setProperty('--box-farbe', `linear-gradient(160deg, hsl(${s.farbe},60%,46%), hsl(${(s.farbe + 40) % 360},60%,22%))`);
    $('#huelleBild').replaceChildren(IO.coverBild(s));
    $('#huelleName').textContent = s.titel;
    $('#huelleZuletzt').textContent = s.zuletzt ? `Zuletzt gespielt: ${IO.datum(s.zuletzt)}` : 'Neu im Regal';
    $('#huelleTitel').textContent = s.titel;
    $('#huelleAutor').textContent = s.autor ? `von ${s.autor}` : '';
    $('#huelleText').textContent = s.kurzbeschreibung || '';
    const wert = (zahl, label) => el('div', { class: 'huelle-wert' }, el('strong', { text: zahl }), el('span', { text: label }));
    $('#huelleWerte').replaceChildren(
      wert(s.bestwert == null ? '–' : IO.zahl(s.bestwert), 'Rekord'),
      wert(IO.zahl(s.eintraege || 0), 'Gespielte Runden'),
      ...s.tags.slice(0, 3).map((t) => IO.tag(t))
    );
  }

  function detailZeigen(s) {
    detailFuellen(s);
    overlay.hidden = false;
    liste.hidden = true;
    huelle.hidden = false;
    $('#huelleSpielen').focus({ preventScroll: true, focusVisible: false });
    if (wenigBewegung || !herkunft) return;
    // Hülle fliegt aus dem Regal nach vorne und dreht sich zum Betrachter
    const k = huelle.getBoundingClientRect();
    const dx = herkunft.left + herkunft.width / 2 - (k.left + k.width / 2);
    const dy = herkunft.top + herkunft.height / 2 - (k.top + k.height / 2);
    const s0 = Math.max(0.03, herkunft.height / k.height);
    huelle.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s0}) rotateY(75deg)`, opacity: 0.3 },
        { transform: 'translate(0, 0) scale(1.03) rotateY(-4deg)', opacity: 1, offset: 0.75 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }

  async function zurueckLegen() {
    if (!offen) return;
    if (!wenigBewegung && herkunft && !huelle.hidden) {
      const k = huelle.getBoundingClientRect();
      const dx = herkunft.left + herkunft.width / 2 - (k.left + k.width / 2);
      const dy = herkunft.top + herkunft.height / 2 - (k.top + k.height / 2);
      const s0 = Math.max(0.03, herkunft.height / k.height);
      overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-in' });
      await huelle.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${s0}) rotateY(75deg)`, opacity: 0.2 }],
        { duration: 420, easing: 'cubic-bezier(.5,0,.8,.4)' }
      ).finished;
    }
    overlay.hidden = true;
    huelle.hidden = true;
    szene.regal.heraus(-1); // Hülle gleitet zurück ins Regal
    offen = false;
    aktuell = null;
  }

  async function spielen() {
    if (!aktuell) return;
    const ziel = `/spiel.html?s=${encodeURIComponent(aktuell.kurzname)}&start=1`;
    if (!wenigBewegung) {
      await huelle.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(1.08)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished;
    }
    location.href = ziel;
  }

  $('#huelleSpielen').addEventListener('click', spielen);
  $('#huelleZurueck').addEventListener('click', zurueckLegen);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) zurueckLegen();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && offen) zurueckLegen();
  });

  // Ersatz für kleine Bildschirme: Liste statt Regal
  $('#regalKnopf').addEventListener('click', () => {
    if (offen) return;
    offen = true;
    overlay.hidden = false;
    huelle.hidden = true;
    liste.hidden = false;
    $('#regalListeRaster').replaceChildren(
      ...regalSpiele.map((s) => {
        const b = el(
          'button',
          { class: 'regal-eintrag', type: 'button' },
          el('span', { class: 'daumen' }, IO.coverBild(s)),
          el('span', { class: 'regal-eintrag-text' }, el('strong', { text: s.titel }), el('small', { text: s.zuletzt ? IO.datum(s.zuletzt, false) : 'Neu' }))
        );
        b.addEventListener('click', () => {
          const r = b.getBoundingClientRect();
          herkunft = { left: r.left, top: r.top, width: r.width, height: r.height };
          detailZeigen(s);
        });
        return b;
      })
    );
  });

  // ---------- Start ----------
  anpassen();
  window.addEventListener('resize', anpassen);

  const status = await IO.start('');
  if (!status.eingerichtet) {
    location.href = '/einrichten.html';
    return;
  }
  const gruss = $('#gruss');
  gruss.textContent = status.ich
    ? `Hallo ${status.ich.anzeigename} – deine Spiele warten im Regal rechts.`
    : 'Willkommen! Melde dich oben rechts an, um Punkte zu sammeln.';
  gruss.hidden = false;
  regalFuellen(status.ich);
})();
