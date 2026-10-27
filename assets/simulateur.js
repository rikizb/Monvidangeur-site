// Îlot JS du simulateur (page /controle-spanc/vente-immobiliere/). Textes : growth/exp01 textes-ui.md.
// Aucune donnée saisie n'est envoyée ni stockée ; aucun cookie ; aucun tiers. Analytics câblés en no-op.
import { chercher, resoudreCommune, etatSpanc, etatTarif, validite, blocIssue, indexer, isoVersDate, mailGenerique } from "./simulateur-logique.js";

const racine = document.getElementById("simulateur-vente");
const CFG = JSON.parse(document.getElementById("simulateur-config").textContent);

// Plan de marquage (analytics.md) : aucun outil choisi ni consenti -> no-op. Ne jamais y passer de date saisie.
const suivre = (evenement, proprietes) => { void evenement; void proprietes; };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateFr = (d) => { if (!d) return ""; const iso = typeof d === "string" ? d : d.toISOString(); const [y, m, j] = iso.slice(0, 10).split("-"); return `${j}/${m}/${y}`; };
const euro = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
// Élision et contraction devant un nom de commune : « d'Évreux », « du Crocq », « des Andelys ».
// Élision devant h muet : UNIQUEMENT pour la liste explicite ci-dessous (recette S1, C3). Les autres noms en H gardent « de ».
const H_MUETS = ["Hénonville"];
const de = (n) => /^Le /.test(n) ? "du " + n.slice(3) : /^Les /.test(n) ? "des " + n.slice(4) : /^[AEIOUYÂÀÉÈÊÎÏÔÛ]/.test(n) || H_MUETS.includes(n) ? "d'" + n : "de " + n;
const a = (n) => /^Le /.test(n) ? "au " + n.slice(3) : /^Les /.test(n) ? "aux " + n.slice(4) : "à " + n;
const lienExt = (url, txt, cta) => url ? `<a href="${esc(url)}" rel="noopener" target="_blank"${cta ? ` data-cta="${cta}"` : ""}>${esc(txt)}</a>` : "";
const typeLibelle = { CC: "communauté de communes", CA: "communauté d'agglomération", CU: "communauté urbaine", SMF: "syndicat mixte", SMO: "syndicat mixte", SIVU: "syndicat intercommunal", SIVOM: "syndicat intercommunal", COM: "commune" };
const aujourdhuiUTC = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };

const etat = { commune: null, deleguee: null, ex: null, aUnRapport: null, dateRapport: null, moisSeul: false, issue: "inconnue", dateActe: null, resultatVu: false };
let EX = {}, IDX = null;

function q(sel) { return racine.querySelector(sel); }

async function charger() {
  q("[data-statut]").textContent = "Recherche du service…";
  try {
    const exs = await Promise.all(CFG.departements.map((d) => fetch(CFG.export_url.replace("{dep}", d), { credentials: "omit" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })));
    exs.forEach((e) => (EX[e.departement.code] = e));
    IDX = indexer(exs);
    q("[data-statut]").textContent = "";
    q("[data-maj]").textContent = dateFr(exs[0].build_meta.date_generation);
  } catch (e) {
    q("[data-statut]").textContent = "Le simulateur est momentanément indisponible. Votre mairie peut vous indiquer le service à contacter.";
    suivre("simu_erreur_donnees", { dep: CFG.departements.join(",") });
  }
}

// ---------- Saisie commune ----------
function proposer() {
  const champ = q("#simu-commune"), liste = q("#simu-suggestions"), msg = q("[data-msg-commune]");
  const v = champ.value;
  liste.innerHTML = ""; msg.textContent = "";
  if (!IDX || v.trim().length < 2) return;
  const res = chercher(IDX.index, v);
  if (!res.length) {
    msg.innerHTML = /^\d{2}/.test(v.trim()) && !CFG.departements.some((d) => v.trim().startsWith(d))
      ? "Pour l'instant, le simulateur couvre l'Oise et l'Eure. Pour trouver le SPANC d'une autre commune, demandez à votre mairie."
      : "Nous ne trouvons pas cette commune. Vérifiez l'orthographe ou essayez le code postal. Pour l'instant, le simulateur couvre l'Oise et l'Eure.";
    return;
  }
  for (const c of res) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "lien";
    b.textContent = `${c.nom} (${c.codes_postaux.join(", ")})`; b.dataset.insee = c.code_insee; b.dataset.statut = c.statut;
    b.addEventListener("click", () => choisir(c));
    li.appendChild(b); liste.appendChild(li);
  }
}

