import "server-only";

/**
 * Sites des étapes du programme de `p0Run` (lot 2a : la spécification P0-programme-par-ia § 11.3 et § 11.5 ; décision 0121
 * § 2 et § 3.4 ; verdict de la Sécurité 0122 § 1 et § 2.1). Orchestration seulement, **sans entrée-sortie propre** : la
 * forme (`reduire`) et la vérification (`verificateur`) sont celles de `src/research/fetch-page.ts`, injectées par
 * l'appelant (le pont `p0Run` et la famille `programme()` de la composition) ; ce module n'importe ni `src/research` ni
 * aucun module de capacité.
 *
 * - Les adresses restent **en mémoire** de l'étape : jamais dans l'état sérialisé, `prototype.work`, un journal, une
 *   trace ou un prompt (0121 § 2.2, 0122 § 1 condition 12). Seul l'ensemble `gardees` sort, en mémoire, et seules les
 *   adresses réduites gardées atteignent `Stop.source`.
 * - Aucun nom d'hôte, aucune adresse, aucun motif, aucun statut ne sort d'ici : des nombres seulement (`CompteursSites`,
 *   liste fermée de `p0.programme_written`, 0122 § 2.1).
 * - La vérification ne lit **aucun** verdict d'ancrage : ni `placeId`, ni Text Search, ni fiche (PPI-PO-10, A20).
 *
 * Déplacé de `src/server/p0/sites.ts` par M1a-1 (décision 0136 § 1.1), sans changement : partagé par `p0Run` et la vraie
 * app ; `src/server/p0/sites.ts` le réexporte.
 */

/** Adresses distinctes soumises au plus par exécution (§ 11.3 point 5 ; 0122 § 1 condition 10 : abaissable, jamais relevée sans verdict). */
export const SITES_MAX = 80;
/** Vérifications simultanées au plus. */
export const SITES_SIMULTANES = 8;
/** Durée totale des vérifications d'une exécution. */
export const SITES_DUREE_MAX_MS = 60_000;
/** Délai d'une vérification (égal à `DELAI_STATUT_MS` de `src/research/fetch-page.ts`, que ce module n'importe pas). */
export const DELAI_SITE_MS = 5_000;
/** Marge avant la limite (même valeur que `MARGE_VERIFICATION_AGENT_MS` de `p0Run`, 0121 § 2.1). */
export const MARGE_SITE_MS = 1_000;

/** Compteurs maison de `p0.programme_written` (§ 11.5) : entiers positifs ou nuls, aucun verdict Google. */
export type CompteursSites = {
  sitesProposed: number;
  sitesChecked: number;
  sitesRemoved: number;
  sitesUnchecked: number;
};

/** Forme structurelle du vérificateur de `src/research/fetch-page.ts` (`VerificateurStatut`). */
export type VerificateurSites = {
  readonly barriereFermee: boolean;
  verifier(adresse: string, signal?: AbortSignal): Promise<{ readonly ok: boolean }>;
};

/** Créneau tel que la lecture tolérante le rend (forme structurelle de `CreneauIa`, `src/ai/sorties.ts`). */
type CreneauAvecSite = { readonly site?: string };

export type SitesDuProgramme = {
  /** Adresses réduites distinctes, dans l'ordre écrit (jours, puis créneaux) ; les `SITES_MAX` premières sont soumises. */
  readonly adresses: readonly string[];
  /** Sites lus de forme refusée (`fieldsRemoved`, § 11.3 point 1). */
  readonly formesRefusees: number;
  /** Adresse réduite du créneau `rang` de la journée `jour`, ou `undefined`. */
  readonly adresseDe: (jour: number, rang: number) => string | undefined;
};

/**
 * Adresses distinctes du programme **déjà en ordre écrit** (0121 § 2.1 point 1) : chaque `site` lu passe par `reduire`
 * (forme, réduction ; échec : compté dans `formesRefusees`, le créneau gardé) ; une même adresse réduite citée par
 * plusieurs créneaux n'apparaît qu'une fois (§ 11.3 point 2). Fonction pure.
 */
export function sitesDuProgramme(
  programme: { readonly jours: readonly { readonly creneaux: readonly CreneauAvecSite[] }[] },
  reduire: (brut: unknown) => string | undefined,
): SitesDuProgramme {
  const adresses: string[] = [];
  const vues = new Set<string>();
  const parCreneau = new Map<string, string>();
  let formesRefusees = 0;
  programme.jours.forEach((jour, indiceJour) => {
    jour.creneaux.forEach((creneau, rang) => {
      if (creneau.site === undefined) return;
      const reduite = reduire(creneau.site);
      if (reduite === undefined) {
        formesRefusees += 1;
        return;
      }
      if (!vues.has(reduite)) {
        vues.add(reduite);
        adresses.push(reduite);
      }
      parCreneau.set(`${indiceJour}:${rang}`, reduite);
    });
  });
  return { adresses, formesRefusees, adresseDe: (jour, rang) => parCreneau.get(`${jour}:${rang}`) };
}

