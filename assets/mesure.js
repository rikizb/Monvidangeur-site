(function () {
  "use strict";
  var script = document.currentScript;
  var URL_MATOMO = script && script.getAttribute("data-matomo");
  var ID_SITE = script && script.getAttribute("data-site");
  if (!URL_MATOMO || !/^https:\/\/stats\.monvidangeur\.fr\/$/.test(URL_MATOMO) || !/^[1-9]\d{0,5}$/.test(ID_SITE || "")) return;

  var OPPOSITION = "mv_mesure_opposition";

  var LISTE = {"simulateur":{"demarre":[null],"verdict":["A_non","A_sans_date","A_valable","A_expire"],"departement":["60","27"]},"contact":{"tel":["simulateur","page"],"mail":["simulateur","page"],"site_spanc":["simulateur"],"page_contact":["simulateur"]}};

  function oppose() { return document.cookie.split(/;\s*/).indexOf(OPPOSITION + "=1") >= 0; }
  function ecrireOpposition(actif) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = OPPOSITION + "=" + (actif ? "1; Max-Age=34128000" : "; Max-Age=0") + "; Path=/; SameSite=Lax" + secure;
  }

  var _paq = window._paq = window._paq || [];
  var envoye = {};
  function suivre(categorie, action, valeur) {
    var c = Object.prototype.hasOwnProperty.call(LISTE, categorie) ? LISTE[categorie] : null;
    var v = valeur === undefined ? null : valeur;
    if (!c || !Object.prototype.hasOwnProperty.call(c, action) || c[action].indexOf(v) < 0) return false;
    if (oppose()) return false;

    (window._paq = window._paq || []).push(v === null ? ["trackEvent", categorie, action] : ["trackEvent", categorie, action, v]);
    return true;
  }
  function suivreUneFois(categorie, action, valeur) {
    var k = categorie + "/" + action + "/" + valeur;
    if (envoye[k]) return; if (suivre(categorie, action, valeur)) envoye[k] = true;
  }

  function interfaceOpposition() {
    var bloc = document.getElementById("mesure-opposition");
    if (!bloc) return;
    var etat = document.createElement("p"), bouton = document.createElement("button");
    etat.setAttribute("role", "status"); bouton.type = "button"; bouton.className = "bouton-opposition";
    function afficher() {
      var o = oppose();
      etat.textContent = o ? "Vous n'êtes pas compté(e) dans les statistiques de visite de ce site (votre choix est enregistré dans ce navigateur)."
                           : "Votre visite est actuellement comptée de façon anonyme dans les statistiques de ce site.";
      bouton.textContent = o ? "Accepter à nouveau d'être compté(e)" : "Ne plus être compté(e)";
      bouton.setAttribute("aria-pressed", o ? "true" : "false");
    }
    bouton.addEventListener("click", function () { ecrireOpposition(!oppose()); afficher(); });
    bloc.textContent = ""; bloc.appendChild(etat); bloc.appendChild(bouton); afficher();
  }

  function evenements() {
    var simu = document.getElementById("simulateur-vente");
    if (simu) {
      var formulaire = simu.querySelector("form");
      var demarrer = function () { suivreUneFois("simulateur", "demarre"); };
      if (formulaire) { formulaire.addEventListener("input", demarrer); formulaire.addEventListener("change", demarrer); }
      simu.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("#simu-suggestions [data-insee]");
        if (b) suivreUneFois("simulateur", "departement", String(b.getAttribute("data-insee")).slice(0, 2));
      }, true);
      var resultat = simu.querySelector("[data-resultat]");
      if (resultat && window.MutationObserver) new MutationObserver(function () {
        var a = resultat.querySelector('[data-carte="A"][data-verdict]');
        if (a) suivreUneFois("simulateur", "verdict", a.getAttribute("data-verdict"));
      }).observe(resultat, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-verdict"] });
    }
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href"), dansSimu = !!(simu && simu.contains(a)), lieu = dansSimu ? "simulateur" : "page";
      if (/^tel:/i.test(href)) return void suivre("contact", "tel", lieu);
      if (/^mailto:/i.test(href)) return void suivre("contact", "mail", lieu);
      if (!dansSimu || !/^https?:/i.test(href) || !a.closest('[data-carte="B"]')) return;
      var libelle = (a.textContent || "").trim();
      if (/^(Site internet|Page du service)/.test(libelle)) suivre("contact", "site_spanc", "simulateur");
      else if (/^(Page de contact|Formulaire ou page de contact)/.test(libelle)) suivre("contact", "page_contact", "simulateur");
    }, true);
  }

  function demarrer() {
    interfaceOpposition();
    if (oppose()) return;
    var provenance = "";
    try { if (document.referrer) provenance = new URL(document.referrer).origin + "/"; } catch (e) { provenance = ""; }
    _paq.push(["disableCookies"]);
    _paq.push(["disableBrowserFeatureDetection"]);
    _paq.push(["setCustomUrl", location.origin + location.pathname]);
    _paq.push(["setReferrerUrl", provenance]);
    _paq.push(["setTrackerUrl", URL_MATOMO + "matomo.php"]);
    _paq.push(["setSiteId", ID_SITE]);
    _paq.push(["trackPageView"]);
    evenements();
    var s = document.createElement("script");
    s.async = true; s.src = URL_MATOMO + "matomo.js";
    document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