function choisir(c) {
  const r = resoudreCommune(c, IDX.parInsee);
  etat.commune = r.commune; etat.deleguee = r.deleguee; etat.ex = EX[r.commune.dep];
  q("#simu-commune").value = c.nom; q("#simu-suggestions").innerHTML = "";
  const ev = evaluerCourant();
  suivre("simu_commune_choisie", { dep: r.commune.dep, etat_spanc: ev.es, etat_tarif: ev.et.etat, drapeaux_tarif: ev.et.drapeaux, commune_deleguee: !!r.deleguee });
  rendre();
}

function evaluerCourant() {
  const c = etat.commune, ex = etat.ex;
  const es = etatSpanc(c, ex.seuils);
  const spanc = ex.spanc[c.spanc_id] || null;
  const et = es === "OK" ? etatTarif(spanc, aujourdhuiUTC(), ex.seuils) : { etat: es, drapeaux: [] };
  return { es, et, spanc };
}

// ---------- Cartes ----------
function carteA(va, REG) {
  const V = REG.validite_rapport_vente_ans.valeur, src = REG.validite_rapport_vente_ans.sources[0];
  const libActe = etat.dateActe ? `À la date de la signature prévue (${dateFr(etat.dateActe)}), ce rapport aura` : "À ce jour, ce rapport a déjà";
  const t = {
    A_non: ["Un contrôle est à prévoir", `Sans rapport de moins de ${V} ans, le contrôle doit être fait avant la vente. Il est réalisé par votre SPANC, pas par un diagnostiqueur immobilier, et il est à votre charge. Contactez le service dès que la vente se précise.`],
    A_sans_date: ["À vérifier", "La date figure sur le rapport. Si vous ne le retrouvez pas, votre SPANC peut vous en indiquer la date ou vous en transmettre une copie."],
    A_valable: ["Votre rapport sera valable", `Contrôle du ${dateFr(va.dateRapport)} : il reste valable pour une vente signée jusqu'au ${dateFr(va.fin)} inclus. Vous n'avez pas à refaire de contrôle si l'acte est signé au plus tard à cette date. Joignez le rapport au dossier de diagnostic technique.`],
    A_expire: ["Un nouveau contrôle sera nécessaire", `${libActe} ${V} ans ou plus (le rapport doit avoir moins de ${V} ans le jour de la signature). Il faudra un nouveau contrôle, à votre charge, avant la signature.`],
  }[va.verdict];
  if (!t) return `<section class="carte" data-carte="A"><h3>Validité du rapport</h3><p>Indiquez si vous avez un rapport (étape 2).</p></section>`;
  return `<section class="carte" data-carte="A" data-verdict="${va.verdict}"><h3>${esc(t[0])}</h3><p>${esc(t[1])}</p>
${etat.moisSeul && va.dateRapport ? "<p><small>Calcul fait au 1er jour du mois indiqué : vérifiez la date exacte sur le rapport.</small></p>" : ""}
<p><small><em>Pour vendre, le rapport du SPANC doit avoir moins de ${V} ans le jour de la signature de l'acte authentique.</em> ${lienExt(src, "Source : service-public.gouv.fr", "source_reglementaire")}</small></p>
${va.verdict === "A_valable" ? `<p data-note-nc><small>Un rapport « non conforme » encore valable peut servir pour la vente : il informe l'acheteur. Sa conclusion ne change pas sa durée de validité. <a href="${CFG.urls.rapport_non_conforme}" data-cta="non_conformite">Que faire si le rapport est non conforme ?</a></small></p>` : ""}</section>`; // Produit & UX 27/10 : note seulement si un rapport existe et est encore valable
}

