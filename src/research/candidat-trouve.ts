import "server-only";

import { z } from "zod";

import { LONGUEURS_TEXTE, texteMaison } from "@/ai/candidat";
import { CODES_ERREUR_IA } from "@/ai/erreurs";
import { CategorySchema, IsoDateSchema, STOP_KINDS, StopFactsSchema, TimeSchema, TimeZoneSchema, type Category, type StopFacts } from "@/contracts";
import type { CandidatRecherche } from "@/research/candidat";

/**
 * Candidats maison de la recherche de production et lignes à écrire (spécification B7, B7-PO-10 et B7-PO-11 ; décision
 * 0096) : **types en mémoire** et fonctions pures. Aucune donnée Google : ces valeurs viennent de la recherche web
 * seulement. B9 écrit les lignes (`candidates`, `event_occurrences`) et y ajoute `id`, `organization_id`, `trip_id` et
 * `research_run_id` ; il ne transforme rien d'autre.
 */

/** Source retenue d'un candidat (B7-PO-6) : `label` = nom d'hôte sans `www.`, `url` en `https:`, `checkedOn` = date de la lecture de la page, ou de la recherche si la page n'a pas été lue. */
export const SourceTrouveeSchema = z.strictObject({
  label: z.string().min(1).max(253),
  url: z
    .string()
    .min(1)
    .max(2048)
    .refine((valeur) => URL.canParse(valeur) && new URL(valeur).protocol === "https:", "source https: exigée"),
  checkedOn: IsoDateSchema,
});
export type SourceTrouvee = z.infer<typeof SourceTrouveeSchema>;

/**
 * Candidat trouvé (B7-PO-10), **en mémoire** : il ne correspond pas une à une à `candidates` (`versLignes`). `facts`
 * suit B7-PO-11 ; `evenement` n'existe que pour un événement (`kind: "event"`), avec `lueA` = instant de la relecture de
 * la page (absent si la page n'a pas été lue) ; `confidence` n'est posée par aucune règle de B7b (question au Product
 * Owner) : `null`.
 */
export const CandidatTrouveSchema = z
  .strictObject({
    kind: z.enum(["place", "event"]),
    name: texteMaison(LONGUEURS_TEXTE.nom),
    summary: texteMaison(LONGUEURS_TEXTE.resume),
    category: CategorySchema,
    typeEtape: z.enum(STOP_KINDS),
    aReserver: z.boolean(),
    facts: StopFactsSchema,
    sources: z.array(SourceTrouveeSchema).min(1).max(5),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    evenement: z
      .strictObject({
        date: IsoDateSchema,
        heure: TimeSchema.optional(),
        dateConfirmee: z.boolean(),
        lueA: z.iso.datetime().optional(),
      })
      .optional(),
  })
  .superRefine((candidat, ctx) => {
    if ((candidat.kind === "event") !== (candidat.typeEtape === "event"))
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "kind et type d'étape incohérents",
      });
    if ((candidat.kind === "event") !== (candidat.evenement !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["evenement"],
        message: "un événement, et lui seul, porte sa date",
      });
    if (candidat.facts.area !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["facts", "area"],
        message: "aucun secteur (B7-PO-11)",
      });
    // Infos pratiques : jamais dans `candidates.facts`, fermé sur `STOP_FACTS_KEYS` (décision 0103, condition 2 de Q-L4a).
    const { tip, priceNote, hoursNote } = candidat.facts;
    if (tip !== undefined || priceNote !== undefined || hoursNote !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["facts"],
        message: "aucune info pratique dans le candidat (décision 0103)",
      });
    if (candidat.facts.costPerPerson !== undefined && candidat.facts.costPerPerson !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["facts", "costPerPerson"],
        message: "coût 0 seulement (B7-PO-11)",
      });
    }
  });
export type CandidatTrouve = z.infer<typeof CandidatTrouveSchema>;

/**
 * Bilan d'une recherche (B7-PO-10) : les colonnes de `research_runs` que la recherche connaît (`queries`, `pagesRead`,
 * `durationMs`, `costEstimateMicros`, `errors`). **Aucun compteur de candidats** (0011 point 2, S4).
 */
export const BilanRechercheSchema = z.strictObject({
  /** Requêtes web émises (déjà filtrées de toute donnée du brief par l'agent). */
  queries: z.array(z.string().min(1).max(LONGUEURS_TEXTE.requete)),
  pagesRead: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  costEstimateMicros: z.number().int().min(0),
  /** Codes fermés de la couche IA ; jamais un message. */
  errors: z.array(z.enum(CODES_ERREUR_IA)),
});
export type BilanRecherche = z.infer<typeof BilanRechercheSchema>;

// --- Faits et sources (B7-PO-6 et B7-PO-11) -------------------------------------------------------------------------------

/**
 * Faits d'un candidat (B7-PO-11, même règle que P0, `faitsDe` de `src/server/p0/vers-moteur.ts`) :
 * - `durationMinutes` = durée de visite lue sur la source, absente si aucune source ne la donne ;
 * - `costPerPerson` = **0 seulement** quand la source dit le lieu gratuit ; un prix non nul est omis (aucune conversion de
 *   devise) ;
 * - `area` = absente (aucun prompt ne demande de secteur, et B8 ne peut pas le tirer de Google, 0016 § 4.3).
 */
export function faitsDe(candidat: Pick<CandidatRecherche, "dureeMinutes" | "prixParPersonne">): StopFacts {
  return {
    ...(candidat.dureeMinutes === undefined ? {} : { durationMinutes: candidat.dureeMinutes }),
    ...(candidat.prixParPersonne === 0 ? { costPerPerson: 0 } : {}),
  };
}

