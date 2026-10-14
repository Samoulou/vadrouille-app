import type { ClientModeles } from "@/ai/client";
import { requetePlan, requeteRecherche, type PageLue, type ResultatRecherche } from "@/ai/requetes";
import { lirePlan, lireTour, type CandidatExtrait, type RequetePlan } from "@/ai/sorties";
import type { Brief } from "@/prototype/brief";
import { CandidatSchema, type Candidat, type TypeCreneau } from "@/prototype/candidat";
import type { ConfigRecherche, Routage } from "@/prototype/config";
import { urlNormalisee, type LecteurPages, type RaisonRefusPage } from "@/research/fetch-page";
import { LONGUEURS_RESULTAT, type ClientRechercheWeb } from "@/research/recherche-web";
import { classerSource, dateMentionnee } from "@/research/sources";

/**
 * Agent de recherche borné (spécification P0, étapes 2 et 3 ; P0-PO-4). Le modèle propose des recherches, des
 * lectures et des candidats ; **le code décide** :
 * - seules les URL des résultats de recherche de l'exécution peuvent être lues (`not_in_search_results`) ;
 * - un candidat n'est retenu que si sa source figure parmi ces résultats (une URL inventée ou soufflée par une page
 *   ne passe pas) ; son identifiant interne est attribué par le code ;
 * - l'arrêt se fait sur le nombre de candidats **trouvés** (cibles par créneau, total), sur `termine`, sur le
 *   nombre de tours, ou sur un plafond (erreur levée par un décorateur du script) ;
 * - les doublons sont fusionnés avant l'ancrage.
 * L'agent ne reçoit **aucun** résultat d'ancrage : il tourne une seule fois, avant l'ancrage (contrainte 7).
 */

export type CompteursAgent = {
  tours: number;
  recherches: number;
  pagesLues: number;
  pagesRefusees: Partial<Record<RaisonRefusPage, number>>;
  sortiesRefusees: { plan: number; recherche: number };
  candidatsRefuses: { source_not_in_results: number; duplicate: number; over_total: number; invalid: number };
};

export type DependancesAgent = {
  modeles: ClientModeles;
  modele: string;
  routage: Routage;
  recherche: ClientRechercheWeb;
  lecteur: LecteurPages;
  config: ConfigRecherche;
};

/** Créneau visé par un candidat trouvé (cibles de `recherche.json`). */
export function creneauDe(typeEtape: Candidat["typeEtape"]): TypeCreneau {
  if (typeEtape === "meal") return "meal";
  if (typeEtape === "event") return "evening";
  return "activity";
}

