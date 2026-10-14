import type { ClientModeles } from "@/ai/client";
import { requetePlan, requeteRecherche, type PageLue, type ResultatRecherche } from "@/ai/requetes";
import { lirePlan, lireTour, type CandidatExtrait, type RequetePlan } from "@/ai/sorties";
import type { Brief } from "@/prototype/brief";
import { CandidatSchema, type Candidat, type TypeCreneau } from "@/prototype/candidat";
import type { ConfigRecherche, Routage } from "@/prototype/config";
import { urlNormalisee, type LecteurPages, type RaisonRefusPage } from "@/research/fetch-page";
import { LONGUEURS_RESULTAT, nettoyerRequeteWeb, type ClientRechercheWeb } from "@/research/recherche-web";
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

/**
 * Écritures sans espace entre les mots (Han, hiragana, katakana, thaï, lao, khmer, birman), détectées par propriété
 * Unicode d'écriture. `Script_Extensions` plutôt que `Script` : il inclut les caractères partagés par ces écritures (la
 * marque d'allongement « ー », de script `Common`, appartient aux extensions hiragana et katakana).
 */
const CLASSE_SANS_ESPACE =
  "\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Thai}\\p{scx=Lao}\\p{scx=Khmer}\\p{scx=Myanmar}";
const SANS_ESPACE = new RegExp(`[${CLASSE_SANS_ESPACE}]`, "u");
const HORS_SANS_ESPACE = new RegExp(`[^${CLASSE_SANS_ESPACE}]+`, "gu");
const SUITES_SANS_ESPACE = new RegExp(`[${CLASSE_SANS_ESPACE}]+`, "gu");
/** Écritures idéographiques ou syllabiques (chinois, japonais) : un ou deux caractères y forment déjà un mot. */
const IDEOGRAPHIQUE = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u;

/** Caractères d'écriture sans espace d'un texte normalisé, mis bout à bout (le reste, espaces comprises, est retiré). */
function compactSansEspace(texte: string): string {
  return texte.replace(HORS_SANS_ESPACE, "");
}

/** Le mot `fragment` (écriture à espaces) figure en entier dans la requête normalisée. */
function contientMots(requete: string, fragment: string): boolean {
  return ` ${requete} `.includes(` ${fragment} `);
}

/** Fenêtres de `taille` caractères consécutifs (points de code) d'un texte ; le texte entier s'il est plus court. */
function fenetres(texte: string, taille: number): string[] {
  const caracteres = [...texte];
  if (caracteres.length <= taille) return [texte];
  const resultat: string[] = [];
  for (let debut = 0; debut + taille <= caracteres.length; debut += 1) resultat.push(caracteres.slice(debut, debut + taille).join(""));
  return resultat;
}

/**
 * Longueur minimale (en caractères) d'un mot de logement ou de libellé d'engagement, en écriture à espaces, traité
 * seul comme fragment. 3 (mineur 3a du head `3254723`) : « Hôtel du Lac » protège « lac ». Les mots de 1 ou 2
 * caractères (« du », « 12 ») ne sont pas protégés seuls quand le texte en a d'autres (limite).
 */
export const LONGUEUR_FRAGMENT_MIN = 3;

/**
 * Fenêtre des fragments d'un logement ou d'un libellé dans une écriture sans espace : 2 caractères consécutifs en
 * chinois et en japonais (un nom de lieu y tient en 2 ou 3 caractères : « 新宿 »), 4 en thaï, lao, khmer et birman
 * (alphasyllabaires : 2 lettres n'y font pas un mot). Mineur 3c du head `3254723`.
 */
export const FENETRE_FRAGMENT_IDEOGRAMMES = 2;
export const FENETRE_FRAGMENT_ALPHASYLLABAIRES = 4;

/** Nombre de mots consécutifs du récit libre qui suffit à refuser une requête (récit plus court : comparé en entier). */
export const MOTS_RECIT_FENETRE = 4;

