import type { DayLineItem, PreviewSlot, Proposal, Stop, Trip } from "@/contracts";
import type {
  DemandeRelectures,
  Duree,
  ModeTrajet,
  Plage,
  Point,
  RefusRelectures,
  Relectures,
  SourceRelectures,
  Validite,
  VoyageARelire,
} from "@/domain/relectures";

import { lisbonne, porto } from "./autres-voyages";
import { apercu, edimbourg, edimbourgDebloque, propositions, propositionsDebloque } from "./edimbourg";
import { edimbourgRevision } from "./edimbourg-revision";

/**
 * Double simulé du port de relectures de la lecture des voyages (spécification B6, B6a point 3 ; décision 0086
 * § 1.2 point 4). **Un seul** double : utilisé par `pnpm test:db` (B6a), puis branché par B6b pour les serveurs
 * `local` et `ci`. Aucun appel réseau, aucune clé, aucune donnée Google : ses valeurs sont tirées du jeu simulé de
 * `src/mocks` (lecture seule ; aucun fichier existant modifié), et ses `placeId` sont ceux du jeu (`mock_place_…`) ou
 * des sentinelles fabriquées (`test_place_…`, règles de conversion de B6a point 7).
 *
 * Indexé par `placeId` (`validite`, `plages` par date) et par triplet (`placeId`, `placeId`, mode) (`duree`), un
 * logement étant résolu par `logementsParNuit` ; **jamais** par voyage, organisation ni version : il sert deux copies
 * d'un voyage écrites avec des `uuid` différents. Il **ne répond qu'à ce que la demande contient** (hors demande :
 * `inconnu`), compte ses appels, simule `quota_reached` et `unavailable`, et ne garde aucune valeur entre deux appels.
 *
 * Il n'importe `@/domain/relectures` qu'en `import type` (arête admise de 0086, `tests/unit/p0/imports.test.ts`) :
 * le littéral `"inconnu"` suffit pour la valeur.
 */

const INCONNU = "inconnu" as const;

/** Préfixe des `placeId` sentinelles des données de test (distinct de `mock_place_`, B6a point 7, question 6 à data). */
export const PREFIXE_LIEU_TEST = "test_place_";

/** `placeId` sentinelle d'une étape que `mock` rend sans lieu : `test_place_<id de l'étape>`. */
export const lieuDeTest = (stopId: string): string => `${PREFIXE_LIEU_TEST}${stopId}`;

/** `placeId` sentinelle du logement d'un voyage simulé : `test_place_logement_<id de mock>` (réponse de data, point 6.1). */
export const logementDeTest = (mockTripId: string): string => `${PREFIXE_LIEU_TEST}logement_${mockTripId}`;

/** `placeId` d'une étape dans les données converties : le sien, ou la sentinelle. */
export const lieuConverti = (stop: Pick<Stop, "id" | "placeId">): string => stop.placeId ?? lieuDeTest(stop.id);

/** Voyage simulé servi par `listTrips` de `mock` (0021 § 2), avec ses propositions et son aperçu. */
export type VoyageSimule = { readonly trip: Trip; readonly proposals: readonly Proposal[]; readonly previewSlots: readonly PreviewSlot[] };

/** Les quatre voyages de `listTrips` de `mock`, dans l'ordre de `DEFAULT_ENTRIES` (`src/adapters/mock.ts`). */
export const VOYAGES_SIMULES: readonly VoyageSimule[] = [
  { trip: edimbourg, proposals: propositions, previewSlots: apercu },
  { trip: edimbourgDebloque, proposals: propositionsDebloque, previewSlots: [] },
  { trip: lisbonne, proposals: [], previewSlots: [] },
  { trip: porto, proposals: [], previewSlots: [] },
];

/** Plage connue qui couvre toute étape (de minuit à minuit le lendemain). */
const PLAGE_JOURNEE: readonly Plage[] = [{ debut: 0, fin: 2880 }];

