import "server-only";

import type { AdapterContext, TripAdapter } from "@/adapters/types";
import type { Stop, Trip } from "@/contracts";
import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_VERSION, type AccountExport, AccountExportSchema } from "@/contracts/account-export";
import { instantaneDuProgramme } from "@/server/programme/instantane";

/**
 * « Exporter mes données » sur `mock` (spécification M9 § 6.4, critère 10 ; forme T8 proposée par la spécification, à
 * confirmer par le Tech Lead ; ticket 1122, M9c) : un fichier construit **depuis le jeu simulé**, validé par **le même
 * schéma** que l'export réel (`AccountExportSchema`, strict). Les voyages viennent de l'adaptateur de lecture reçu
 * (`listTrips` puis `getTrip`) ; le programme de chacun est projeté sur le schéma de stockage par
 * `instantaneDuProgramme` (sans durée de trajet, sans `verifiedAt`, sans `toConfirm`), comme une version unique.
 *
 * Ce que le jeu simulé ne porte pas reste vide (briefs, logements, tri, avis, rappels, liens, paiements, goûts) : rien
 * n'est inventé. Seule convention : le jeu simulé n'a aucun instant de création ; `createdAt` vaut `INSTANT_SIMULE`.
 */

/** Instant de création conventionnel du compte et des voyages simulés (le jeu simulé n'en porte aucun). */
export const INSTANT_SIMULE = "2026-01-01T00:00:00.000Z";

export type EntreeExportSimule = {
  readonly lecteur: Pick<TripAdapter, "listTrips" | "getTrip">;
  readonly ctx: AdapterContext;
  /** Adresse du compte simulé. */
  readonly email: string;
  readonly maintenant: Date;
  /** Texte `notice` du fichier (`src/i18n/fr/compte.json`). */
  readonly notice: string;
};

/**
 * Journées sans l'exception `toConfirm` : elle est calculée à la lecture, jamais stockée (le schéma de stockage la
 * refuse, `refineSnapshotExceptions`) ; un instantané réel ne la porte pas non plus.
 */
function journeesStockees(voyage: Trip): Pick<Trip, "days"> {
  const etape = (stop: Stop): Stop => ({ ...stop, exceptions: stop.exceptions.filter((exception) => exception !== "toConfirm") });
  return {
    days: voyage.days.map((jour) => ({
      ...jour,
      items: jour.items.map((item) => (item.type === "stop" ? { ...item, stop: etape(item.stop) } : item)),
      events: jour.events.map(etape),
    })),
  };
}

/** Fichier du compte simulé ; lève (`ZodError`) si le schéma strict refuse une valeur du jeu simulé. */
export async function construireExportSimule({ lecteur, ctx, email, maintenant, notice }: EntreeExportSimule): Promise<AccountExport> {
  const resumes = await lecteur.listTrips(ctx);
  const trips = [];
  for (const resume of [...resumes].sort((a, b) => a.id.localeCompare(b.id))) {
    const voyage = await lecteur.getTrip(ctx, resume.id);
    if (voyage === null) continue;
    trips.push({
      id: voyage.id,
      destination: voyage.destination,
      startDate: voyage.start,
      endDate: voyage.end,
      timeZone: voyage.timeZone,
      travellers: { adults: voyage.travellers.adults, children: voyage.travellers.children },
      status: "active",
      createdAt: INSTANT_SIMULE,
      unlocked: voyage.unlocked,
      currentVersion: 1,
      briefs: [],
      stays: [],
      commitments: [],
      versions: [{ version: 1, parentVersion: null, authorKind: "engine", createdAt: INSTANT_SIMULE, days: instantaneDuProgramme(journeesStockees(voyage)).days }],
      deck: { proposals: [], gestures: [], closures: [] },
      checklist: voyage.checklist.map((ligne) => ({ label: ligne.label, moment: ligne.when, done: ligne.done, bookingUrl: ligne.bookingUrl ?? null })),
      reports: [],
      reviews: [],
      reminders: { consents: [], sends: [] },
      shareLinks: [],
      payments: [],
      entitlements: [],
    });
  }
  return AccountExportSchema.parse({
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: maintenant.toISOString(),
    notice,
    account: { email, createdAt: INSTANT_SIMULE },
    trips,
    tastes: [],
  });
}