/**
 * Nombre de caractères consécutifs d'un récit en écriture sans espace qui suffit à refuser une requête (bloquant 1 du
 * head `3254723`, option a). Dans ces écritures, le découpage en mots par les espaces ne fonctionne pas (un récit sans
 * espace serait un seul « mot ») ; on fenêtre donc par caractères. 8 : un mot chinois ou japonais compte en moyenne
 * 1,5 à 2,5 caractères, 8 caractères en font 3 à 5, soit l'équivalent de la fenêtre de `MOTS_RECIT_FENETRE` mots ; en
 * thaï (marques retirées par la normalisation, 3 à 5 lettres par mot), c'est 2 mots environ, plus strict. Au plus 7
 * caractères consécutifs du récit peuvent donc partir ; moins aurait refusé les noms de lieux et d'activités usuels.
 */
export const FENETRE_RECIT_CARACTERES = 8;

type Fragments = { mots: string[]; suites: string[] };

/**
 * Fragments d'un texte protégé (logement ou libellé d'engagement), hors mots de la destination et du pays :
 * - `mots` (écriture à espaces) : ses mots normalisés de `LONGUEUR_FRAGMENT_MIN` caractères ou plus, cherchés comme mots
 *   entiers ; si aucun ne l'atteint (tous les mots hors lieu font moins de 3 caractères : « Le 12 »), la suite de ces
 *   mots hors lieu, comparée en entier (repli, mineur 3b : jamais la phrase lieu compris) ;
 * - `suites` (écriture sans espace) : chaque suite de caractères de ces écritures, privée des noms de la destination et
 *   du pays qu'elle contient, découpée en fenêtres (`FENETRE_FRAGMENT_IDEOGRAMMES` ou `_ALPHASYLLABAIRES`) ; un morceau
 *   plus court que la fenêtre compte en entier s'il a 2 caractères ou plus. Cherchées dans les caractères sans espace
 *   de la requête mis bout à bout (une espace insérée ne les cache pas).
 * `undefined` : texte vide après normalisation. Aucun fragment : le texte ne contient que la destination et le pays.
 */
function fragmentsProteges(texte: string, motsLieu: ReadonlySet<string>): Fragments | undefined {
  const normalise = cleRequete(texte);
  if (normalise === "") return undefined;
  const lieuxSansEspace = [...motsLieu].map(compactSansEspace).filter((lieu) => lieu !== "");
  const horsLieu = normalise
    .replace(SUITES_SANS_ESPACE, " ")
    .split(" ")
    .filter((mot) => mot !== "" && !motsLieu.has(mot));
  const mots = horsLieu.filter((mot) => [...mot].length >= LONGUEUR_FRAGMENT_MIN);
  if (mots.length === 0 && horsLieu.length > 0) mots.push(horsLieu.join(" "));
  const suites: string[] = [];
  const courts: string[] = [];
  for (const suite of normalise.match(SUITES_SANS_ESPACE) ?? []) {
    const morceaux = lieuxSansEspace.reduce((acc, lieu) => acc.flatMap((m) => m.split(lieu)), [suite]).filter((m) => m !== "");
    for (const morceau of morceaux) {
      const taille = IDEOGRAPHIQUE.test(morceau) ? FENETRE_FRAGMENT_IDEOGRAMMES : FENETRE_FRAGMENT_ALPHASYLLABAIRES;
      if ([...morceau].length >= 2) suites.push(...fenetres(morceau, taille));
      else courts.push(morceau);
    }
  }
  // Repli : une écriture sans espace dont il ne reste que des caractères isolés est comparée en entier.
  if (suites.length === 0 && courts.length > 0) suites.push(courts.join(""));
  return { mots, suites };
}