const cleTrajet = (depuis: string, vers: string, mode: ModeTrajet) => `${depuis}|${vers}|${mode}`;

/** Table du double, et constats de sa construction (contrôles préalables du module de données de test). */
export type TableRelectures = {
  readonly plages: ReadonlyMap<string, ReadonlyMap<string, readonly Plage[] | typeof INCONNU>>;
  readonly durees: ReadonlyMap<string, number>;
  /** Couples (point, point, mode) ou (lieu, date) qui recevraient deux valeurs : doit rester vide. */
  readonly conflits: readonly string[];
  /** Propositions dont la durée de `mock` diffère de celle déjà fixée par un segment (listées, sans échec). */
  readonly ecartsPropositions: readonly string[];
};

type Etape = { readonly lieu: string; readonly stop: Stop };

/** Points avec lieu d'un jour converti : étapes de la ligne du jour (sentinelle pour celles sans lieu). */
function etapes(items: readonly DayLineItem[]): Etape[] {
  return items.flatMap((item) => (item.type === "stop" ? [{ lieu: lieuConverti(item.stop), stop: item.stop }] : []));
}

/**
 * Segments d'une ligne de jour regroupés par couple de points avec lieu et mode : plusieurs segments de même mode entre
 * deux mêmes points reçoivent leur somme.
 */
function couplesDuJour(items: readonly DayLineItem[], logement: string): Map<string, number> {
  const parCouple = new Map<string, number>();
  let dernier = logement;
  let enAttente: { mode: ModeTrajet; minutes: number }[] = [];
  const resoudre = (vers: string) => {
    for (const segment of enAttente) {
      const cle = cleTrajet(dernier, vers, segment.mode);
      parCouple.set(cle, (parCouple.get(cle) ?? 0) + segment.minutes);
    }
    enAttente = [];
  };
  for (const item of items) {
    // Un segment sans durée (`null`, prototype seulement, décision 0092 § 4) n'a aucune durée à servir : il est
    // ignoré, jamais compté 0. Les voyages simulés n'en contiennent pas (MVP).
    if (item.type === "segment" && item.segment.minutes !== null) enAttente.push({ mode: item.segment.mode, minutes: item.segment.minutes });
    else if (item.type === "stop") {
      const lieu = lieuConverti(item.stop);
      resoudre(lieu);
      dernier = lieu;
    }
  }
  resoudre(logement);
  return parCouple;
}

/**
 * Table tirée du jeu simulé (B6a point 7) : pour chaque segment, la durée de son mode entre les points avec lieu qui
 * l'encadrent (logement au début et à la fin) — plusieurs segments de même mode entre deux mêmes points sont mesurés
 * ensemble et reçoivent leur **somme** (J5 d'Édimbourg : 50 + 20 = 70) ; pour chaque proposition qui porte
 * `travelFromPrevious`, la durée de `mock` depuis le dernier point avec lieu avant son heure, si ce couple n'est pas
 * déjà fixé ; des plages connues pour chaque étape, sauf celles que `mock` marque `toConfirm` (`inconnu`).
 */
