import type { TypeCreneau } from "@/ai/candidat";
import type { ClientModeles } from "@/ai/client";
import type { EntreeModeles } from "@/ai/entrees";
import { LONGUEURS_RESULTAT, nettoyerRequeteWeb, type ClientRechercheWeb, type ResultatWeb } from "@/ai/recherche-web";
import type { Routage } from "@/ai/reglages";
import { requetePlan, requeteRecherche, type PageLue } from "@/ai/requetes";
import { lirePlan, lireTour, type CandidatExtrait, type RequetePlan } from "@/ai/sorties";
import type { BornesRecherche } from "@/research/bornes";
import { CandidatRechercheSchema, type CandidatRecherche } from "@/research/candidat";
import { urlNormalisee, type LecteurPages, type RaisonRefusPage } from "@/research/fetch-page";
import { classerSource, dateMentionnee } from "@/research/sources";

/**
 * Agent de recherche borné (spécification P0, étapes 2 et 3 ; P0-PO-4). Le modèle propose des recherches, des
 * lectures et des candidats ; **le code décide** :
 * - seules les URL des résultats de recherche de l'exécution peuvent être lues (`not_in_search_results`) ;
 * - un candidat n'est retenu que si sa source figure parmi ces résultats (une URL inventée ou soufflée par une page
 *   ne passe pas) ; son identifiant interne est attribué par le code ;
 * - l'arrêt se fait sur le nombre de candidats **trouvés** (cibles par créneau, total), sur `termine`, sur le
 *   nombre de tours, sur l'échéance de l'étape (`peutAppeler`, ticket 407 : fin propre, candidats admis gardés), ou sur
 *   un plafond (erreur levée par un décorateur du script) ; `termine` n'est suivi qu'après au
 *   moins une recherche web (ticket 400 : avant, aucun candidat ne peut avoir de source admise), et une sortie illisible
 *   ne termine pas la boucle (le tour suivant redemande) ;
 * - les doublons sont fusionnés avant l'ancrage.
 * L'agent ne reçoit **aucun** résultat d'ancrage : il tourne une seule fois, avant l'ancrage (contrainte 7).
 */

export type CompteursAgent = {
  tours: number;
  recherches: number;
  pagesLues: number;
  pagesRefusees: Partial<Record<RaisonRefusPage, number>>;
  sortiesRefusees: { plan: number; recherche: number };
  /** Réponses refusées en entier (aucun objet JSON de la forme attendue), parmi `sortiesRefusees` (ticket 400). */
  sortiesIllisibles: { plan: number; recherche: number };
  /** Tours où le modèle a rendu `termine` avant toute recherche web : ignoré, la boucle continue (ticket 400). */
  terminesIgnores: number;
  /** Réponses de modèle finies autrement que par `stop` (longueur, filtre, erreur…), quand le client la rend. */
  finsAnormales: number;
  candidatsRefuses: { source_not_in_results: number; duplicate: number; over_total: number; invalid: number };
  /**
   * Fins de la recherche sur l'échéance de l'étape (ticket 407) : `peutAppeler` a répondu non avant un appel ; la boucle
   * s'est terminée avec les candidats déjà admis. 0 ou 1.
   */
  finsEcheance: number;
};

/**
 * Appel externe que l'agent s'apprête à faire (ticket 407) : appel de modèle (plan ou tour), recherche web (elle aussi
 * un appel de modèle chez le fournisseur, `src/ai/recherche-web-reelle.ts`), lecture de page.
 */
export type AppelAgent = "modele" | "recherche_web" | "page";

/**
 * Vérification d'échéance à remettre à l'agent (`DependancesAgent.peutAppeler`, ticket 407) : l'appel tient-il avant
 * l'échéance de l'étape, délai complet compris, plus une marge ? Appel de modèle et recherche web prennent le délai d'un
 * appel de modèle (`delais.modele`), une lecture de page le sien (`delais.page`). Fonction pure : l'horloge est passée.
 */