/** `label` d'une source : nom d'hôte de l'URL sans `www.` (texte maison, jamais un titre de page recopié). */
export function libelleSource(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

// --- Lignes à écrire (B7-PO-10) ----------------------------------------------------------------------------------------------

/**
 * Colonnes de contenu de `candidates` (noms de propriétés Drizzle de `db/schema/business.ts`) : `kind`, `name`, `summary`,
 * `category`, `facts`, `sources`, `confidence`, et `stopKind` et `toReserve` (colonnes ajoutées par B9b, 0081 B9-TL-6
 * (g), « remplies par `versLignes` »). B9 y ajoute `id`, `organizationId`, `tripId`, `researchRunId`.
 */
export type LigneCandidat = {
  readonly kind: "place" | "event";
  readonly name: string;
  readonly summary: string;
  readonly category: Category;
  readonly facts: StopFacts;
  readonly sources: readonly SourceTrouvee[];
  readonly confidence: "low" | "medium" | "high" | null;
  readonly stopKind: "activity" | "meal" | "event";
  readonly toReserve: boolean;
};

/** Colonnes de `event_occurrences` ; B9 y ajoute `id`, `organizationId`, `tripId`, `candidateId`. */
export type LigneOccurrence = {
  /** Date et heure lues, dans le fuseau de la ville. */
  readonly startsAt: Date;
  readonly endsAt: null;
  readonly timezone: string;
  readonly category: Category;
  readonly priceNote: null;
  readonly sourceUrl: string;
  /** Instant de la relecture de la page de l'événement (jamais Google) ; nul si la page n'a pas été lue. */
  readonly sourceCheckedAt: Date | null;
  readonly status: "confirmed" | "unconfirmed";
};

export type LignesCandidat = {
  readonly candidat: LigneCandidat;
  readonly occurrence: LigneOccurrence | null;
};

/** Décalage (ms) du fuseau à l'instant donné : heure murale du fuseau lue comme si elle était UTC, moins l'instant. */
function decalageDuFuseau(instant: number, formateur: Intl.DateTimeFormat): number {
  const minute = Math.floor(instant / 60_000) * 60_000;
  const parties = new Map<string, string>(formateur.formatToParts(new Date(minute)).map((partie) => [partie.type, partie.value]));
  const nombre = (type: string) => Number(parties.get(type));
  const mur = Date.UTC(nombre("year"), nombre("month") - 1, nombre("day"), nombre("hour") % 24, nombre("minute"));
  return mur - minute;
}

/**
 * Instant (UTC) d'une date et d'une heure lues dans le fuseau IANA d'une ville. Deux passes pour tenir compte d'un
 * changement d'heure entre l'estimation et le résultat ; une heure qui n'existe pas (saut d'heure) donne l'instant qui
 * suit le saut. Lève une `RangeError` pour un fuseau inconnu.
 */
export function instantLocal(date: string, heure: string, fuseau: string): Date {
  if (!TimeZoneSchema.safeParse(fuseau).success) throw new RangeError("instantLocal : fuseau inconnu");
  const [annee, mois, jour] = date.split("-").map(Number);
  const [h, minutes] = heure.split(":").map(Number);
  if (annee === undefined || mois === undefined || jour === undefined || h === undefined || minutes === undefined)
    throw new RangeError("instantLocal : date ou heure illisible");
  const formateur = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const mur = Date.UTC(annee, mois - 1, jour, h, minutes);
  const premier = mur - decalageDuFuseau(mur, formateur);
  return new Date(mur - decalageDuFuseau(premier, formateur));
}

/**
 * Lignes à écrire pour un candidat et le fuseau IANA de sa ville (fourni par B9, `Trip.timeZone`, question 13 (c) de la
 * spécification B7) : une ligne `candidates` qui n'a que les colonnes de contenu ; pour un événement dont l'**heure est
 * lue**, une ligne `event_occurrences` (`startsAt` dans le fuseau donné, `status` `confirmed` si `dateConfirmee`, sinon
 * `unconfirmed`, `endsAt` et `priceNote` nuls) ; un événement **sans heure lue** n'a pas d'occurrence (`starts_at` est
 * obligatoire : question 13 (b)). Fonction pure ; le candidat est revalidé (une valeur hors schéma lève).
 */
export function versLignes(candidat: CandidatTrouve, fuseau: string): LignesCandidat {
  const valide = CandidatTrouveSchema.parse(candidat);
  const ligne: LigneCandidat = {
    kind: valide.kind,
    name: valide.name,
    summary: valide.summary,
    category: valide.category,
    facts: valide.facts,
    sources: valide.sources,
    confidence: valide.confidence,
    stopKind: valide.typeEtape,
    toReserve: valide.aReserver,
  };
  const evenement = valide.evenement;
  const source = valide.sources[0];
  if (evenement === undefined || evenement.heure === undefined || source === undefined) return { candidat: ligne, occurrence: null };
  return {
    candidat: ligne,
    occurrence: {
      startsAt: instantLocal(evenement.date, evenement.heure, fuseau),
      endsAt: null,
      timezone: fuseau,
      category: valide.category,
      priceNote: null,
      sourceUrl: source.url,
      sourceCheckedAt: evenement.lueA === undefined ? null : new Date(evenement.lueA),
      status: evenement.dateConfirmee ? "confirmed" : "unconfirmed",
    },
  };
}