function carteB(ev, REG) {
  const c = etat.commune, s = ev.spanc;
  let h = `<section class="carte" data-carte="B" data-etat-spanc="${ev.es}"><h3>Le service à contacter</h3>`;
  // Phrase omise si la déléguée porte le nom de la commune nouvelle (Formerie, Breteuil, Pacy-sur-Eure) : recette S1, C1.
  if (etat.deleguee && etat.deleguee.nom !== c.nom) h += `<p data-deleguee>${esc(etat.deleguee.nom)} est une commune ${etat.deleguee.statut === "commune_associee" ? "associée" : "déléguée"} ${esc(de(c.nom))}. Le service d'assainissement est celui ${esc(de(c.nom))}.</p>`;
  if (ev.es === "E7") h += `<p>Les sources publiques ne concordent pas sur le service compétent pour ${esc(c.nom)}. Avant toute démarche, confirmez auprès de votre mairie.</p>`;
  else if (ev.es === "E6") {
    const ids = [...new Set(c.services_possibles.map((x) => x.spanc_id))];
    if (ids.length === 1) h += `<p><strong>${esc(c.services_possibles[0].spanc_nom)}</strong> assure ce service pour ${esc(c.nom)}. Organisation particulière (syndicat à la carte) : en cas de doute, vérifiez en mairie.</p>`;
    else h += `<p>Plusieurs services d'assainissement interviennent ${esc(a(c.nom))} : ${esc([...new Set(c.services_possibles.map((x) => x.spanc_nom))].join(", "))}. Votre mairie vous indiquera celui qui couvre votre adresse.</p>`;
  } else if (ev.es === "E5") h += `<p>Votre commune dépend probablement de <strong>${esc(s ? s.nom : "")}</strong>, mais nous n'avons pas pu le confirmer. Votre mairie vous indiquera le bon service.</p>`;
  else h += `<p><strong>${esc(s.nom)}</strong> (${esc(typeLibelle[s.type] || s.type)}). Ce service assure le contrôle des installations d'assainissement non collectif ${esc(de(c.nom))}.</p>`;
  if (s && ev.es !== "E7" && !(ev.es === "E6" && new Set(c.services_possibles.map((x) => x.spanc_id)).size > 1)) {
    const cs = s.contact_siege || {}, sp = s.contact_spanc || {};
    const bouts = [];
    const telAff = (t) => t.replace(/(\d{2})(?=\d)/g, "$1 ");
    if (sp.tel) bouts.push(`<a href="tel:${esc(sp.tel)}" data-contact="tel">${esc(telAff(sp.tel))}</a>`);
    if (mailGenerique(sp.mail)) bouts.push(`<a href="mailto:${esc(sp.mail)}" data-contact="mail">${esc(sp.mail)}</a>`);
    if (sp.url_page) bouts.push(lienExt(sp.url_page, "Page du service")); // page officielle de la collectivité (repli quand aucune adresse générique)
    if (sp.url_page_contact) bouts.push(lienExt(sp.url_page_contact, "Formulaire ou page de contact")); // page officielle (Data ANC, champ url_page_contact)
    if (sp.url_demande_controle_vente) bouts.push(lienExt(sp.url_demande_controle_vente, "Demander le contrôle vente"));
    if (bouts.length) h += `<p>Service SPANC : ${bouts.join(" · ")}</p>`;
    const b2 = [];
    if (cs.tel && cs.tel !== sp.tel) b2.push(`<a href="tel:${esc(cs.tel)}" data-contact="tel">${esc(telAff(cs.tel))}</a>`);
    if (mailGenerique(cs.mail)) b2.push(`<a href="mailto:${esc(cs.mail)}" data-contact="mail">${esc(cs.mail)}</a>`);
    if (cs.web) b2.push(lienExt(/^https?:/.test(cs.web) ? cs.web : "https://" + cs.web, cs.web));
    if (b2.length) h += `<p>Coordonnées du siège de ${esc(s.nom)} : ${b2.join(" · ")}</p>`;
    const p = s.periodicite || {};
    if (p.ans && !p.discordance) h += `<p>Dans ce secteur, le contrôle périodique a lieu tous les ${p.ans} ans (${lienExt(p.source, "source")}${p.annee ? ", " + esc(p.annee) : ""}).</p>`; // année omise si absente (évite « (source, ) »)
    else h += `<p>La fréquence des contrôles est fixée par chaque service, au plus tous les ${REG.periodicite_max_ans.valeur} ans.</p>`;
    if ((s.deps || []).length > 1) h += `<p>${esc(s.nom)} intervient aussi dans d'autres départements (${esc(s.deps.filter((d) => d !== c.dep).join(", "))}).</p>`;
  }
  h += `<p><small>Rattachement établi à partir des données publiques BANATIC et SISPEA, lues le ${dateFr(c.date_lecture)}.</small></p></section>`;
  return h;
}

