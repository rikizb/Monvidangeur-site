export const normaliser = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[''`]/g, " ").replace(/[-_]/g, " ").replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte")
    .replace(/\s+/g, " ").trim();

const jour = 86400000;
export const isoVersDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const dateVersIso = (dt) => dt.toISOString().slice(0, 10);

export function chercher(index, saisie, max = 8) {
  const q = normaliser(saisie);
  if (q.length < 2) return [];
  const estCp = /^\d{2,5}$/.test(q);
  const res = [];
  for (const c of index) {
    const ok = estCp ? c.codes_postaux.some((cp) => cp.startsWith(q)) : (c.nom_normalise_ui.startsWith(q) || c.nom_normalise_ui.includes(" " + q));
    if (ok) res.push(c);
  }
  res.sort((a, b) => (a.nom_normalise_ui.startsWith(q) ? 0 : 1) - (b.nom_normalise_ui.startsWith(q) ? 0 : 1) || a.nom.localeCompare(b.nom, "fr"));
  return res.slice(0, max);
}

export function resoudreCommune(c, parInsee) {
  if (!c) return { etat: "H" };
  if ((c.statut === "commune_deleguee" || c.statut === "commune_associee") && c.code_commune_parent) {
    const parent = parInsee.get(c.code_commune_parent);
    if (parent && parent.statut === "commune") return { commune: parent, deleguee: c };
  }
  return { commune: c, deleguee: null };
}

export function etatSpanc(c, seuils) {
  if (String(c.motif || "").toLowerCase().startsWith("discordance")) return "E7";
  if ((c.services_possibles || []).length > 1) return "E6";
  if (!c.publiable || c.confiance == null || c.confiance < seuils.confiance_min_publiable) return "E5";
  if (!c.tarif_affichable) return "E5";
  return "OK";
}

export function etatTarif(spanc, aujourdhui, seuils) {
  const t = (spanc && spanc.tarif_controle_vente) || {};
  if (t.montant == null) return { etat: "E4", drapeaux: [] };
  if (t.montant === 0 && t.gratuite_ecrite !== true) return { etat: "E4z", drapeaux: [] };
  const ref = t.date_preuve_en_vigueur || t.date_deliberation;
  if (!ref) return { etat: "E3a", drapeaux: [] };
  if ((aujourdhui - isoVersDate(ref)) / jour > seuils.fraicheur_tarif_spanc_jours) return { etat: "E2", drapeaux: [], ref };
  if (t.confiance == null || t.confiance < seuils.confiance_min_publiable) return { etat: "E2c", drapeaux: [], ref };
  const drapeaux = [];
  if (t.montant === 0) drapeaux.push("GRATUITE");
  else if (t.ht_ou_ttc === "HT") drapeaux.push("HT");
  else if (t.ht_ou_ttc !== "TTC") drapeaux.push("HT_TTC_INCONNU");
  if ((t.variantes || []).length) drapeaux.push("PALIERS");
  return { etat: "E1", drapeaux, ref };
}

export function ajouterAnnees(dt, n) {
  const y = dt.getUTCFullYear() + n, m = dt.getUTCMonth(), d = dt.getUTCDate();
  const r = new Date(Date.UTC(y, m, d));
  return r.getUTCMonth() !== m ? new Date(Date.UTC(y, m + 1, 0)) : r;
}

export function validite({ aUnRapport, dateRapport, moisSeul, dateActe, aujourdhui, V }) {
  const dActe = dateActe || aujourdhui;
  if (aUnRapport === "non") return { verdict: "A_non" };
  if (aUnRapport === "oui_sans_date") return { verdict: "A_sans_date" };
  if (!dateRapport) return { verdict: null };
  let dr = dateRapport;
  if (moisSeul) dr = new Date(Date.UTC(dr.getUTCFullYear(), dr.getUTCMonth(), 1));
  const fin = new Date(ajouterAnnees(dr, V).getTime() - jour);
  return { verdict: dActe <= fin ? "A_valable" : "A_expire", fin, dateRapport: dr };
}

export function blocIssue(aUnRapport, issue) {
  if (aUnRapport === "non") return null;
  return ({ non_conforme: "D_issue_non_conforme", defaut_entretien_usure: "D_issue_entretien", absence_installation: "D_issue_absence", conforme: "D_issue_conforme" })[issue] || "D_issue_inconnue";
}

export function indexer(exports) {
  const index = [], parInsee = new Map();
  for (const ex of exports) for (const c of ex.communes) {
    const e = { ...c, dep: ex.departement.code, nom_normalise_ui: normaliser(c.nom) };
    index.push(e);

    if (c.statut === "commune") parInsee.set(c.code_insee, e);
  }
  return { index, parInsee };
}

export function evaluer(c, ex, aujourdhui) {
  const es = etatSpanc(c, ex.seuils);
  const spanc = ex.spanc[c.spanc_id] || null;
  const et = es === "OK" ? etatTarif(spanc, aujourdhui, ex.seuils) : { etat: es, drapeaux: [] };
  return { etat_spanc: es, etat_tarif: et.etat, drapeaux: et.drapeaux, ref: et.ref, spanc };
}

export const LOCAUX_GENERIQUES = ["accueil", "contact", "info", "infos", "courrier", "secretariat", "administration", "spanc", "anc", "assainissement", "mairie", "standard", "environnement", "eau", "eaux"];
const MESSAGERIES = ["wanadoo", "orange", "gmail", "free", "laposte", "hotmail", "yahoo", "outlook", "sfr", "neuf", "aol", "live", "icloud"];
export function mailGenerique(m) {
  if (typeof m !== "string") return false;
  const r = /^([a-z0-9_-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/.exec(m.trim().toLowerCase());
  if (!r) return false;
  const [, local, dom] = r, lab = dom.split(".")[0];
  if (LOCAUX_GENERIQUES.includes(local) || (local === lab && !MESSAGERIES.includes(lab))) return true;
  const mots = local.split(/[-_]/);
  return mots.length > 1 && mots.every((w) => LOCAUX_GENERIQUES.includes(w));
}
