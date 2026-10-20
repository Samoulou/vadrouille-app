import type { TypeCreneau } from "@/ai/candidat";
import type { ClientModeles } from "@/ai/client";
import type { EntreeModeles } from "@/ai/entrees";
import { LONGUEURS_RESULTAT, nettoyerRequeteWeb, type ClientRechercheWeb, type ResultatWeb } from "@/ai/recherche-web";
import type { Routage } from "@/ai/reglages";
import { requetePlan, requeteRecherche, type PageLue } from "@/ai/requetes";
import { cleDeNom, joursDuSejour, lirePlan, lireTour, PLAN_VIDE, type CandidatExtrait, type PlanRecherche } from "@/ai/sorties";
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
  /**
   * Compteurs de l'amendement 3 de la suite 2 de P0 (P0S2-PO-25), calculés sur la **seule sortie de l'agent**, avant
   * tout ancrage : aucun ne dépend d'une position, d'une fiche ni d'un résultat Google (0011 § 2), aucun ne porte un nom.
   */
  qualite: CompteursQualite;
};

export type CompteursQualite = {
  /** Secteurs du plan lu (0 si le plan est refusé ou sans secteur). */
  secteursPlan: number;
  /** Incontournables nommés par le plan lu. */
  incontournablesPlan: number;
  /** Incontournables du plan qu'aucun candidat admis ne désigne par son champ `incontournable` (P0S2-PO-20). */
  incontournableSansCandidat: number;
  /** Candidats écartés parce que leur nom réunit deux incontournables du plan ou plus (P0S2-PO-20). */
  candidatRegroupe: number;
  /** Candidats de lieu écartés parce que leur secteur n'est pas un secteur du plan (P0S2-PO-20). */
  secteurInconnu: number;
};

/**
 * Ce que l'agent sait d'un candidat admis en plus du candidat lui-même (amendement 3, P0S2-PO-20 et PO-21) : secteur et
 * incontournable du plan (noms exacts du plan), infos pratiques tirées de la source. Données maison de la recherche web
 * seulement, **en mémoire** : tant que le Tech Lead n'a pas tranché où les porter (`CandidatSchema`, la contrainte de
 * clés de la table de travail du prototype et la copie `src/research/candidat.ts` tenue égale ; question 1 de
 * l'amendement), elles ne sont ni dans le candidat, ni écrites en base.
 */
export type InfosCandidat = {
  readonly secteur?: string;
  readonly incontournable?: string;
  readonly prix?: string;
  readonly horaires?: string;
  readonly conseil?: string;
};