function cle(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Texte comparable pour le filtre des requêtes web, quelle que soit l'écriture : compatibilité Unicode (NFKD), marques
 * diacritiques retirées, minuscules ; tout ce qui n'est ni lettre ni chiffre (`\p{L}`, `\p{N}`) devient une espace.
 */
function cleRequete(texte: string): string {
  return texte
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Écritures sans espace entre les mots : un fragment s'y cherche comme sous-chaîne, pas comme mot. */
const SANS_ESPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function contient(requete: string, fragment: string): boolean {
  return SANS_ESPACE.test(fragment) ? requete.includes(fragment) : ` ${requete} `.includes(` ${fragment} `);
}

/** Longueur minimale (en caractères) d'un mot de logement ou de libellé d'engagement traité comme fragment. */
export const LONGUEUR_FRAGMENT_MIN = 4;

/** Nombre de mots consécutifs du récit libre qui suffit à refuser une requête (récit plus court : comparé en entier). */
export const MOTS_RECIT_FENETRE = 4;

/**
 * Fragments d'un texte protégé (logement ou libellé d'engagement) : ses mots normalisés de `LONGUEUR_FRAGMENT_MIN`
 * caractères ou plus, hors mots de la destination et du pays ; dans une écriture sans espace, le mot privé des mots de
 * la destination et du pays qu'il contient. Sans aucun fragment, le texte normalisé entier, sauf s'il ne contient que
 * des mots de la destination et du pays (rien à protéger). `undefined` : texte vide après normalisation.
 */
function fragmentsProteges(texte: string, motsLieu: ReadonlySet<string>): string[] | undefined {
  const normalise = cleRequete(texte);
  if (normalise === "") return undefined;
  const fragments: string[] = [];
  let significatif = false;
  for (const mot of normalise.split(" ")) {
    if (motsLieu.has(mot)) continue;
    significatif = true;
    const parties = SANS_ESPACE.test(mot)
      ? [...motsLieu].filter((lieu) => lieu !== "").reduce((morceaux, lieu) => morceaux.flatMap((m) => m.split(lieu)), [mot])
      : [mot];
    for (const partie of parties) if ([...partie].length >= LONGUEUR_FRAGMENT_MIN) fragments.push(partie);
  }
  if (!significatif) return [];
  return fragments.length > 0 ? fragments : [normalise];
}

/**
 * Requête de recherche web admise au regard du brief (PR 326, bloquant 1d et corrections 1 et 2 : la requête part
 * chez le moteur de recherche du fournisseur, Exa, hors du réglage `data_collection: "deny"`). Filet de sécurité :
 * depuis la correction 2, le modèle de l'étape de recherche ne voit ni les logements ni les engagements
 * (`briefPourRecherche`). Refusée :
 * - si un texte de logement ou un libellé d'engagement devient vide après normalisation (protection impossible) ;
 * - dès qu'un fragment d'un logement ou d'un libellé y apparaît (`fragmentsProteges`) ;
 * - si elle contient `MOTS_RECIT_FENETRE` mots consécutifs du récit libre, ou le récit entier s'il est plus court
 *   (récit vide après normalisation : refusée).
 * Limites : le modèle voit toujours le récit libre ; une requête peut en reprendre jusqu'à `MOTS_RECIT_FENETRE - 1`
 * mots consécutifs, ou des mots épars. Dans une écriture sans espace (chinois, japonais, thaï…), un récit ou un mot de
 * logement n'est reconnu qu'en entier (ou privé du nom de la destination), pas par morceau. Seul appelant du
 * moteur de recherche web : cet agent (la composition `p0-reel` n'a pas le brief ; voir `src/ai/recherche-web-reelle.ts`).
 */
export function requeteSansDonneeDuBrief(requete: string, brief: Brief): boolean {
  const texte = cleRequete(requete);
  const motsLieu = new Set(`${cleRequete(brief.destination)} ${cleRequete(brief.pays)}`.split(" ").filter((mot) => mot !== ""));
  const proteges = [...brief.logements.map((l) => l.texte), ...(brief.engagements ?? []).map((e) => e.libelle)];
  for (const protege of proteges) {
    const fragments = fragmentsProteges(protege, motsLieu);
    if (fragments === undefined) return false;
    if (fragments.some((fragment) => contient(texte, fragment))) return false;
  }
  if (brief.recit !== undefined) {
    const normalise = cleRequete(brief.recit);
    if (normalise === "") return false;
    const mots = normalise.split(" ");
    const fenetre = Math.min(MOTS_RECIT_FENETRE, mots.length);
    for (let debut = 0; debut + fenetre <= mots.length; debut += 1) {
      if (contient(texte, mots.slice(debut, debut + fenetre).join(" "))) return false;
    }
  }
  return true;
}

function borner(texte: string, max: number): string {
  return texte.replace(/[\p{Cc}\p{Cf}]/gu, " ").slice(0, max);
}

export async function chercherCandidats(
  brief: Brief,
  dependances: DependancesAgent,
): Promise<{ candidats: Candidat[]; compteurs: CompteursAgent }> {
  const { config } = dependances;
  const compteurs: CompteursAgent = {
    tours: 0,
    recherches: 0,
    pagesLues: 0,
    pagesRefusees: {},
    sortiesRefusees: { plan: 0, recherche: 0 },
    candidatsRefuses: { source_not_in_results: 0, duplicate: 0, over_total: 0, invalid: 0 },
  };

  // Étape 2 : plan de recherche, à partir du brief seul.
  const reponsePlan = await dependances.modeles.envoyer(requetePlan(brief, dependances.modele, dependances.routage));
  const plan = lirePlan(reponsePlan.texte);
  compteurs.sortiesRefusees.plan += plan.refuses;
  const requetesPlan: RequetePlan[] = plan.valeur;

  const urlsVues = new Set<string>();
  const pagesTexte = new Map<string, string>();
  const candidats: Candidat[] = [];
  const cles = new Set<string>();
  const trouves: Record<TypeCreneau, number> = { activity: 0, meal: 0, evening: 0 };
  let resultats: ResultatRecherche[] = [];
  let pages: PageLue[] = [];

  const ciblesAtteintes = () =>
    candidats.length >= config.totalCandidats ||
    (trouves.activity >= config.ciblesParCreneau.activity &&
      trouves.meal >= config.ciblesParCreneau.meal &&
      trouves.evening >= config.ciblesParCreneau.evening);

  const accueillir = (extrait: CandidatExtrait) => {
    const source = urlNormalisee(extrait.sourceUrl);
    if (source === undefined || !urlsVues.has(source)) {
      compteurs.candidatsRefuses.source_not_in_results += 1;
      return;
    }
    const k = cle(extrait.nom);
    if (cles.has(k)) {
      compteurs.candidatsRefuses.duplicate += 1;
      return;
    }
    if (candidats.length >= config.totalCandidats) {
      compteurs.candidatsRefuses.over_total += 1;
      return;
    }
    const texte = pagesTexte.get(source);
    const resultat = CandidatSchema.safeParse({
      id: `c_${String(candidats.length + 1).padStart(3, "0")}`,
      nom: extrait.nom,
      resume: extrait.resume,
      categorie: extrait.categorie,
      typeEtape: extrait.typeEtape,
      source: { url: source, date: extrait.sourceDate, classe: classerSource(source) },
      ...(extrait.evenement === undefined
        ? {}
        : {
            evenement: {
              ...extrait.evenement,
              dateConfirmee: texte !== undefined && dateMentionnee(texte, extrait.evenement.date),
            },
          }),
      aReserver: extrait.aReserver,
      ...(extrait.prixParPersonne === undefined ? {} : { prixParPersonne: extrait.prixParPersonne }),
      ...(extrait.dureeMinutes === undefined ? {} : { dureeMinutes: extrait.dureeMinutes }),
    });
    if (!resultat.success) {
      compteurs.candidatsRefuses.invalid += 1;
      return;
    }
    cles.add(k);
    candidats.push(resultat.data);
    const creneau = creneauDe(resultat.data.typeEtape);
    if (creneau === "activity") trouves.activity += 1;
    else if (creneau === "meal") trouves.meal += 1;
    else trouves.evening += 1;
  };

  // Étape 3 : tours de l'agent, bornés.
  for (let tour = 1; tour <= config.toursMax && !ciblesAtteintes(); tour += 1) {
    compteurs.tours += 1;
    const manquants: Record<TypeCreneau, number> = {
      activity: Math.max(0, config.ciblesParCreneau.activity - trouves.activity),
      meal: Math.max(0, config.ciblesParCreneau.meal - trouves.meal),
      evening: Math.max(0, config.ciblesParCreneau.evening - trouves.evening),
    };
    const reponse = await dependances.modeles.envoyer(
      requeteRecherche(
        {
          brief,
          tour,
          plan: requetesPlan,
          resultats,
          pages,
          dejaTrouves: candidats.map((candidat) => candidat.nom),
          manquants,
        },
        dependances.modele,
        dependances.routage,
      ),
    );
    const lecture = lireTour(reponse.texte);
    compteurs.sortiesRefusees.recherche += lecture.refuses;
    for (const extrait of lecture.valeur.candidats) accueillir(extrait);
    if (lecture.valeur.termine || ciblesAtteintes()) break;

    resultats = [];
    pages = [];
    for (const action of lecture.valeur.actions) {
      if (action.type === "rechercher") {
        // PR 326 (bloquant 1d, corrections 1 et 2) : aucune donnée de logement ni texte libre du brief dans une requête web.
        if (!requeteSansDonneeDuBrief(action.requete, brief)) {
          compteurs.sortiesRefusees.recherche += 1;
          continue;
        }
        compteurs.recherches += 1;
        const { resultats: trouvesWeb } = await dependances.recherche.rechercher(action.requete);
        for (const resultat of trouvesWeb) {
          const url = urlNormalisee(resultat.url);
          if (url === undefined) continue;
          urlsVues.add(url);
          resultats.push({
            url,
            titre: borner(resultat.titre, LONGUEURS_RESULTAT.titre),
            extrait: borner(resultat.extrait, LONGUEURS_RESULTAT.extrait),
          });
        }
      } else {
        const lue = await dependances.lecteur.lire(action.url, urlsVues);
        if (lue.ok) {
          compteurs.pagesLues += 1;
          const url = urlNormalisee(action.url) as string;
          pagesTexte.set(url, lue.texte);
          pages.push({ url, texte: lue.texte.slice(0, 4000) });
        } else {
          const deja = new Map(Object.entries(compteurs.pagesRefusees)).get(lue.raison) ?? 0;
          compteurs.pagesRefusees = { ...compteurs.pagesRefusees, [lue.raison]: deja + 1 };
        }
      }
    }
  }
  return { candidats, compteurs };
}