export function tableDesRelectures(voyages: readonly VoyageSimule[] = VOYAGES_SIMULES): TableRelectures {
  const plages = new Map<string, Map<string, readonly Plage[] | typeof INCONNU>>();
  const durees = new Map<string, number>();
  const conflits: string[] = [];
  const ecartsPropositions: string[] = [];

  const poserPlages = (lieu: string, date: string, stop: Stop) => {
    const valeur = stop.exceptions.includes("toConfirm") ? INCONNU : PLAGE_JOURNEE;
    const parDate = plages.get(lieu) ?? new Map<string, readonly Plage[] | typeof INCONNU>();
    const existante = parDate.get(date);
    if (existante !== undefined && existante !== valeur) conflits.push(`plages ${lieu} ${date}`);
    parDate.set(date, valeur);
    plages.set(lieu, parDate);
  };
  const poserDuree = (cle: string, minutes: number) => {
    const existante = durees.get(cle);
    if (existante !== undefined && existante !== minutes) conflits.push(`durée ${cle} : ${existante} et ${minutes}`);
    else durees.set(cle, minutes);
  };

  for (const { trip, proposals } of voyages) {
    const logement = logementDeTest(trip.id);
    const joursParIndex = new Map(trip.days.map((day) => [day.index, day]));
    for (const day of trip.days) {
      for (const { lieu, stop } of etapes(day.items)) poserPlages(lieu, day.date, stop);
      for (const event of day.events) poserPlages(lieuConverti(event), day.date, event);
      for (const [cle, minutes] of couplesDuJour(day.items, logement)) poserDuree(cle, minutes);
    }
    for (const proposal of proposals) {
      const trajet = proposal.travelFromPrevious;
      const jour = joursParIndex.get(proposal.day);
      if (jour === undefined) continue;
      poserPlages(lieuConverti(proposal.stop), jour.date, proposal.stop);
      // Sans trajet ou sans durée (`null`, décision 0092 § 4) : rien à servir pour cette proposition, jamais 0.
      if (trajet === undefined || trajet.minutes === null) continue;
      const instant = proposal.time;
      let depuis = logement;
      for (const { lieu, stop } of etapes(jour.items)) if (stop.id !== proposal.stop.id && stop.start < instant) depuis = lieu;
      const cle = cleTrajet(depuis, lieuConverti(proposal.stop), trajet.mode);
      const existante = durees.get(cle);
      if (existante === undefined) durees.set(cle, trajet.minutes);
      else if (existante !== trajet.minutes) ecartsPropositions.push(`${proposal.id} : ${trajet.minutes} dans mock, ${existante} par le segment`);
    }
    // Remplacement d'une étape par une autre proposition du même créneau (M1g, ticket 869) : une option d'un créneau (même
    // jour, même heure, même nature qu'une étape du programme) prend les durées de cette étape vers ses voisins, si son
    // couple n'en a pas déjà une. Aucune durée n'est inventée pour un lieu sans étape au même créneau.
    for (const proposal of proposals) {
      const jour = joursParIndex.get(proposal.day);
      const occupee = jour === undefined ? undefined : etapes(jour.items).find(({ stop }) => stop.id !== proposal.stop.id && stop.start === proposal.time && stop.kind === proposal.kind);
      if (occupee === undefined) continue;
      const option = lieuConverti(proposal.stop);
      for (const [cle, minutes] of [...durees]) {
        const [de, vers, mode] = cle.split("|");
        if (de === undefined || vers === undefined || mode === undefined) continue;
        const reprise = de === occupee.lieu && vers !== option ? cleTrajet(option, vers, mode as ModeTrajet) : vers === occupee.lieu && de !== option ? cleTrajet(de, option, mode as ModeTrajet) : undefined;
        if (reprise !== undefined && !durees.has(reprise)) durees.set(reprise, minutes);
      }
    }
    // Réserve du jeu simulé de révision (M1g, PR 869 ; `src/mocks/edimbourg-revision.ts`) : la proposition d'un brouillon de
    // remplacement reçoit, vers ses voisins, les durées de ce brouillon (« [Dégustation…] » : 25 min avant, 10 min après),
    // et des plages connues ; seuls les couples qui touchent son lieu, et jamais un couple déjà fixé.
    for (const { draft } of trip.id === edimbourg.id ? edimbourgRevision.replacements : []) {
      const option = lieuConverti(draft.proposal);
      for (const day of draft.days) {
        poserPlages(option, day.date, draft.proposal);
        for (const [cle, minutes] of couplesDuJour(day.items, logement)) {
          const [de, vers] = cle.split("|");
          if ((de === option || vers === option) && !durees.has(cle)) durees.set(cle, minutes);
        }
      }
    }
  }
  return { plages, durees, conflits, ecartsPropositions };
}