export type OptionsVerificationSites = {
  /** Instant (ms depuis l'époque) au-delà duquel aucune vérification ne doit être en cours (0121 § 2.1, « Temps »). */
  readonly limite: number;
  readonly maintenant: () => number;
  /** Abandon externe (erreur de l'étape) : les vérifications en cours sont abandonnées, comme à la limite. */
  readonly signal?: AbortSignal;
};

export type ResultatSites = { readonly gardees: ReadonlySet<string>; readonly compteurs: CompteursSites };

/** Compteurs d'une vérification qui n'a rien soumis : toutes les adresses non soumises. */
export const compteursNonSoumis = (proposees: number): CompteursSites => ({ sitesProposed: proposees, sitesChecked: 0, sitesRemoved: 0, sitesUnchecked: proposees });

/**
 * Vérifie les adresses (§ 11.3 points 3 à 5 ; 0121 § 3.4) : au plus `SITES_SIMULTANES` en cours, au plus `SITES_MAX`
 * soumises, une adresse soumise seulement si son délai entier tient avant la limite (au plus `SITES_DUREE_MAX_MS` après
 * le début) ; à la limite ou à l'abandon, les vérifications en cours sont abandonnées et comptées refusées. Barrière de
 * sortie fermée (lue une fois, avant toute soumission) : rien n'est soumis, toutes les adresses sont non soumises
 * (PPI-PO-11). **Ne rejette jamais** : une erreur d'une adresse est un refus de cette adresse. Relations vraies par
 * construction : `sitesProposed = sitesChecked + sitesUnchecked`, `sitesRemoved ≤ sitesChecked`.
 */
export async function verifierSites(
  adresses: readonly string[],
  verificateur: VerificateurSites,
  options: OptionsVerificationSites,
): Promise<ResultatSites> {
  const proposees = adresses.length;
  const gardees = new Set<string>();
  if (proposees === 0 || verificateur.barriereFermee) return { gardees, compteurs: compteursNonSoumis(proposees) };
  const borne = Math.min(options.limite, options.maintenant() + SITES_DUREE_MAX_MS);
  const controleur = new AbortController();
  const abandonner = () => controleur.abort();
  if (options.signal?.aborted === true) abandonner();
  options.signal?.addEventListener("abort", abandonner, { once: true });
  const minuterie = setTimeout(abandonner, Math.max(0, borne - options.maintenant()));
  const file = adresses.slice(0, SITES_MAX);
  let suivante = 0;
  let soumises = 0;
  let refusees = 0;
  const travailleur = async (): Promise<void> => {
    for (;;) {
      if (suivante >= file.length || controleur.signal.aborted) return;
      if (options.maintenant() + DELAI_SITE_MS + MARGE_SITE_MS > borne) return;
      const adresse = file[suivante] as string;
      suivante += 1;
      soumises += 1;
      let ok = false;
      try {
        ok = (await verificateur.verifier(adresse, controleur.signal)).ok === true;
      } catch {
        ok = false;
      }
      // Réponse arrivée après l'épuisement du temps ou l'abandon : vérification en cours à la limite, refusée.
      if (ok && !controleur.signal.aborted) gardees.add(adresse);
      else refusees += 1;
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(SITES_SIMULTANES, file.length) }, travailleur));
  } finally {
    clearTimeout(minuterie);
    options.signal?.removeEventListener("abort", abandonner);
  }
  return { gardees, compteurs: { sitesProposed: proposees, sitesChecked: soumises, sitesRemoved: refusees, sitesUnchecked: proposees - soumises } };
}

/**
 * Créneau prêt pour l'assemblage : le `site` **lu** est toujours retiré ; seule l'adresse réduite **gardée** est remise
 * (0121 § 2.1 point 3). Aucune autre donnée du créneau ne change.
 */
export function avecSiteGarde<T extends CreneauAvecSite>(creneau: T, reduite: string | undefined, gardees: ReadonlySet<string>): T {
  const copie: T = { ...creneau };
  delete (copie as { site?: string }).site;
  return reduite !== undefined && gardees.has(reduite) ? { ...copie, site: reduite } : copie;
}