export function tempsPourAppel(
  echeance: number,
  delais: { readonly modele: number; readonly page: number; readonly marge: number },
  maintenant: () => number = Date.now,
): (appel: AppelAgent) => boolean {
  return (appel) => maintenant() + (appel === "page" ? delais.page : delais.modele) + delais.marge <= echeance;
}

/** État vivant de l'agent, remis à l'appelant au départ : ce qu'il a compté et admis, lisible même si la recherche lève. */
export type EtatAgent = { readonly compteurs: CompteursAgent; readonly candidats: readonly CandidatRecherche[] };

export type DependancesAgent = {
  modeles: ClientModeles;
  modele: string;
  routage: Routage;
  recherche: ClientRechercheWeb;
  lecteur: LecteurPages;
  /** Bornes de la recherche (B7a, `src/research/bornes.ts`) ; `delaiMs` n'est pas lu ici (échéance : `peutAppeler`). */
  bornes: BornesRecherche;
  /**
   * Récit et logements de P0 (`ComplementP0`, décision 0077 § 1 point 5), passés seulement par `pnpm p0` et `p0Run` ;
   * son type est celui du dernier paramètre de `requetePlan` (`src/research` n'importe pas `@/ai/complement-p0`).
   */
  complement?: Parameters<typeof requetePlan>[3];
  /**
   * Textes que les requêtes web ne doivent jamais reprendre (`requeteSansDonneeDuBrief`), en plus de ceux que l'agent
   * déduit toujours lui-même (`ensemblesProteges` : destination, pays, et récit et logements de `complement`). Défaut
   * fermé (revue du head `5a955f8`, bloquant 1) : `complement` sans `protegees` protège quand même son récit et ses
   * logements ; `protegees` n'ajoute que ce que le complément ne porte pas (libellés d'engagements de P0).
   */
  protegees?: DonneesProtegees;
  /**
   * Reste-t-il assez de temps avant l'échéance de l'étape pour cet appel, délai complet compris (ticket 407) ? Demandé
   * avant chaque appel de modèle, chaque recherche web et chaque lecture de page ; non : la boucle se termine
   * proprement avec les candidats déjà admis (`finsEcheance`), sans appel ni erreur. Absent : pas d'échéance (mode
   * simulé, `scripts/p0`).
   */
  peutAppeler?: (appel: AppelAgent) => boolean;
  /** Reçoit l'état vivant de l'agent au départ (ticket 407 : compteurs journalisés même si la recherche lève). */
  observer?: (etat: EtatAgent) => void;
};

/**
 * Type d'étape ramené à un créneau, pour les **mesures** de `evals/` (`evaluation.ts`, candidats trouvés par créneau) : un
 * événement y compte en soirée. Les cibles de l'agent se comptent avec `creneauCompte` (ticket 483).
 */
export function creneauDe(typeEtape: CandidatRecherche["typeEtape"]): TypeCreneau {
  if (typeEtape === "meal") return "meal";
  if (typeEtape === "event") return "evening";
  return "activity";
}

/**
 * Créneau dont la cible compte un candidat admis (ticket 483), comme la planification remplit ses créneaux
 * (`admisPourCreneau`) : un repas compte en repas ; une activité compte en soirée si son `slotFit` (rendu par le modèle
 * de recherche) contient `evening` et que la soirée manque encore (ou que l'activité ne convient qu'au soir), sinon en
 * activité ; un événement ne compte dans aucun créneau (il va dans les événements du jour, jamais dans la soirée).
 */
export function creneauCompte(
  candidat: { readonly typeEtape: CandidatRecherche["typeEtape"]; readonly slotFit?: readonly TypeCreneau[] },
  soireeManquante: boolean,
): TypeCreneau | undefined {
  if (candidat.typeEtape === "meal") return "meal";
  if (candidat.typeEtape === "event") return undefined;
  const soir = candidat.slotFit?.includes("evening") === true;
  const jour = candidat.slotFit === undefined || candidat.slotFit.includes("activity");
  return soir && (soireeManquante || !jour) ? "evening" : "activity";
}

