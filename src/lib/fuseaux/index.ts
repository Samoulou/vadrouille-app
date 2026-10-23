import PAYS from "./pays.json";
import VILLES from "./villes.json";

/**
 * Table maison des villes et de leur fuseau IANA, et règle « même décalage pendant les dates du voyage » (décision 0087
 * § 4 et § 5, amendant 0081 B9-TL-7 ; spécification B9, B9-PO-18). **Module partagé pur** : table embarquée, fonctions
 * pures, aucune entrée ni sortie ; ni `zod`, ni valeur de `@/contracts`, ni `@/server`. Importé par l'écran 1
 * (`src/features`, tâche d'interface à part) et par `createTrip` (`src/server/creation/`), qui revérifie (le serveur fait
 * foi, F8-PO-17). Aucune donnée Google : le fuseau d'un voyage n'est jamais tiré d'une réponse Google (B9-PO-3).
 */

const TABLE: ReadonlyMap<string, string> = new Map(Object.entries(VILLES as Record<string, string>));

/**
 * Table maison ville → pays (spécification E2E-essai, lot 3, décision D1 : jamais Google, jamais demandé à la personne),
 * mêmes clés que la table des fuseaux (test d'égalité) ; nom du pays en français, comme le champ `pays` d'un brief du
 * prototype (`prototype/briefs/`).
 */
const PAYS_PAR_VILLE: ReadonlyMap<string, string> = new Map(Object.entries(PAYS as Record<string, string>));

const QUART_D_HEURE_MS = 15 * 60_000;
const JOUR_MS = 86_400_000;

/**
 * Clé de recherche d'une ville : minuscules, sans accents, tirets et apostrophes changés en espaces, espaces superflus
 * retirés (0081 B9-TL-7 point 1).
 */
