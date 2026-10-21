import type { Category, PreferencePrompt, PreferenceReason, PreferenceSignal } from "@/contracts";

/**
 * Règles pures du tri « J'aime / Pas pour moi » (spécification B10, B10a point 1 ; décision 0112 § 2, B10-TL-2), partagées
 * par le navigateur (`src/features/presentation`, session en mémoire de F6 sur `mock` et `prototype`) et par le serveur
 * (`src/server/presentation`, tri enregistré sur `api`) : **une seule définition** (0013 § 3.2, F6-TL-2).
 *
 * Module sans `zod` et sans entrée-sortie (0016 § 3.1 amendée par 0112 § 2 point 2 ; 0045 § 3) : il n'importe que des
 * **types** de `@/contracts`, et aucun autre module de `src/domain`. Aucun nom de lieu, aucun `placeId` : les règles ne
 * lisent que des identifiants de cartes, des natures, des catégories, des jours et des heures.
 */

// --- Ordre du paquet (F6-PO-1) ------------------------------------------------------------------------------

/** Ce que l'ordre du paquet lit d'une carte ; `Proposal` en est une forme. */
export type CarteTriable = {
  readonly id: string;
  readonly kind: "activity" | "meal";
  readonly category: Category;
  readonly day: number;
  readonly time: string;
  readonly option?: { readonly index: number };
  readonly stop: { readonly locked: boolean };
};

const minutes = (time: string) => {
  const [heures = 0, mins = 0] = time.split(":").map(Number);
  return heures * 60 + mins;
};

/** Même créneau de repas : même jour, même heure (F6-PO-7). */
export function memeCreneau(a: Pick<CarteTriable, "kind" | "day" | "time">, b: Pick<CarteTriable, "kind" | "day" | "time">): boolean {
  return a.kind === "meal" && b.kind === "meal" && a.day === b.day && a.time === b.time;
}

/**
 * Cartes du paquet (F6-PO-1) : sans étape verrouillée, tri stable par jour puis heure, options d'un même créneau de
 * repas par `option.index`.
 */
export function ordreDuPaquet<T extends CarteTriable>(cartes: readonly T[]): T[] {
  return cartes
    .filter((carte) => !carte.stop.locked)
    .map((carte, rang) => ({ carte, rang }))
    .sort((a, b) => {
      const parJour = a.carte.day - b.carte.day;
      if (parJour !== 0) return parJour;
      const parHeure = minutes(a.carte.time) - minutes(b.carte.time);
      if (parHeure !== 0) return parHeure;
      if (memeCreneau(a.carte, b.carte)) {
        const parOption = (a.carte.option?.index ?? 0) - (b.carte.option?.index ?? 0);
        if (parOption !== 0) return parOption;
      }
      return a.rang - b.rang;
    })
    .map(({ carte }) => carte);
}

/** Dernière option de son créneau parmi `cartes` : aucune autre option du même créneau d'index plus grand. */
export function estDerniereOption(carte: CarteTriable, cartes: readonly CarteTriable[]): boolean {
  if (carte.kind !== "meal") return false;
  const index = carte.option?.index ?? 0;
  return !cartes.some((autre) => autre.id !== carte.id && memeCreneau(carte, autre) && (autre.option?.index ?? 0) > index);
}

// --- Question de préférence (F6-PO-8, F6-PO-9, B10-PO-5) -------------------------------------------------------

/**
 * Signal tel que les règles le lisent : `PreferenceSignal` (contrat interne du serveur, sans nom ni `placeId`) et, pour
 * une décision de carte, la nature de la carte décidée (le signal ne la porte pas ; le serveur la lit sur la
 * proposition, la session locale sur la carte).
 */
export type SignalLu = PreferenceSignal & { readonly kind?: "activity" | "meal" };

const actif = (signal: PreferenceSignal) => signal.status !== "cancelled";

/** Refus actif d'une activité (« Pas pour moi ») : seuls ceux-là comptent pour la question de catégorie. */
const refusDActivite = (signal: SignalLu) => actif(signal) && signal.signal === "dislike" && signal.kind === "activity";