/** Clé de comparaison d'un nom (doublons de l'agent, mesures de `evals/`) : minuscules, sans accents ni ponctuation. */
export function cleDeNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Texte comparable pour le filtre des requêtes web, quelle que soit l'écriture : compatibilité Unicode (NFKD), marques
 * diacritiques retirées, recomposition (NFC : les syllabes hangul, décomposées en jamos par NFKD, redeviennent un
 * caractère chacune), minuscules ; tout ce qui n'est ni lettre ni chiffre (`\p{L}`, `\p{N}`) devient une espace.
 */
function cleRequete(texte: string): string {
  return texte
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Écritures sans espace entre les mots (Han, hiragana, katakana, thaï, lao, khmer, birman, javanais, balinais), et
 * hangul, souvent écrit ou tapé sans espace (mineur 3 du head `f06449c`), détectées par propriété Unicode d'écriture.
 * Liste fermée : une écriture absente (tai tham, n'ko…) est traitée comme une écriture à espaces (limite).
 * `Script_Extensions` plutôt que `Script` : il inclut les caractères partagés par ces écritures (la marque
 * d'allongement « ー », de script `Common`, appartient aux extensions hiragana et katakana).
 */
const CLASSE_SANS_ESPACE =
  "\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Thai}\\p{scx=Lao}\\p{scx=Khmer}\\p{scx=Myanmar}\\p{scx=Javanese}\\p{scx=Balinese}\\p{scx=Hangul}";
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
 * chinois et en japonais (un nom de lieu y tient en 2 ou 3 caractères : « 新宿 »), 4 en thaï, lao, khmer, birman,
 * javanais et balinais (alphasyllabaires : 2 lettres n'y font pas un mot) et en hangul (2 syllabes y sont souvent une
 * particule : « 에서 »). Mineur 3c du head `3254723`.
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
 * thaï (marques retirées par la normalisation, 3 à 5 lettres par mot), c'est 2 mots environ, plus strict ; en hangul
 * (syllabes recomposées, 2 à 4 par mot), 2 à 4 mots. Au plus 7 caractères consécutifs du récit peuvent donc partir ;
 * moins aurait refusé les noms de lieux et d'activités usuels.
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
 * Textes protégés d'une recherche (PR 326) : destination et pays (mots de lieu, admis dans une requête), logements,
 * libellés d'engagements et récit (refusés). Forme structurelle : le `Brief` de P0 la satisfait ; l'adaptateur de P0
 * (`src/server/p0/vers-couche-ia.ts`) la construit sans que `src/research` importe `src/prototype` (0077 § 1 point 7).
 */
export type DonneesProtegees = {
  readonly destination: string;
  readonly pays?: string;
  readonly logements?: readonly { readonly texte: string }[];
  readonly engagements?: readonly { readonly libelle: string }[];
  readonly recit?: string;
};

/**
 * Requête de recherche web admise au regard du brief (PR 326, bloquant 1d et corrections 1 à 3 : la requête part
 * chez le moteur de recherche du fournisseur, Exa, hors du réglage `data_collection: "deny"`). Filet de sécurité :
 * depuis la correction 2, le modèle de l'étape de recherche ne voit ni les logements ni les engagements
 * (`briefPourRecherche`). La requête est jugée telle qu'elle part (`nettoyerRequeteWeb` appliquée avant). Refusée :
 * - si un texte de logement ou un libellé d'engagement devient vide après normalisation (protection impossible) ;
 * - dès qu'un fragment d'un logement ou d'un libellé y apparaît (`fragmentsProteges`) ;
 * - écriture à espaces : si ses mots (suites sans espace retirées) contiennent `MOTS_RECIT_FENETRE` mots consécutifs
 *   des mots du récit libre (suites sans espace retirées de même), ou tous ces mots s'il en a moins (récit vide après
 *   normalisation : refusée) ;
 * - écriture sans espace (`CLASSE_SANS_ESPACE` : chinois, japonais, thaï, lao, khmer, birman, javanais, balinais,
 *   hangul) : si ses caractères de ces écritures, mis bout à bout, contiennent `FENETRE_RECIT_CARACTERES` caractères
 *   consécutifs de ceux du récit (également mis bout à bout, ponctuation et espaces retirées), ou tous ceux du récit
 *   s'il en a moins et n'a pas d'autre mot.
 * Les deux règles s'appliquent à tout récit, y compris mêlant les deux sortes d'écriture (« 東京hotel … »).
 * Limites (description de la PR 326, question Q427) : le modèle voit toujours le récit libre ; une requête peut en
 * reprendre jusqu'à `MOTS_RECIT_FENETRE - 1` mots consécutifs (écriture à espaces) ou `FENETRE_RECIT_CARACTERES - 1`
 * caractères consécutifs (écriture sans espace), ou des mots épars ; dans un récit mixte, une suite sans espace de
 * moins de `FENETRE_RECIT_CARACTERES` caractères n'est pas protégée (au plus 7 caractères, donc). Écritures hors de
 * `CLASSE_SANS_ESPACE` (tai tham, n'ko…) traitées comme écritures à espaces : un récit qui y est écrit sans espace
 * forme un seul « mot » et n'est protégé qu'en entier. Logements et libellés : un mot de 1 ou 2 caractères
 * n'est pas protégé seul quand le texte en a d'autres ; un texte dont tous les mots hors lieu font moins de
 * `LONGUEUR_FRAGMENT_MIN` caractères est comparé en entier (ces mots, dans l'ordre) ; un mot n'est reconnu qu'entier
 * (particules ou suffixes collés : « 롯데호텔에서 », turc, finnois, composés allemands). Seul appelant du moteur de
 * recherche web : cet agent (la composition `p0-reel` n'a pas le brief ; voir `src/ai/recherche-web-reelle.ts`).
 */
export function requeteSansDonneeDuBrief(requete: string, brief: DonneesProtegees): boolean {
  const texte = cleRequete(requete);
  const texteSansEspace = compactSansEspace(texte);
  // Mots de la requête en écriture à espaces, séparés de toute suite sans espace collée (« 新宿hotel »).
  const texteMots = texte.replace(SUITES_SANS_ESPACE, " ").replace(/ +/g, " ").trim();
  const motsLieu = new Set(`${cleRequete(brief.destination)} ${cleRequete(brief.pays ?? "")}`.split(" ").filter((mot) => mot !== ""));
  const proteges = [...(brief.logements ?? []).map((l) => l.texte), ...(brief.engagements ?? []).map((e) => e.libelle)];
  for (const protege of proteges) {
    const fragments = fragmentsProteges(protege, motsLieu);
    if (fragments === undefined) return false;
    if (fragments.mots.some((mot) => contientMots(texteMots, mot))) return false;
    if (fragments.suites.some((suite) => texteSansEspace.includes(suite))) return false;
  }
  if (brief.recit !== undefined) {
    const normalise = cleRequete(brief.recit);
    if (normalise === "") return false;
    // Mots du récit en écriture à espaces, séparés de toute suite sans espace collée (« 東京hotel ») et comparés aux
    // mots de la requête séparés de même (`texteMots`) : un caractère sans espace collé à un mot, d'un côté ou de
    // l'autre, ne cache pas l'extrait (bloquant tardif du head `f06449c`). Les suites sans espace du récit sont
    // couvertes par la fenêtre de caractères ci-dessous.
    const mots = normalise
      .replace(SUITES_SANS_ESPACE, " ")
      .split(" ")
      .filter((mot) => mot !== "");
    const fenetre = Math.min(MOTS_RECIT_FENETRE, mots.length);
    if (fenetre > 0) {
      for (let debut = 0; debut + fenetre <= mots.length; debut += 1) {
        if (contientMots(texteMots, mots.slice(debut, debut + fenetre).join(" "))) return false;
      }
    }
    const recitSansEspace = compactSansEspace(normalise);
    if (recitSansEspace !== "" && ([...recitSansEspace].length >= FENETRE_RECIT_CARACTERES || mots.length === 0)) {
      if (fenetres(recitSansEspace, FENETRE_RECIT_CARACTERES).some((extrait) => texteSansEspace.includes(extrait))) return false;
    }
  }
  return true;
}

/**
 * Ensembles de textes protégés de l'agent, jugés chacun par `requeteSansDonneeDuBrief` (une requête doit les passer
 * tous). Défaut fermé : le récit et les logements de `complement` sont **toujours** protégés, que l'appelant passe
 * `protegees` ou non ; destination et pays (mots de lieu admis) viennent de `protegees`, sinon de l'entrée.
 */
export function ensemblesProteges(
  entree: Pick<EntreeModeles, "destination" | "pays">,
  complement: DependancesAgent["complement"],
  protegees: DonneesProtegees | undefined,
): DonneesProtegees[] {
  const pays = protegees?.pays ?? entree.pays;
  const lieu: DonneesProtegees = { destination: protegees?.destination ?? entree.destination, ...(pays === undefined ? {} : { pays }) };
  const ensembles: DonneesProtegees[] = [protegees ?? lieu];
  if (complement !== undefined) {
    ensembles.push({
      ...lieu,
      logements: complement.logements.map((texte) => ({ texte })),
      ...(complement.recit === undefined ? {} : { recit: complement.recit }),
    });
  }
  return ensembles;
}

function borner(texte: string, max: number): string {
  return texte.replace(/[\p{Cc}\p{Cf}]/gu, " ").slice(0, max);
}

export async function chercherCandidats(
  entree: EntreeModeles,
  dependances: DependancesAgent,
): Promise<{ candidats: CandidatRecherche[]; compteurs: CompteursAgent }> {
  const { bornes: config, complement } = dependances;
  const proteges = ensemblesProteges(entree, complement, dependances.protegees);
  const compteurs: CompteursAgent = {
    tours: 0,
    recherches: 0,
    pagesLues: 0,
    pagesRefusees: {},
    sortiesRefusees: { plan: 0, recherche: 0 },
    sortiesIllisibles: { plan: 0, recherche: 0 },
    terminesIgnores: 0,
    finsAnormales: 0,
    candidatsRefuses: { source_not_in_results: 0, duplicate: 0, over_total: 0, invalid: 0 },
    finsEcheance: 0,
  };
  const candidats: CandidatRecherche[] = [];
  dependances.observer?.({ compteurs, candidats });
  /** Ticket 407 : l'échéance de l'étape admet-elle cet appel ? Non : la fin sur échéance est comptée. */
  const aLeTemps = (appel: AppelAgent): boolean => {
    if (dependances.peutAppeler === undefined || dependances.peutAppeler(appel)) return true;
    compteurs.finsEcheance += 1;
    return false;
  };
  const noterFin = (reponse: { fin?: string }) => {
    if (reponse.fin !== undefined && reponse.fin !== "stop") compteurs.finsAnormales += 1;
  };

  // Étape 2 : plan de recherche, à partir du brief seul.
  if (!aLeTemps("modele")) return { candidats, compteurs };
  const reponsePlan = await dependances.modeles.envoyer(requetePlan(entree, dependances.modele, dependances.routage, complement));
  noterFin(reponsePlan);
  const plan = lirePlan(reponsePlan.texte);
  compteurs.sortiesRefusees.plan += plan.refuses;
  if (plan.illisible === true) compteurs.sortiesIllisibles.plan += 1;
  const requetesPlan: RequetePlan[] = plan.valeur;

  const urlsVues = new Set<string>();
  const pagesTexte = new Map<string, string>();
  const cles = new Set<string>();
  const trouves: Record<TypeCreneau, number> = { activity: 0, meal: 0, evening: 0 };
  let resultats: ResultatWeb[] = [];
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
    const k = cleDeNom(extrait.nom);
    if (cles.has(k)) {
      compteurs.candidatsRefuses.duplicate += 1;
      return;
    }
    if (candidats.length >= config.totalCandidats) {
      compteurs.candidatsRefuses.over_total += 1;
      return;
    }
    const texte = pagesTexte.get(source);
    const resultat = CandidatRechercheSchema.safeParse({
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
    const creneau = creneauCompte(
      { typeEtape: resultat.data.typeEtape, ...(extrait.slotFit === undefined ? {} : { slotFit: extrait.slotFit }) },
      trouves.evening < config.ciblesParCreneau.evening,
    );
    if (creneau === "activity") trouves.activity += 1;
    else if (creneau === "meal") trouves.meal += 1;
    else if (creneau === "evening") trouves.evening += 1;
  };

  // Étape 3 : tours de l'agent, bornés.
  let echeanceAtteinte = false;
  for (let tour = 1; tour <= config.toursMax && !ciblesAtteintes(); tour += 1) {
    if (!aLeTemps("modele")) break;
    compteurs.tours += 1;
    const manquants: Record<TypeCreneau, number> = {
      activity: Math.max(0, config.ciblesParCreneau.activity - trouves.activity),
      meal: Math.max(0, config.ciblesParCreneau.meal - trouves.meal),
      evening: Math.max(0, config.ciblesParCreneau.evening - trouves.evening),
    };
    const reponse = await dependances.modeles.envoyer(
      requeteRecherche(
        {
          entree,
          tour,
          plan: requetesPlan,
          resultats,
          pages,
          dejaTrouves: candidats.map((candidat) => candidat.nom),
          manquants,
        },
        dependances.modele,
        dependances.routage,
        complement,
      ),
    );
    noterFin(reponse);
    const lecture = lireTour(reponse.texte);
    compteurs.sortiesRefusees.recherche += lecture.refuses;
    if (lecture.illisible === true) compteurs.sortiesIllisibles.recherche += 1;
    for (const extrait of lecture.valeur.candidats) accueillir(extrait);
    // Ticket 400 : `termine` avant toute recherche web est ignoré (aucune source ne peut encore être admise).
    const termine = lecture.valeur.termine && compteurs.recherches > 0;
    if (lecture.valeur.termine && !termine) compteurs.terminesIgnores += 1;
    if (termine || ciblesAtteintes()) break;

    resultats = [];
    pages = [];
    for (const action of lecture.valeur.actions) {
      if (action.type === "rechercher") {
        // PR 326 (bloquant 1d, corrections 1 et 2) : aucune donnée de logement ni texte libre du brief dans une requête web.
        // Mineur 4 du head `3254723` : nettoyée d'abord, la requête est jugée telle qu'elle part (longueur déjà bornée
        // à `LONGUEURS_TEXTE.requete` par le schéma des sorties, la même borne que le client réel).
        const requete = nettoyerRequeteWeb(action.requete);
        if (!proteges.every((ensemble) => requeteSansDonneeDuBrief(requete, ensemble))) {
          compteurs.sortiesRefusees.recherche += 1;
          continue;
        }
        if (!aLeTemps("recherche_web")) {
          echeanceAtteinte = true;
          break;
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
        if (!aLeTemps("page")) {
          echeanceAtteinte = true;
          break;
        }
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
    // Ticket 407 : plus le temps d'un appel dans l'étape ; les candidats admis sont gardés.
    if (echeanceAtteinte) break;
  }
  return { candidats, compteurs };
}