function carteC(ev) {
  const s = ev.spanc, t = (s && s.tarif_controle_vente) || {}, L = CFG.libelles;
  let h = `<section class="carte" data-carte="C" data-etat-tarif="${ev.et.etat}"><h3>Ce que coûte le contrôle</h3>`;
  const ref = t.nature_preuve ? esc(t.nature_preuve) : `délibération du ${dateFr(t.date_deliberation)}`;
  const suite = `${lienExt(t.url_source, "Voir la source", "source_tarif")}. Relevé le ${dateFr(t.date_lecture)}.`;
  const mention = (n) => ev.et.drapeaux.includes("HT") ? `<strong>${euro(n)} HT</strong> (le montant TTC n'est pas publié)`
    : ev.et.drapeaux.includes("HT_TTC_INCONNU") ? `<strong>${euro(n)}</strong> <em data-mention="ht-ttc-inconnu">(${esc(L.montant_ht_ttc_inconnu)})</em>` : `<strong>${euro(n)} TTC</strong>`;
  if (ev.et.etat === "E1") {
    if (ev.et.drapeaux.includes("GRATUITE")) h += `<p><strong>Pas de facturation à part pour le contrôle en cas de vente</strong>, selon ${ref} de ${esc(s.nom)} : « ${esc(t.libelle_source)} ». ${suite}</p>`;
    else h += `<p data-montant="${t.montant}">${mention(t.montant)} : tarif du contrôle en cas de vente fixé par ${esc(s.nom)} (${ref}). ${suite}</p>`;
    for (const v of t.variantes || []) if (v.montant != null) h += `<p>Tarif différent si ${esc(v.condition)} : ${mention(v.montant)}</p>`;
  } else {
    h += `<p><strong>${esc(L.libelle_si_absent)}</strong></p>`;
    const e = ev.et.etat;
    if (e === "E2") h += `<p>Le dernier tarif publié que nous avons trouvé date du ${dateFr(ev.et.ref)} : il a pu changer depuis, nous ne l'affichons donc pas. ${lienExt(t.url_source, "Voir la dernière source trouvée", "source_tarif")}. Demandez le tarif en vigueur au service.</p>`;
    else if (e === "E2c") h += `<p>Nous avons trouvé un tarif sur un document de ce service, sans pouvoir confirmer qu'il s'applique à votre cas : nous ne l'affichons pas. ${lienExt(t.url_source, "Voir le document", "source_tarif")}. Demandez le tarif en vigueur au service.</p>`;
    else if (e === "E3a") h += `<p>Le service affiche un tarif sur une page non datée. Nous ne pouvons pas garantir qu'il est à jour. ${lienExt(t.url_source, "Voir la page du service", "source_tarif")} (consultée le ${dateFr(t.date_lecture)}).</p>`;
    else if (e === "E4" || e === "E4z") h += `<p>Nous n'avons pas trouvé de tarif publié pour le contrôle en cas de vente. Demandez-le lors de la prise de rendez-vous : le contrôle est payant et son tarif est fixé par la collectivité (${lienExt("https://www.service-public.gouv.fr/particuliers/vosdroits/F447", "service-public.gouv.fr, F447", "source_reglementaire")}).${e === "E4z" && t.url_source ? " " + lienExt(t.url_source, "Voir la page du service", "source_tarif") + "." : ""}</p>`;
    else h += `<p>Le tarif dépend du service compétent : confirmez-le d'abord auprès de votre mairie.</p>`;
  }
  h += `<p><small>Le prix du contrôle est fixé par chaque collectivité. Il varie d'un territoire à l'autre, même entre communes voisines.</small></p></section>`;
  return h;
}