export type DoubleRelectures = SourceRelectures & {
  /** Nombre d'appels de `pour` depuis la création. */
  appels(): number;
  /** Dernière demande reçue (lecture des tests). */
  derniereDemande(): DemandeRelectures | undefined;
  /** Dernier voyage reçu (contexte, portée et séjours posés par le cas d'usage ; lecture des tests, 0100 § 3.2 point 1). */
  dernierVoyage(): VoyageARelire | undefined;
  /**
   * `placeId` interrogés (`validite` ou `plages`) alors qu'ils ne figurent pas dans la demande vue par le double, distincts,
   * dans l'ordre d'apparition (décision 0100 § 4.3 : renforce `relectures: la demande couvre l'assemblage`, que la
   * non-relecture d'un lieu, devenue sans `toConfirm`, ne détecterait plus par la sortie seule).
   */
  lieuxHorsDemande(): readonly string[];
};

export type OptionsDoubleRelectures = {
  /** Refus simulé de chaque appel. */
  readonly refus?: RefusRelectures;
  /** Exception levée par chaque appel (le cas d'usage la lit comme `unavailable`). */
  readonly leve?: boolean;
  /** Demande vue par le double (pour en retirer une entrée : « un double privé d'une entrée »). */
  readonly filtrerDemande?: (demande: DemandeRelectures) => DemandeRelectures;
  /** Table utilisée ; par défaut, celle des quatre voyages simulés. */
  readonly table?: TableRelectures;
};

const memePoint = (a: Point, b: Point) =>
  ("lieu" in a && "lieu" in b && a.lieu === b.lieu) || ("logement" in a && "logement" in b && a.logement === b.logement);

export function creerRelecturesVoyages(options: OptionsDoubleRelectures = {}): DoubleRelectures {
  const table = options.table ?? tableDesRelectures();
  let appels = 0;
  let derniere: DemandeRelectures | undefined;
  let dernierVoyage: VoyageARelire | undefined;
  const horsDemande: string[] = [];
  return {
    async pour(voyage: VoyageARelire, demandeRecue: DemandeRelectures) {
      appels += 1;
      derniere = demandeRecue;
      dernierVoyage = voyage;
      if (options.leve) throw new Error("double de relectures : exception simulée");
      if (options.refus !== undefined) return { ok: false as const, refus: options.refus };
      const demande = options.filtrerDemande ? options.filtrerDemande(demandeRecue) : demandeRecue;
      const lieu = (point: Point): string | null => ("lieu" in point ? point.lieu : (voyage.logementsParNuit[point.logement] ?? null));
      const demandeLieu = (placeId: string) => {
        const entree = demande.lieux.find((e) => e.placeId === placeId);
        if (entree === undefined && !horsDemande.includes(placeId)) horsDemande.push(placeId);
        return entree;
      };
      const relectures: Relectures = {
        validite(placeId): Validite {
          return demandeLieu(placeId) !== undefined && table.plages.has(placeId) ? "valide" : INCONNU;
        },
        plages(placeId, date) {
          if (!(demandeLieu(placeId)?.dates.includes(date) ?? false)) return INCONNU;
          return table.plages.get(placeId)?.get(date) ?? INCONNU;
        },
        duree(depuis, vers, mode): Duree | typeof INCONNU {
          const demandee = demande.trajets.some((t) => memePoint(t.depuis, depuis) && memePoint(t.vers, vers) && t.modes.includes(mode));
          const a = lieu(depuis);
          const b = lieu(vers);
          if (!demandee || a === null || b === null) return INCONNU;
          const minutes = table.durees.get(cleTrajet(a, b, mode));
          return minutes === undefined ? INCONNU : { minutes, estimee: false };
        },
      };
      return { ok: true as const, relectures };
    },
    appels: () => appels,
    derniereDemande: () => derniere,
    dernierVoyage: () => dernierVoyage,
    lieuxHorsDemande: () => [...horsDemande],
  };
}