/** Résultat de l'agent : candidats admis, compteurs, plan lu et infos par identifiant de candidat. */
export type ResultatAgent = {
  candidats: CandidatRecherche[];
  compteurs: CompteursAgent;
  plan: PlanRecherche;
  infos: ReadonlyMap<string, InfosCandidat>;
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
  /**
   * Noms déjà connus de l'appelant (B7b, spécification B7 : `dejaTrouves` de `rechercher`, recherche complémentaire du
   * voyage complet et mini-recherche). Remis au modèle avec les noms trouvés pendant l'exécution, et jamais re-trouvés :
   * un candidat dont le nom (`cleDeNom`) en fait partie est écarté comme doublon. Ils ne comptent dans aucune cible ni
   * dans le total. Absent : comportement de P0, inchangé. Remis au modèle sans normalisation : l'appelant n'y passe jamais
   * un `displayName` ni un nom issu de Places ou de l'ancrage (revue de B7b, sécurité 1).
   */
  dejaConnus?: readonly string[];
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

/**
 * Fin de la boucle de l'agent (mineur 11 de la revue de la PR #490) : le total visé est atteint (tout candidat admis y
 * compte, événements compris : c'est la borne de coût), ou chaque cible de créneau l'est, les candidats étant **comptés
 * par `creneauCompte`**, comme la planification remplit ses créneaux. Voulu : un événement ne compte dans aucun créneau
 * (la soirée du programme ne prend jamais un événement), donc une recherche qui ne trouve que des événements continue
 * jusqu'à `toursMax` ou `totalCandidats`, ses deux fusibles de coût, sans jamais se croire servie en soirée.
 */
export function ciblesAtteintes(
  trouves: Readonly<Record<TypeCreneau, number>>,
  nombreCandidats: number,
  bornes: Pick<BornesRecherche, "ciblesParCreneau" | "totalCandidats">,
): boolean {
  return (
    nombreCandidats >= bornes.totalCandidats ||
    (trouves.activity >= bornes.ciblesParCreneau.activity &&
      trouves.meal >= bornes.ciblesParCreneau.meal &&
      trouves.evening >= bornes.ciblesParCreneau.evening)
  );
}

/** Clé de comparaison d'un nom (doublons de l'agent, secteurs et incontournables, mesures de `evals/`) ; voir `@/ai/sorties`. */
export { cleDeNom };

/** Longueur minimale d'un mot d'incontournable pour la règle du candidat regroupé (`incontournablesCites`). */
export const MOT_INCONTOURNABLE_MIN = 4;

/** Écritures sans espaces entre les mots (`incontournablesCites`). */
const ECRITURE_SANS_ESPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Incontournables du plan **cités** par un nom maison de candidat (P0S2-PO-20, « un incontournable = un candidat ») :
 * l'incontournable est cité si sa clé de nom (`cleDeNom`) figure en mots entiers dans celle du nom, ou si l'un de ses mots
 * **distinctifs** y figure : mot de `MOT_INCONTOURNABLE_MIN` lettres ou plus, absent du nom de la destination et des
 * noms des autres incontournables du plan (« Balade Panthéon, Trevi et Navone » cite « Panthéon », « Fontaine de
 * Trevi » et « Place Navone » : `place` est partagé avec « Place d'Espagne », `trevi` et `navone` sont distinctifs).
 * Seul le nom est lu, jamais le prix ni le conseil (un billet combiné dit dans le prix ne regroupe rien).
 * Écritures sans espaces entre les mots (chinois, japonais, thaï, lao, khmer, birman ; correction 2 de la PR 505,
 * mineur 5) : la clé d'un incontournable qui en contient est cherchée telle quelle dans la clé du nom, sans exiger
 * d'espaces autour ; la règle des mots distinctifs ne s'y applique pas (aucun découpage en mots fiable). Fonction pure.
 */
export function incontournablesCites(nom: string, plan: PlanRecherche, destination: string): string[] {
  const texte = ` ${cleDeNom(nom)} `;
  const motsDestination = new Set(cleDeNom(destination).split(" "));
  const tous = plan.secteurs.flatMap((secteur) => secteur.incontournables);
  const motsDe = (incontournable: string) => cleDeNom(incontournable).split(" ").filter((mot) => mot !== "");
  const occurrences = new Map<string, number>();
  for (const incontournable of tous) for (const mot of new Set(motsDe(incontournable))) occurrences.set(mot, (occurrences.get(mot) ?? 0) + 1);
  return tous.filter((incontournable) => {
    const cle = cleDeNom(incontournable);
    if (cle !== "" && texte.includes(` ${cle} `)) return true;
    if (cle !== "" && ECRITURE_SANS_ESPACES.test(cle)) return texte.includes(cle);
    return motsDe(incontournable).some(
      (mot) => mot.length >= MOT_INCONTOURNABLE_MIN && !motsDestination.has(mot) && occurrences.get(mot) === 1 && texte.includes(` ${mot} `),
    );
  });
}

/** Cibles d'un secteur, par créneau (P0S2-PO-20). */
export type CiblesSecteur = { readonly nom: string; readonly cibles: Record<TypeCreneau, number> };

/**
 * Répartition des cibles de l'exécution par secteur du plan (P0S2-PO-20) : activités, d'abord un candidat par
 * incontournable du plan (dans l'ordre du plan), puis le reste au tourniquet sur les secteurs dans l'ordre du plan ; repas
 * et soirées au tourniquet (au moins 2 repas et 1 soirée par secteur dès que les totaux le permettent). La somme par
 * créneau égale toujours la cible de l'exécution (`bornesDepuisDemande`, 0088 § 1 à § 3), jamais plus. Plan sans
 * secteur : aucune répartition. Fonction pure.
 */
export function ciblesParSecteur(plan: PlanRecherche, cibles: Readonly<Record<TypeCreneau, number>>): CiblesSecteur[] {
  const secteurs = plan.secteurs.map((secteur) => ({
    nom: secteur.nom,
    incontournables: secteur.incontournables.length,
    cibles: { activity: 0, meal: 0, evening: 0 },
  }));
  if (secteurs.length === 0) return [];
  let activites = Math.max(0, cibles.activity);
  for (const secteur of secteurs) {
    const part = Math.min(activites, secteur.incontournables);
    secteur.cibles.activity += part;
    activites -= part;
  }
  const tourniquet = (creneau: TypeCreneau, reste: number) => {
    secteurs.forEach((secteur, rang) => {
      const part = Math.floor(reste / secteurs.length) + (rang < reste % secteurs.length ? 1 : 0);
      ajouterAuCreneau(secteur.cibles, creneau, part);
    });
  };
  tourniquet("activity", activites);
  tourniquet("meal", Math.max(0, cibles.meal));
  tourniquet("evening", Math.max(0, cibles.evening));
  return secteurs.map(({ nom, cibles: parCreneau }) => ({ nom, cibles: parCreneau }));
}

/** Ajoute `nombre` au créneau donné (clés littérales seulement : aucun accès calculé). */
function ajouterAuCreneau(compte: Record<TypeCreneau, number>, creneau: TypeCreneau, nombre: number): void {
  if (creneau === "activity") compte.activity += nombre;
  else if (creneau === "meal") compte.meal += nombre;
  else compte.evening += nombre;
}

/** Secteur du plan dont la clé de nom égale celle de `nom` ; `undefined` sinon. */
function secteurDuPlan(plan: PlanRecherche, nom: string | null | undefined) {
  if (nom === null || nom === undefined) return undefined;
  const cle = cleDeNom(nom);
  return plan.secteurs.find((secteur) => cleDeNom(secteur.nom) === cle);
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

export async function chercherCandidats(entree: EntreeModeles, dependances: DependancesAgent): Promise<ResultatAgent> {
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
    qualite: { secteursPlan: 0, incontournablesPlan: 0, incontournableSansCandidat: 0, candidatRegroupe: 0, secteurInconnu: 0 },
  };
  const candidats: CandidatRecherche[] = [];
  const infos = new Map<string, InfosCandidat>();
  let plan: PlanRecherche = PLAN_VIDE;
  /**
   * `incontournable_sans_candidat` sur la seule sortie de l'agent, avant tout ancrage (P0S2-PO-20) : tenu à jour après la
   * lecture du plan et à chaque admission, pour que l'état vivant (`observer`, journal sur erreur ou échéance, ticket 407)
   * porte la bonne valeur même si la recherche lève.
   */
  const majSansCandidat = () => {
    const designes = new Set([...infos.values()].flatMap((info) => (info.incontournable === undefined ? [] : [cleDeNom(info.incontournable)])));
    compteurs.qualite.incontournableSansCandidat = plan.secteurs
      .flatMap((secteur) => secteur.incontournables)
      .filter((incontournable) => !designes.has(cleDeNom(incontournable))).length;
  };
  const resultat = (): ResultatAgent => ({ candidats, compteurs, plan, infos });
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

  // Étape 2 : plan de recherche par secteurs (prompt `plan` v2, P0S2-PO-19), à partir du brief seul.
  if (!aLeTemps("modele")) return resultat();
  const jours = joursDuSejour(entree.arrivee, entree.depart);
  const incontournablesMax = Math.min(2 * jours, config.ciblesParCreneau.activity);
  const reponsePlan = await dependances.modeles.envoyer(
    requetePlan(entree, dependances.modele, dependances.routage, complement, incontournablesMax),
  );
  noterFin(reponsePlan);
  const lecturePlan = lirePlan(reponsePlan.texte, { jours, cibleActivites: config.ciblesParCreneau.activity });
  compteurs.sortiesRefusees.plan += lecturePlan.refuses;
  if (lecturePlan.illisible === true) compteurs.sortiesIllisibles.plan += 1;
  plan = lecturePlan.valeur;
  compteurs.qualite.secteursPlan = plan.secteurs.length;
  compteurs.qualite.incontournablesPlan = plan.secteurs.reduce((total, secteur) => total + secteur.incontournables.length, 0);
  majSansCandidat();
  const cibles = ciblesParSecteur(plan, config.ciblesParCreneau);
  const trouvesParSecteur = new Map<string, Record<TypeCreneau, number>>(plan.secteurs.map((secteur) => [secteur.nom, { activity: 0, meal: 0, evening: 0 }]));

  const urlsVues = new Set<string>();
  const pagesTexte = new Map<string, string>();
  const connus = dependances.dejaConnus ?? [];
  const cles = new Set<string>(connus.map(cleDeNom).filter((cle) => cle !== ""));
  const trouves: Record<TypeCreneau, number> = { activity: 0, meal: 0, evening: 0 };
  let resultats: ResultatWeb[] = [];
  let pages: PageLue[] = [];

  const servi = () => ciblesAtteintes(trouves, candidats.length, config);

  const accueillir = (extrait: CandidatExtrait) => {
    const source = urlNormalisee(extrait.sourceUrl);
    if (source === undefined || !urlsVues.has(source)) {
      compteurs.candidatsRefuses.source_not_in_results += 1;
      return;
    }
    // Amendement 3 (P0S2-PO-20) : avec un plan par secteurs, un lieu porte un secteur du plan (sinon écarté,
    // `secteur_inconnu`) ; un événement peut ne pas en porter. Plan refusé ou sans secteur : règle sans objet.
    const avecSecteurs = plan.secteurs.length > 0;
    const secteur = avecSecteurs ? secteurDuPlan(plan, extrait.secteur) : undefined;
    if (avecSecteurs && secteur === undefined && extrait.typeEtape !== "event") {
      compteurs.qualite.secteurInconnu += 1;
      return;
    }
    // Un incontournable = un candidat : un nom qui réunit deux incontournables du plan ou plus est écarté.
    if (avecSecteurs && incontournablesCites(extrait.nom, plan, entree.destination).length >= 2) {
      compteurs.qualite.candidatRegroupe += 1;
      return;
    }
    const incontournable =
      secteur === undefined || extrait.incontournable === null || extrait.incontournable === undefined
        ? undefined
        : secteur.incontournables.find((nom) => cleDeNom(nom) === cleDeNom(extrait.incontournable as string));
    const k = cleDeNom(extrait.nom);
    // Correction 2 de la PR 505 (mineur 3) : un nom fait seulement de symboles n'a pas de clé ; écarté, jamais doublon.
    if (k === "") {
      compteurs.candidatsRefuses.invalid += 1;
      return;
    }
    // Deux candidats qui désignent le même incontournable sont fusionnés comme les autres doublons.
    const memeIncontournable =
      incontournable !== undefined && [...infos.values()].some((info) => info.incontournable !== undefined && cleDeNom(info.incontournable) === cleDeNom(incontournable));
    if (cles.has(k) || memeIncontournable) {
      compteurs.candidatsRefuses.duplicate += 1;
      return;
    }
    if (candidats.length >= config.totalCandidats) {
      compteurs.candidatsRefuses.over_total += 1;
      return;
    }
    const texte = pagesTexte.get(source);
    const prixParPersonne = prixParPersonneAdmis(extrait);
    const lu = CandidatRechercheSchema.safeParse({
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
      ...(prixParPersonne === undefined ? {} : { prixParPersonne }),
      ...(extrait.dureeMinutes === undefined ? {} : { dureeMinutes: extrait.dureeMinutes }),
    });
    if (!lu.success) {
      compteurs.candidatsRefuses.invalid += 1;
      return;
    }
    cles.add(k);
    candidats.push(lu.data);
    infos.set(lu.data.id, {
      ...(secteur === undefined ? {} : { secteur: secteur.nom }),
      ...(incontournable === undefined ? {} : { incontournable }),
      ...(extrait.prix === undefined ? {} : { prix: extrait.prix }),
      ...(extrait.horaires === undefined ? {} : { horaires: extrait.horaires }),
      ...(extrait.conseil === undefined ? {} : { conseil: extrait.conseil }),
    });
    if (incontournable !== undefined) majSansCandidat();
    const creneau = creneauCompte(
      { typeEtape: lu.data.typeEtape, ...(extrait.slotFit === undefined ? {} : { slotFit: extrait.slotFit }) },
      trouves.evening < config.ciblesParCreneau.evening,
    );
    if (creneau === undefined) return;
    ajouterAuCreneau(trouves, creneau, 1);
    const parSecteur = secteur === undefined ? undefined : trouvesParSecteur.get(secteur.nom);
    if (parSecteur !== undefined) ajouterAuCreneau(parSecteur, creneau, 1);
  };

  /** Ce qui manque par secteur, remis au modèle à chaque tour (P0S2-PO-20) ; aucune donnée Google. */
  const manquantsParSecteur = () => {
    const designes = new Set([...infos.values()].flatMap((info) => (info.incontournable === undefined ? [] : [cleDeNom(info.incontournable)])));
    return cibles.map(({ nom, cibles: cible }) => {
      const vus = trouvesParSecteur.get(nom) ?? { activity: 0, meal: 0, evening: 0 };
      return {
        nom,
        manquants: {
          activity: Math.max(0, cible.activity - vus.activity),
          meal: Math.max(0, cible.meal - vus.meal),
          evening: Math.max(0, cible.evening - vus.evening),
        },
        incontournablesSansCandidat: (secteurDuPlan(plan, nom)?.incontournables ?? []).filter((i) => !designes.has(cleDeNom(i))),
      };
    });
  };

  // Étape 3 : tours de l'agent, bornés.
  let echeanceAtteinte = false;
  for (let tour = 1; tour <= config.toursMax && !servi(); tour += 1) {
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
          plan,
          secteurs: manquantsParSecteur(),
          resultats,
          pages,
          dejaTrouves: [...connus, ...candidats.map((candidat) => candidat.nom)],
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
    if (termine || servi()) break;

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
  return resultat();
}

/**
 * Prix en francs suisses dans le texte `prix` d'une source : « 12 CHF », « CHF 12 », « 12 fr. », « fr. 12 », « francs
 * suisses » ; jamais si une autre devise y figure (« 18 € (≈ 17 CHF) », « 12 CHF (≈ 13 CAD) » : la source ne donne pas
 * le prix en CHF seulement). Autre devise : tout symbole monétaire (le franc suisse n'en a pas), un code ISO courant ou
 * un nom de devise. La liste des codes et des noms n'est pas exhaustive : une devise absente de la liste et citée à côté
 * d'un prix en CHF passe (correction 2 de la PR 505, mineur 6 ; limite acceptée, le prix reste une estimation).
 */
const PRIX_EN_CHF = /\bchf\b|\d\s?fr\.|\bfr\.\s?\d|\bfrancs?\s+suisses?\b/i;
const AUTRE_DEVISE =
  /\p{Sc}|\b(?:eur|usd|gbp|jpy|cny|rmb|cad|aud|nzd|hkd|sgd|sek|nok|dkk|isk|pln|czk|huf|ron|bgn|inr|rub|zar|brl|mxn|krw|thb|ils|aed|xof|xaf|cfa|kr|euros?|dollars?|livres?|pounds?|yens?|yuans?|roubles?|couronnes?|kronor|kroner|lires?|liras?|pesos?|reais|réals?|roupies?|rupees?|dirhams?|zlotys?|forints?)\b/iu;
/**
 * Entrée gratuite dite par le texte `prix` de la source (« gratuit », « entrée libre », « offert », « gratis », « free »),
 * sans négation (« non gratuit », « pas gratuit », « not free ») et sans aucun chiffre ni devise : « gratuit enfants,
 * 15 CHF adultes » ou « free cancellation, 45 CHF » ne disent pas l'entrée gratuite pour tous (correction 2, mineurs 2 et 7).
 */
const PRIX_GRATUIT = /\bgratuite?s?\b|\bentr[ée]e\s+libre\b|\bofferte?s?\b|\bgratis\b|\bfree\b/i;
const PRIX_GRATUIT_NIE = /\b(?:non|pas|plus|jamais|not|no)\s+(?:\p{L}+\s+)?(?:gratuite?s?|libre|offerte?s?|gratis|free)\b/iu;

/** Vrai si le texte `prix` dit l'entrée gratuite, sans négation, sans chiffre ni devise. Fonction pure. */
export function prixDitGratuit(prix: string): boolean {
  return PRIX_GRATUIT.test(prix) && !PRIX_GRATUIT_NIE.test(prix) && !/\d/.test(prix) && !PRIX_EN_CHF.test(prix) && !AUTRE_DEVISE.test(prix);
}

/**
 * `prixParPersonne` admis (P0S2-PO-21 : le prototype ne convertit aucune devise ; « seulement si la source donne le prix
 * en CHF, ou si l'entrée est gratuite ; sinon absent », un champ non donné est absent, jamais deviné) :
 * - un montant positif seulement si le texte `prix` est présent et en francs suisses, sans autre devise ;
 * - 0 seulement si le texte `prix` est présent et dit l'entrée gratuite (`prixDitGratuit`) ; sans texte `prix`, ou avec
 *   un texte qui ne dit pas « gratuit » (« 15 € »), le 0 est retiré (correction 2 de la PR 505, bloquant 1).
 * Fonction pure.
 */
export function prixParPersonneAdmis(extrait: Pick<CandidatExtrait, "prix" | "prixParPersonne">): number | undefined {
  const { prix, prixParPersonne } = extrait;
  if (prixParPersonne === undefined) return undefined;
  if (prixParPersonne === 0) return prix !== undefined && prixDitGratuit(prix) ? 0 : undefined;
  return prix !== undefined && PRIX_EN_CHF.test(prix) && !AUTRE_DEVISE.test(prix) ? prixParPersonne : undefined;
}