function carteD(va, ev, REG) {
  const delai = REG.delai_travaux_apres_vente_ans.valeur, pen = REG.penalite_l1331_8 && REG.penalite_l1331_8.valeur;
  const bi = blocIssue(etat.aUnRapport, etat.issue);
  let h = `<section class="carte" data-carte="D"><h3>Et maintenant ?</h3>`;
  const bon = `<p><small>Bon à savoir : si les travaux ne sont pas faits, la collectivité peut appliquer une pénalité financière${pen ? ` (${esc(pen)})` : ""}, et, après mise en demeure, faire réaliser les travaux d'office aux frais du propriétaire.</small></p>`;
  if (bi === "D_issue_non_conforme") h += `<h4>Non conforme : qui fait les travaux ?</h4><ul><li>Vous pouvez faire les travaux <strong>avant la vente</strong>, à vos frais.</li><li>Sinon, c'est <strong>l'acheteur, une fois propriétaire, qui doit les faire réaliser au plus tard ${delai} an après la signature de l'acte de vente.</strong> Le notaire signale la vente au SPANC, qui pourra vérifier que c'est fait.</li><li>Le coût des travaux se négocie généralement dans le prix, et vous pouvez aussi vous engager par écrit à en payer une partie. Mais cet accord ne vaut qu'entre vendeur et acheteur : face au SPANC, c'est le nouveau propriétaire qui reste responsable des travaux.</li><li>Avant les travaux, le projet doit être validé par le SPANC, qui contrôle ensuite le chantier avant qu'il soit refermé.</li></ul>${bon}`;
  else if (bi === "D_issue_entretien") h += `<h4>Défauts d'entretien ou d'usure.</h4><p>Le SPANC formule des recommandations, sans délai imposé : ce n'est pas une non-conformité. Vous pouvez en tenir compte dans la négociation.</p>`;
  else if (bi === "D_issue_absence") h += `<h4>Absence d'installation.</h4><p>C'est un cas à part : la maison doit être équipée au plus vite. Le SPANC peut mettre le propriétaire en demeure de réaliser une installation conforme. Renseignez-vous auprès de lui et de votre notaire avant de fixer le prix et la date de signature.</p>${bon}`;
  else if (bi === "D_issue_conforme") h += `<h4>Installation conforme.</h4><p>Aucun travail n'est exigé au titre de la vente.${va.verdict === "A_expire" ? " Ce constat date de l'ancien rapport : le nouveau contrôle pourra conclure autrement." : ""}</p>`;
  else if (bi === "D_issue_inconnue") h += `<h4>Selon la conclusion du rapport.</h4><ul><li><strong>Non conforme</strong> (travaux obligatoires) : travaux au plus tard ${delai} an après la vente, faits par le vendeur avant la vente ou, sinon, par l'acheteur une fois propriétaire.</li><li><strong>Défauts d'entretien ou d'usure</strong> : recommandations, sans délai imposé.</li><li><strong>Absence d'installation</strong> : cas à part, il faut s'équiper au plus vite.</li></ul>`;
  if (bi) h += `<p><small><em>Chaque vente est particulière : pour savoir précisément ce que prévoit votre promesse ou votre acte de vente, demandez conseil à votre notaire. Pour le contenu de votre rapport et les délais, contactez votre SPANC.</em></small></p>`;
  const etapes = [];
  const nomS = ev.spanc && ev.es !== "E7" ? ev.spanc.nom : "votre SPANC";
  if (["A_non", "A_expire", "A_sans_date"].includes(va.verdict)) {
    etapes.push(`Contactez ${esc(nomS)} pour fixer la visite. Prévoyez un accès dégagé aux regards et à la fosse.`);
    etapes.push(`Préparez la visite : plans, factures, bons de vidange. → <a href="${CFG.urls.checklist}#vendeur" data-cta="checklist_page">Checklist, section Vendeur</a>`);
  }
  if (va.verdict === "A_valable") etapes.push("Transmettez le rapport à votre notaire ou à votre agent pour qu'il soit joint au dossier de diagnostic technique.");
  if (etapes.length) h += `<ol>${etapes.slice(0, 2).map((e) => `<li>${e}</li>`).join("")}</ol>`;
  h += `<p>${CFG.urls.checklist_pdf ? `<a class="bouton2" href="${CFG.urls.checklist_pdf}" data-cta="checklist_pdf">Télécharger la checklist vente / achat (PDF gratuit, sans inscription)</a> · ` : ""}<a href="${CFG.urls.rapport_non_conforme}" data-cta="non_conformite">Rapport non conforme : quelles conséquences pour la vente ?</a></p>`;
  // CTA rappel e-mail : désactivé (config.json ctas.rappel_email.actif = false). CTA annuaire : liste préfectorale non lue -> masqué.
  return h + "</section>";
}