export function cleVille(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const formateurs = new Map<string, Intl.DateTimeFormat | null>();

/** Formateur du fuseau, créé une fois ; `null` si le moteur JavaScript ne connaît pas le fuseau. */
function formateur(zone: string): Intl.DateTimeFormat | null {
  if (!formateurs.has(zone)) {
    let valeur: Intl.DateTimeFormat | null;
    try {
      valeur = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      valeur = null;
    }
    formateurs.set(zone, valeur);
  }
  return formateurs.get(zone) ?? null;
}

/** Vrai si le moteur JavaScript qui exécute reconnaît le fuseau (0087 § 4.1). */
export function fuseauReconnu(zone: string): boolean {
  return formateur(zone) !== null;
}

/**
 * Fuseau IANA d'une ville de la table, ou `null` (ville inconnue, ou fuseau que le moteur JavaScript ne reconnaît pas :
 * traité comme inconnu, 0087 § 4.1).
 */
export function fuseauDeVille(nom: string): string | null {
  const zone = TABLE.get(cleVille(nom));
  return zone !== undefined && fuseauReconnu(zone) ? zone : null;
}

/** Pays d'une ville de la table (nom français, table maison), ou `null` pour une ville inconnue. */
export function paysDeVille(nom: string): string | null {
  return PAYS_PAR_VILLE.get(cleVille(nom)) ?? null;
}

/** Clés de la table des pays (tests). */
export function villesAvecPays(): readonly string[] {
  return [...PAYS_PAR_VILLE.keys()];
}

/** Décalage UTC du fuseau à l'instant donné, en minutes (à la seconde près). */
export function decalageMinutes(zone: string, instant: number): number {
  const format = formateur(zone);
  if (format === null) throw new RangeError("fuseau inconnu");
  const valeurs = new Map(format.formatToParts(new Date(instant)).map((partie) => [partie.type, Number(partie.value)]));
  const lu = (type: Intl.DateTimeFormatPartTypes) => valeurs.get(type) ?? 0;
  const local = Date.UTC(lu("year"), lu("month") - 1, lu("day"), lu("hour"), lu("minute"), lu("second"));
  return Math.round((local - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** Instant UTC de 00:00, heure locale du fuseau, à la date « AAAA-MM-JJ ». */
export function minuitLocal(zone: string, date: string): number {
  const [annee, mois, jour] = date.split("-").map(Number) as [number, number, number];
  const naif = Date.UTC(annee, mois - 1, jour);
  let instant = naif - decalageMinutes(zone, naif) * 60_000;
  instant = naif - decalageMinutes(zone, instant) * 60_000;
  return instant;
}

/** Date locale « AAAA-MM-JJ » du fuseau à l'instant donné (« arrivée au plus tôt aujourd'hui », F8c, B9b point 2). */
export function dateLocale(zone: string, instant: number): string {
  const naif = instant + decalageMinutes(zone, instant) * 60_000;
  return new Date(naif).toISOString().slice(0, 10);
}

/** Date suivante d'une date « AAAA-MM-JJ ». */
function lendemain(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + JOUR_MS).toISOString().slice(0, 10);
}

/**
 * Vrai si les deux fuseaux ont le même décalage UTC à chaque quart d'heure UTC de l'intervalle allant de 00:00 de la
 * date d'arrivée à 24:00 de la date de départ, **dates locales de la destination** (0087 § 5 points 1 et 2 ; premier
 * échantillon : le quart d'heure qui précède ou contient le début). Exact parce que les décalages et les instants de
 * changement des fuseaux de la table tombent sur des quarts d'heure UTC (test de la table).
 */
export function memeDecalage(destination: string, ville: string, arrivee: string, depart: string): boolean {
  if (destination === ville) return true;
  const debut = minuitLocal(destination, arrivee);
  const fin = minuitLocal(destination, lendemain(depart));
  for (let instant = Math.floor(debut / QUART_D_HEURE_MS) * QUART_D_HEURE_MS; instant <= fin; instant += QUART_D_HEURE_MS) {
    if (decalageMinutes(destination, instant) !== decalageMinutes(ville, instant)) return false;
  }
  return true;
}

/** Résultat du contrôle des villes d'un voyage : le fuseau du voyage et celui de chaque ville, ou la première ville refusée. */
export type ControleVilles =
  | { readonly ok: true; readonly fuseau: string; readonly fuseauxDesVilles: readonly string[] }
  | { readonly ok: false; readonly indice: number; readonly raison: "inconnue" | "decalage" };

/**
 * Contrôle des villes d'un voyage (B9-PO-18, 0087 § 5) : `villes[0]` est la destination, les suivantes les autres villes
 * dans l'ordre du brouillon. Chaque ville doit être connue de la table, et chaque autre ville avoir le même décalage
 * que la destination pendant tout le voyage (`arrivee` à `depart`, dates locales de la destination). Le fuseau du voyage
 * est celui de la destination ; chaque ville garde son identifiant (`event_occurrences.timezone`).
 */
export function controlerVilles(villes: readonly string[], arrivee: string, depart: string): ControleVilles {
  const fuseaux: string[] = [];
  for (const [indice, nom] of villes.entries()) {
    const zone = fuseauDeVille(nom);
    if (zone === null) return { ok: false, indice, raison: "inconnue" };
    fuseaux.push(zone);
  }
  const fuseau = fuseaux[0];
  if (fuseau === undefined) return { ok: false, indice: 0, raison: "inconnue" };
  for (const [indice, zone] of fuseaux.entries()) {
    if (indice > 0 && !memeDecalage(fuseau, zone, arrivee, depart)) return { ok: false, indice, raison: "decalage" };
  }
  return { ok: true, fuseau, fuseauxDesVilles: fuseaux };
}

/** Clés de la table (tests). */
export function villesConnues(): readonly string[] {
  return [...TABLE.keys()];
}

/** Fuseaux distincts de la table (tests). */
export function fuseauxDeLaTable(): readonly string[] {
  return [...new Set(TABLE.values())];
}