/**
 * Requête de recherche web admise au regard du brief (PR 326, bloquant 1d et corrections 1 à 3 : la requête part
 * chez le moteur de recherche du fournisseur, Exa, hors du réglage `data_collection: "deny"`). Filet de sécurité :
 * depuis la correction 2, le modèle de l'étape de recherche ne voit ni les logements ni les engagements
 * (`briefPourRecherche`). La requête est jugée telle qu'elle part (`nettoyerRequeteWeb` appliquée avant). Refusée :
 * - si un texte de logement ou un libellé d'engagement devient vide après normalisation (protection impossible) ;
 * - dès qu'un fragment d'un logement ou d'un libellé y apparaît (`fragmentsProteges`) ;
 * - écriture à espaces : si elle contient `MOTS_RECIT_FENETRE` mots consécutifs du récit libre, ou le récit entier
 *   s'il est plus court (récit vide après normalisation : refusée) ;
 * - écriture sans espace (chinois, japonais, thaï, lao, khmer, birman) : si ses caractères de ces écritures, mis bout à
 *   bout, contiennent `FENETRE_RECIT_CARACTERES` caractères consécutifs de ceux du récit (également mis bout à bout,
 *   ponctuation et espaces retirées), ou tous ceux du récit s'il en a moins et n'a pas d'autre mot.
 * Limites (description de la PR 326, question Q427) : le modèle voit toujours le récit libre ; une requête peut en
 * reprendre jusqu'à `MOTS_RECIT_FENETRE - 1` mots consécutifs (écriture à espaces) ou `FENETRE_RECIT_CARACTERES - 1`
 * caractères consécutifs (écriture sans espace), ou des mots épars. Logements et libellés : un mot de 1 ou 2 caractères
 * n'est pas protégé seul quand le texte en a d'autres ; un texte dont tous les mots hors lieu font moins de
 * `LONGUEUR_FRAGMENT_MIN` caractères est comparé en entier (ces mots, dans l'ordre). Seul appelant du moteur de
 * recherche web : cet agent (la composition `p0-reel` n'a pas le brief ; voir `src/ai/recherche-web-reelle.ts`).
 */
export function requeteSansDonneeDuBrief(requete: string, brief: Brief): boolean {
  const texte = cleRequete(requete);
  const texteSansEspace = compactSansEspace(texte);
  // Mots de la requête en écriture à espaces, séparés de toute suite sans espace collée (« 新宿hotel »).
  const texteMots = texte.replace(SUITES_SANS_ESPACE, " ").replace(/ +/g, " ").trim();
  const motsLieu = new Set(`${cleRequete(brief.destination)} ${cleRequete(brief.pays)}`.split(" ").filter((mot) => mot !== ""));
  const proteges = [...brief.logements.map((l) => l.texte), ...(brief.engagements ?? []).map((e) => e.libelle)];
  for (const protege of proteges) {
    const fragments = fragmentsProteges(protege, motsLieu);
    if (fragments === undefined) return false;
    if (fragments.mots.some((mot) => contientMots(texteMots, mot))) return false;
    if (fragments.suites.some((suite) => texteSansEspace.includes(suite))) return false;
  }
  if (brief.recit !== undefined) {
    const normalise = cleRequete(brief.recit);
    if (normalise === "") return false;
    const mots = normalise.split(" ");
    const fenetre = Math.min(MOTS_RECIT_FENETRE, mots.length);
    for (let debut = 0; debut + fenetre <= mots.length; debut += 1) {
      const extrait = mots.slice(debut, debut + fenetre).join(" ");
      if (SANS_ESPACE.test(extrait) ? texte.includes(extrait) : contientMots(texte, extrait)) return false;
    }
    const recitSansEspace = compactSansEspace(normalise);
    const autresMots = normalise.replace(SUITES_SANS_ESPACE, " ").trim() !== "";
    if (recitSansEspace !== "" && ([...recitSansEspace].length >= FENETRE_RECIT_CARACTERES || !autresMots)) {
      if (fenetres(recitSansEspace, FENETRE_RECIT_CARACTERES).some((extrait) => texteSansEspace.includes(extrait))) return false;
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
        // Mineur 4 du head `3254723` : nettoyée d'abord, la requête est jugée telle qu'elle part (longueur déjà bornée
        // à `LONGUEURS_TEXTE.requete` par le schéma des sorties, la même borne que le client réel).
        const requete = nettoyerRequeteWeb(action.requete);
        if (!requeteSansDonneeDuBrief(requete, brief)) {
          compteurs.sortiesRefusees.recherche += 1;
          continue;
        }
        compteurs.recherches += 1;
        const { resultats: trouvesWeb } = await dependances.recherche.rechercher(requete);
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