function rendre() {
  const zone = q("[data-resultat]");
  if (!etat.commune) { zone.innerHTML = ""; return; }
  const ex = etat.ex, REG = ex.reglementation, ev = evaluerCourant();
  const va = validite({ aUnRapport: etat.aUnRapport, dateRapport: etat.dateRapport, moisSeul: etat.moisSeul, dateActe: etat.dateActe, aujourdhui: aujourdhuiUTC(), V: REG.validite_rapport_vente_ans.valeur });
  zone.innerHTML = carteA(va, REG) + carteB(ev, REG) + carteC(ev) + (va.verdict ? carteD(va, ev, REG) : "");
  if (!etat.resultatVu && va.verdict) { etat.resultatVu = true; suivre("simu_resultat", { verdict: va.verdict, date_acte_saisie: !!etat.dateActe, mois_seul: etat.moisSeul, issue_rapport: etat.issue, etat_tarif: ev.et.etat, dep: etat.commune.dep }); }
}

// ---------- Événements ----------
function lireDates() {
  const msgR = q("[data-msg-rapport]"), msgA = q("[data-msg-acte]"), auj = aujourdhuiUTC();
  msgR.textContent = msgA.textContent = "";
  const vr = q("#simu-date-rapport").value; etat.moisSeul = false; etat.dateRapport = null;
  if (vr) {
    const d = isoVersDate(vr);
    if (d > auj) msgR.textContent = "Cette date est dans le futur. Indiquez la date de la visite déjà réalisée.";
    else { etat.dateRapport = d; etat.moisSeul = q("#simu-mois-seul").checked; }
  }
  const va = q("#simu-date-acte").value; etat.dateActe = null;
  if (va) { const d = isoVersDate(va); if (d < auj) msgA.textContent = "Cette date est déjà passée. Indiquez la date prévue de signature."; else etat.dateActe = d; }
}

function init() {
  racine.hidden = false;
  racine.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
  q("#simu-commune").addEventListener("input", proposer);
  for (const r of racine.querySelectorAll("input[name=rapport]")) r.addEventListener("change", () => {
    etat.aUnRapport = r.value; q("[data-bloc-date]").hidden = r.value !== "oui_date"; q("[data-bloc-issue]").hidden = r.value === "non";
    suivre("simu_rapport_repondu", { a_un_rapport: r.value }); rendre();
  });
  q("#simu-issue").addEventListener("change", (e) => { etat.issue = e.target.value; suivre("simu_issue_repondue", { issue_rapport: etat.issue }); rendre(); });
  for (const id of ["#simu-date-rapport", "#simu-mois-seul", "#simu-date-acte"]) q(id).addEventListener("change", () => { lireDates(); rendre(); });
  racine.addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    if (a.dataset.cta) suivre("simu_cta_clic", { cta: a.dataset.cta });
    if (a.dataset.contact) suivre("simu_contact_spanc_clic", { canal: a.dataset.contact });
  });
  suivre("simu_vue", {});
  charger();
}
init();
