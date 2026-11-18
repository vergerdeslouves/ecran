/*
 * Assistant de l'écran mural Au Verger des Louves
 * Partagé entre l'écran (index.html) et la page téléphone (courses.html).
 * Compatible iPad iOS 12 (ES5 uniquement).
 * La page doit définir avant : window.ECRAN = { script: '...', smart: { tout_on: '...', tout_off: '...' } }
 */
(function () {
  var E = window.ECRAN;

  /* ---------- Stockage local ---------- */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // Code d'accès : passé une fois dans l'adresse (?code=...) puis gardé sur l'appareil
  (function () {
    var m = /[?&]code=([^&#]+)/.exec(location.search);
    if (m) {
      store('dash_agenda_code', decodeURIComponent(m[1]));
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    }
  })();

  /* ---------- Appels au script Google ----------
   * 1) fetch SANS les cookies Google : marche même si le téléphone est connecté
   *    à un compte Google que le script refuse ("Impossible d'ouvrir le fichier").
   * 2) si fetch n'est pas possible, repli en JSONP (vieux iPad). */
  function api(params, ok, fail) {
    var code = load('dash_agenda_code');
    if (!code) { if (fail) fail('code'); return; }
    // Qui fait l'action (pour les notifications des autres)
    var p2 = {}; for (var x in params) if (params.hasOwnProperty(x)) p2[x] = params[x];
    if (!p2.par && E.appareil) p2.par = E.appareil;
    params = p2;
    if (window.fetch) {
      var q = '?code=' + encodeURIComponent(code) + '&_t=' + new Date().getTime();
      for (var k in params) if (params.hasOwnProperty(k)) q += '&' + k + '=' + encodeURIComponent(params[k]);
      fetch(E.script + q, { credentials: 'omit', cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (data) {
          if (data && data.erreur === 'code') { if (fail) fail('code'); return; }
          if (ok) ok(data);
        }, function () { jsonp(params, ok, fail, code); });
      return;
    }
    jsonp(params, ok, fail, code);
  }

  function jsonp(params, ok, fail, code) {
    var cb = 'apiCb' + new Date().getTime() + Math.floor(Math.random() * 1000);
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { end(); if (fail) fail('reseau'); }, 20000);
    function end() {
      done = true; clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    window[cb] = function (data) {
      if (done) return; end();
      if (data && data.erreur === 'code') { if (fail) fail('code'); return; }
      if (ok) ok(data);
    };
    s.onerror = function () { if (done) return; end(); if (fail) fail('reseau'); };
    var q = '?code=' + encodeURIComponent(code) + '&callback=' + cb + '&_t=' + new Date().getTime();
    for (var k in params) if (params.hasOwnProperty(k)) q += '&' + k + '=' + encodeURIComponent(params[k]);
    s.src = E.script + q;
    document.body.appendChild(s);
  }

  /* ---------- Lumières ---------- */
  function lights(name) {
    var url = E.smart && E.smart[name];
    if (!url) return false;
    var ping = new Image();
    ping.src = url + (url.indexOf('?') === -1 ? '?' : '&') + '_t=' + new Date().getTime();
    return true;
  }

  /* ---------- Voix ---------- */
  function speak(text) {
    try {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR'; u.rate = 1.05;
      var vs = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < vs.length; i++) if (/^fr/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Écoute une phrase ; renvoie false si le navigateur ne sait pas (iPad iOS 12)
  function listen(onText, onState) {
    if (!Rec) return false;
    var r = new Rec();
    r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = function (ev) { onText(ev.results[0][0].transcript); };
    r.onerror = function () { if (onState) onState('erreur'); };
    r.onend = function () { if (onState) onState('fin'); };
    r.start();
    if (onState) onState('ecoute');
    return true;
  }

  /* ---------- Compréhension des phrases ---------- */
  function norm(s) {
    return String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c');
  }

  // Renvoie { type, texte }
  function interpret(phrase) {
    var t = String(phrase || '').replace(/^\s+|\s+$/g, '').replace(/[.!?]+$/, '');
    t = t.replace(/^(ok |hey |dis |eh )?(jarvis|assistant|l'écran|écran)[\s,]*/i, '');
    var n = norm(t);

    if (/^(annule|annuler|oups|retire le dernier|enleve le dernier)/.test(n)) return { type: 'annule' };
    if (/^(vide|vider|efface|effacer|supprime|remets? a zero) (toute )?(la |ma )?liste( de courses)?$/.test(n)) return { type: 'vide' };
    if (/(retire|enleve|supprime|efface).{0,10}(articles? )?coches?/.test(n)) return { type: 'nettoie' };
    if (/^(bonne nuit|eteins|eteint|eteindre|coupe|ferme)/.test(n) || /(eteins|eteindre|coupe) (les |la |tout)/.test(n))
      return { type: 'off' };
    if (/^(allume|allumer|bonjour la maison)/.test(n) || /allume (les |la |tout)/.test(n)) return { type: 'on' };
    if (/(qu'?est.ce qu'?il (y a|faut)|lis|dis.moi|quoi) .*(liste|courses|acheter)/.test(n) || /^(la )?liste( de courses)?$/.test(n))
      return { type: 'lire' };
    if (/(lis|lire|qu'?est.ce qu'?il y a).{0,10}(memo|note)/.test(n)) return { type: 'memo_lire' };

    var m;
    if ((m = /^(?:note|notes|noter|ecris|ecrire|memo|rappel|rappelle(?:-moi)?|n'oublie pas)\s*(?:dans le memo|sur le memo|que|de|d')?\s*:?\s*/i.exec(n)) && m[0].length) {
      return { type: 'memo', texte: t.slice(m[0].length) };
    }
    if ((m = /^(?:enleve|enlever|retire|retirer|supprime|supprimer|barre|barrer|coche|cocher|j'ai achete|on a achete)\s+/i.exec(n))) {
      return { type: 'retire', texte: t.slice(m[0].length) };
    }
    if ((m = /^(?:rajoute|rajouter|ajoute|ajouter|ajoutes|rajoutes|mets|met|mettre|achete|acheter|il (?:me |nous )?faut|on a besoin d'?e?|j'ai besoin d'?e?|besoin d'?e?|plus de)\s*/i.exec(n)) && m[0].length) {
      return { type: 'ajout', texte: t.slice(m[0].length) };
    }
    return { type: 'inconnu' };
  }

  /* ---------- Exécution ---------- */
  // ui : { reply(text), onList(data), onMemo(text), confirm(msg) }
  function run(phrase, ui) {
    var c = interpret(phrase);
    var say = function (txt) { ui.reply(txt); window.Assistant.speak(txt); };
    var byServer = function (params, msg) {
      ui.reply('…');
      window.Assistant.api(params, function (d) {
        if (ui.onList) ui.onList(d);
        if (ui.onMemo && typeof d.memo === 'string') ui.onMemo(d.memo);
        say(typeof msg === 'function' ? msg(d) : (msg || d.message || 'C\'est fait'));
      }, function (why) { say(why === 'code' ? 'Code d\'accès manquant' : 'Je n\'arrive pas à joindre la liste'); });
    };
    switch (c.type) {
      case 'ajout':   return byServer({ action: 'ajout', texte: c.texte });
      case 'retire':  return byServer({ action: 'retire', texte: c.texte });
      case 'annule':  return byServer({ action: 'annule' });
      case 'nettoie': return byServer({ action: 'nettoie' });
      case 'lire':    return byServer({ action: 'liste' });
      case 'vide':
        if (ui.confirm && !ui.confirm('Vider toute la liste de courses ?')) return say('D\'accord, je ne touche à rien');
        return byServer({ action: 'vide' });
      case 'memo':
        if (!c.texte) return say('Que dois-je noter ?');
        return byServer({ action: 'memo_ajout', texte: c.texte }, 'C\'est noté dans le mémo');
      case 'memo_lire':
        return byServer({ action: 'liste' }, function (d) { return d.memo ? 'Dans le mémo : ' + d.memo : 'Le mémo est vide'; });
      case 'on':  return say(lights('tout_on') ? 'J\'allume tout' : 'Les lumières ne sont pas reliées');
      case 'off': return say(lights('tout_off') ? 'J\'éteins tout' : 'Les lumières ne sont pas reliées');
      default:    return say('Je n\'ai pas compris. Dis par exemple : ajoute du lait');
    }
  }

  window.Assistant = { api: api, run: run, interpret: interpret, speak: speak, listen: listen,
                       canListen: !!Rec, lights: lights, load: load, store: store };
})();
