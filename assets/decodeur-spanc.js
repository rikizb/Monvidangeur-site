(function () {
  var zone = document.getElementById("decodeur");
  var texte = document.getElementById("decodeur-texte");
  var bouton = document.getElementById("decodeur-bouton");
  var sortie = document.getElementById("decodeur-resultat");
  if (!zone || !texte || !bouton || !sortie) return;
  zone.hidden = false;
  var REGLES = [
    { cle: "absence", motifs: [/absence d.?(une )?installation/, /pas d.?installation/, /aucune installation/, /inexistan/, /mise en demeure/, /l\.? ?1331-1-1/] },
    { cle: "a", motifs: [/danger/, /sante des personnes/, /cas a\b/, /securite sanitaire/, /contact (direct|possible)/, /nuisances? olfacti/, /odeurs?/, /moustiques?/, /vecteurs?/, /defaut de (structure|fermeture)/, /couvercles?/, /tampons?/, /35 ?m/, /puits/, /enjeu sanitaire/, /captage/, /baignade/] },
    { cle: "b", motifs: [/risque (environnemental|avere)/, /pollution de l.?environnement/, /cas b\b/, /enjeux? environnementa/, /sdage/, /\bsage\b/] },
    { cle: "c", motifs: [/non[ -]?conform/, /cas c\b/, /incomplete/, /sous[ -]?dimensionn/, /dysfonctionnements? majeur/, /fosse septique seule/, /pretraitement seul/, /traitement seul/, /puisard/, /drain (d.?epandage )?unique/, /deborde/, /engorg/, /hors service/, /departs? de boues/, /perdu son etancheite/, /rejet/, /eaux menageres/] },
    { cle: "entretien", motifs: [/defauts? d.?entretien/, /usure/, /\buse(e|s)?\b/, /recommandation/, /vidange/, /hauteur de boues/, /nettoyage/, /prefiltre/, /accessib/, /entretien/] },
    { cle: "conforme", motifs: [/\bconforme\b/, /absence de defaut/, /aucun defaut/, /pas de defaut/, /bon (etat de )?fonctionnement/, /satisfaisant/] },
  ];
  var ORDRE = ["absence", "a", "b", "c", "entretien", "conforme"];
  var cartes = {};
  document.querySelectorAll(".decodeur-verdict").forEach(function (s) { cartes[s.getAttribute("data-cle")] = s; });
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2019\u2018`]/g, "'").replace(/\s+/g, " ");
  }
  function decoder() {
    var t = " " + norm(texte.value) + " ";
    var trouves = {};
    REGLES.forEach(function (r) {
      var cible = r.cle === "conforme" ? t.replace(/non[ -]?conform[a-z]*/g, " ") : t;
      r.motifs.forEach(function (m) { var x = cible.match(m); if (x) (trouves[r.cle] = trouves[r.cle] || []).push(x[0].trim()); });
    });
    if (trouves.a || trouves.b) delete trouves.conforme;
    if (trouves.c && (trouves.a || trouves.b) && !/incomplete|sous[ -]?dimensionn|dysfonctionnement|seule|seul|puisard|unique|deborde|engorg|hors service|boues|etancheite/.test(t)) delete trouves.c;
    var cles = ORDRE.filter(function (k) { return trouves[k]; });
    while (sortie.firstChild) sortie.removeChild(sortie.firstChild);
    if (!texte.value.trim()) { sortie.appendChild(para("Collez d'abord une phrase de votre rapport.")); return; }
    if (!cles.length) {
      sortie.appendChild(para("Aucun terme de la grille officielle n'a été reconnu. Copiez la phrase de conclusion du rapport, ou choisissez la conclusion dans le tableau ci-dessous."));
      return;
    }
    sortie.appendChild(para(cles.length > 1
      ? "Plusieurs conclusions possibles, de la plus contraignante à la moins contraignante. Votre rapport précise laquelle s'applique :"
      : "Conclusion reconnue :"));
    cles.forEach(function (k) {
      var c = cartes[k]; if (!c) return;
      var copie = c.cloneNode(true); copie.hidden = false; copie.removeAttribute("id");
      var p = document.createElement("p"); p.textContent = "Termes reconnus : « " + trouves[k].filter(function (v, i, a) { return a.indexOf(v) === i; }).join(" », « ") + " »";
      copie.appendChild(p);
      sortie.appendChild(copie);
    });
    if (trouves.c && !trouves.a && !trouves.b) sortie.appendChild(para("Si votre rapport mentionne aussi un danger pour la santé des personnes ou un risque environnemental avéré, c'est le cas a ou b : travaux obligatoires sous 4 ans."));
  }
  function para(s) { var p = document.createElement("p"); p.textContent = s; return p; }
  bouton.addEventListener("click", decoder);
  document.querySelectorAll(".decodeur-exemple").forEach(function (b) {
    b.addEventListener("click", function () { texte.value = b.textContent; decoder(); });
  });
})();
