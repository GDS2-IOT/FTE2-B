/* =============================================================
   Freistunden.exe – Launcher-SDK (Version 1)

   In jedem Spiel GANZ OBEN im <head> einbinden:
     <script src="/launcher-sdk.js"></script>

   Punkte melden (z. B. bei "Game Over"):
     Launcher.punkte(1234);

   Optional: Ergebnis abwarten
     Launcher.punkte(1234).then(function (r) {
       // r = { gespeichert: true, platz: 3, punktzahl: 1234 }
       //   oder { gespeichert: false, grund: "..." }
       //   oder null, wenn das Spiel ohne Launcher läuft
     });

   Weitere Infos:
     Launcher.imLauncher  -> true, wenn das Spiel im Launcher läuft
     Launcher.spieler     -> Anzeigename des angemeldeten Spielers oder null

   localStorage funktioniert im Spiel wie gewohnt (setItem/getItem/
   removeItem/clear). Das SDK speichert die Daten pro Spieler im
   Launcher, weil die Spiele in einer Sandbox laufen.
   ============================================================= */
(function () {
  'use strict';
  if (window.Launcher) return;

  var PREFIX = 'io-launcher:';
  var imLauncher = window.parent && window.parent !== window;
  var start = {};
  try {
    if (typeof window.name === 'string' && window.name.indexOf(PREFIX) === 0) {
      start = JSON.parse(window.name.slice(PREFIX.length)) || {};
    }
  } catch (e) {
    start = {};
  }

  function senden(nachricht) {
    if (!imLauncher) return;
    nachricht.io = 'launcher';
    try {
      window.parent.postMessage(nachricht, '*');
    } catch (e) {
      /* ignorieren */
    }
  }

  // ---------- Ersatz für localStorage / sessionStorage ----------
  function speicherErsatz(daten, beiAenderung) {
    var obj = {
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(daten, k) ? daten[k] : null;
      },
      setItem: function (k, v) {
        daten[String(k)] = String(v);
        beiAenderung();
      },
      removeItem: function (k) {
        delete daten[String(k)];
        beiAenderung();
      },
      clear: function () {
        for (var k in daten) if (Object.prototype.hasOwnProperty.call(daten, k)) delete daten[k];
        beiAenderung();
      },
      key: function (i) {
        var keys = Object.keys(daten);
        return i >= 0 && i < keys.length ? keys[i] : null;
      },
    };
    Object.defineProperty(obj, 'length', {
      get: function () {
        return Object.keys(daten).length;
      },
    });
    return obj;
  }

  function verfuegbar(name) {
    try {
      var s = window[name];
      var t = '__io_test__';
      s.setItem(t, t);
      s.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (!verfuegbar('localStorage')) {
    var daten = {};
    if (start.speicher && typeof start.speicher === 'object') {
      for (var k in start.speicher) {
        if (Object.prototype.hasOwnProperty.call(start.speicher, k)) daten[k] = String(start.speicher[k]);
      }
    }
    var zeitgeber = null;
    var local = speicherErsatz(daten, function () {
      clearTimeout(zeitgeber);
      zeitgeber = setTimeout(function () {
        senden({ typ: 'speicher', daten: daten });
      }, 150);
    });
    try {
      Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
    } catch (e) {
      /* ältere Browser */
    }
  }
  if (!verfuegbar('sessionStorage')) {
    try {
      Object.defineProperty(window, 'sessionStorage', { value: speicherErsatz({}, function () {}), configurable: true });
    } catch (e) {
      /* ältere Browser */
    }
  }

  // ---------- Punkte ----------
  var offen = {};
  var zaehler = 0;

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d || d.io !== 'launcher') return;
    if (d.typ === 'punkte-ergebnis' && offen[d.id]) {
      offen[d.id](d.ergebnis || null);
      delete offen[d.id];
    }
  });

  function punkte(wert) {
    var n = Number(wert);
    if (!isFinite(n)) {
      console.warn('[Launcher] Launcher.punkte() braucht eine Zahl, bekommen:', wert);
      return Promise.resolve(null);
    }
    n = Math.round(n);
    if (!imLauncher) {
      console.info('[Launcher] ' + n + ' Punkte (Spiel läuft ohne Launcher, nichts gespeichert).');
      return Promise.resolve(null);
    }
    var id = ++zaehler;
    senden({ typ: 'punkte', id: id, punkte: n });
    return new Promise(function (resolve) {
      offen[id] = resolve;
      setTimeout(function () {
        if (offen[id]) {
          delete offen[id];
          resolve(null);
        }
      }, 8000);
    });
  }

  window.Launcher = Object.freeze({
    version: 1,
    imLauncher: imLauncher,
    spieler: typeof start.spieler === 'string' ? start.spieler : null,
    punkte: punkte,
  });
})();
