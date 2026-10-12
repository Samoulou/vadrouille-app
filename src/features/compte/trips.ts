import type { TripSummary } from "@/contracts";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";
import type { LastTab } from "@/features/voyage/trip-session";
import { localDateAt, type IsoDate } from "@/features/voyage/today";

/**
 * Classement et réouverture des voyages de « Mes voyages » (écran 17 ; spécification F11, F11-PO-2 à F11-PO-6 ;
 * décision 0021 § 3). Fonctions pures : la date de référence est calculée **par voyage**, à son fuseau
 * (`localDateAt`), depuis l'instant `now` lu dans le navigateur après le montage.
 */

export interface TripSections {
  /** « En cours » : voyages débloqués dont la date du jour est entre `start` et `end` inclus. */
  current: TripSummary[];
  /** « À venir » : voyages débloqués qui commencent après la date du jour, par `start` croissant. */
  upcoming: TripSummary[];
  /** « Pas encore débloqués » : voyages non débloqués dont `end` n'est pas passé, par `start` croissant. */
  locked: TripSummary[];
  /** « Passés » : voyages dont `end` est passé, débloqués ou non, par `end` décroissant. */
  past: TripSummary[];
  /** Voyage de la plaque : premier de « En cours », sinon de « À venir », sinon de « Pas encore débloqués ». */
  featured: TripSummary | null;
}

/** Date du jour à la destination du voyage. */
export function tripToday(summary: Pick<TripSummary, "timeZone">, now: number): IsoDate {
  return localDateAt(now, summary.timeZone);
}

/** À dates égales, l'ordre suit l'identifiant du voyage (ordre lexicographique croissant). */
const byId = (a: TripSummary, b: TripSummary) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function classifyTrips(summaries: readonly TripSummary[], now: number): TripSections {
  const current: TripSummary[] = [];
  const upcoming: TripSummary[] = [];
  const locked: TripSummary[] = [];
  const past: TripSummary[] = [];
  for (const summary of summaries) {
    // Dates ISO « AAAA-MM-JJ » : l'ordre des chaînes est celui du calendrier.
    const today = tripToday(summary, now);
    if (summary.end < today) past.push(summary);
    else if (!summary.unlocked) locked.push(summary);
    else if (summary.start <= today) current.push(summary);
    else upcoming.push(summary);
  }
  const byStart = (a: TripSummary, b: TripSummary) => compare(a.start, b.start) || byId(a, b);
  current.sort(byStart);
  upcoming.sort(byStart);
  locked.sort(byStart);
  past.sort((a, b) => compare(b.end, a.end) || byId(a, b));
  const featured = current[0] ?? upcoming[0] ?? locked[0] ?? null;
  return { current, upcoming, locked, past, featured };
}

/**
 * Cible du lien d'un voyage (F11-PO-5, règles de navigation du handover § 6) :
 * 1. aux dates du voyage, l'écran 15 « Pendant le voyage » — **pas encore dans `main`** (F10a) : F10a ajoute
 *    cette règle avec `tripRoutes(…).aujourdhui()` ;
 * 2. sinon, le dernier onglet consulté dans l'onglet du navigateur (Séjour, ou Journée `n` si ce jour existe) ;
 * 3. sinon, le Séjour d'un voyage débloqué ou passé, la présentation (« Tes premières propositions ») d'un
 *    voyage non débloqué dont la fin n'est pas passée.
 */
export function reopenTarget(summary: TripSummary, now: number, lastTab: LastTab | undefined): string {
  const routes = tripRoutes("/voyages", summary.id);
  if (lastTab?.kind === "sejour") return routes.sejour();
  if (lastTab?.kind === "jour" && Number.isInteger(lastTab.n) && lastTab.n >= 1 && lastTab.n <= summary.dayCount) {
    return routes.jour(lastTab.n);
  }
  if (!summary.unlocked && summary.end >= tripToday(summary, now)) return presentationRoute(summary.id);
  return routes.sejour();
}