/**
 * Question à poser après une décision (B10-PO-5 point 1, F6-PO-8) : `signaux` contient déjà cette décision ; `questions`
 * sont les questions déjà posées dans le voyage (ni retirées par une annulation). Deuxième refus actif d'une activité de
 * même catégorie, une seule question par catégorie ; un troisième refus ne la repose pas ; les repas, « J'aime »,
 * « Je choisis » et « Option suivante » ne comptent pas. La question de distance n'est pas posée ici
 * (`questionDeDistance`).
 */
export function questionApres(signaux: readonly SignalLu[], questions: readonly PreferencePrompt[], decision: SignalLu): PreferencePrompt | null {
  if (!refusDActivite(decision) || decision.category === null) return null;
  const categorie = decision.category;
  if (questions.some((question) => question.kind === "category" && question.category === categorie)) return null;
  const refus = signaux.filter((signal) => refusDActivite(signal) && signal.category === categorie).length;
  return refus >= 2 ? { kind: "category", category: categorie } : null;
}

/**
 * Question de distance (F6-PO-9) : deux raisons « Trop loin » données dans la feuille, une seule fois. Appelée par la
 * session locale (`mock`, `prototype`) ; le serveur ne la pose pas avant B10f (B10-PO-16 point 5).
 */
export function questionDeDistance(raisons: readonly (PreferenceReason | undefined)[], questions: readonly PreferencePrompt[]): PreferencePrompt | null {
  if (questions.some((question) => question.kind === "distance")) return null;
  return raisons.filter((raison) => raison === "tooFar").length >= 2 ? { kind: "distance" } : null;
}

// --- Paquet de reprise (B10-PO-4) ---------------------------------------------------------------------------

/** Tri des cartes : identifiants des cartes qui appartiennent à un tri clos (B10-PO-4 point 3). */
export type EtatDesTris = { readonly closes: ReadonlySet<string> };

/** Catégories confirmées « on arrête » : `answerYes` actifs. */
export function categoriesArretees(signaux: readonly PreferenceSignal[]): Set<Category> {
  const categories = new Set<Category>();
  for (const signal of signaux) if (actif(signal) && signal.signal === "answerYes" && signal.category !== null) categories.add(signal.category);
  return categories;
}

/**
 * Paquet de reprise d'un tri ouvert (B10-PO-4 point 2) : les cartes sans décision active, moins les activités d'une
 * catégorie confirmée « on arrête », moins **toutes** les options d'un créneau de repas réglé (« Je choisis » actif sur
 * l'une, ou « Pas pour moi » actif sur la dernière), moins les cartes d'un tri clos ; dans l'ordre de F6-PO-1. Dans un
 * créneau non réglé, la première option sans décision vient en premier (ordre des options).
 */
export function paquetDeReprise<T extends CarteTriable>(propositions: readonly T[], signaux: readonly PreferenceSignal[], tris: EtatDesTris): T[] {
  const decisions = new Map<string, PreferenceSignal>();
  for (const signal of signaux) if (actif(signal) && signal.proposalId !== undefined) decisions.set(signal.proposalId, signal);
  const arretees = categoriesArretees(signaux);
  const ordonnees = ordreDuPaquet(propositions);
  const reglees = ordonnees.filter((carte) => {
    const decision = decisions.get(carte.id);
    return carte.kind === "meal" && (decision?.signal === "choose" || decision?.signal === "dislike");
  });
  return ordonnees.filter(
    (carte) =>
      !tris.closes.has(carte.id) &&
      !decisions.has(carte.id) &&
      !(carte.kind === "activity" && arretees.has(carte.category)) &&
      !reglees.some((reglee) => memeCreneau(reglee, carte)),
  );
}

/** Compteurs du tri ouvert (F6-PO-16, 0112 § 1.2) : cartes du tri ouvert décidées, cartes du paquet de reprise. */
export function compteursDuTri(propositions: readonly CarteTriable[], signaux: readonly PreferenceSignal[], tris: EtatDesTris): { decided: number; remaining: number } {
  const decidees = new Set<string>();
  for (const signal of signaux) if (actif(signal) && signal.proposalId !== undefined) decidees.add(signal.proposalId);
  const ouvertes = propositions.filter((carte) => !carte.stop.locked && !tris.closes.has(carte.id));
  return {
    decided: ouvertes.filter((carte) => decidees.has(carte.id)).length,
    remaining: paquetDeReprise(propositions, signaux, tris).length,
  };
}
