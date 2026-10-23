import PAYS from "./pays.json";
import VILLES from "./villes.json";

/**
 * Table maison des villes et de leur fuseau IANA, et règle « même décalage pendant les dates du voyage » (décision 0087
 * § 4 et § 5, amendant 0081 B9-TL-7 ; spécification B9, B9-PO-18). **Module partagé pur** : table embarquée, fonctions
 * pures, aucune entrée ni sortie ; ni `zod`, ni valeur de `@/contracts`, ni `@/server`. Importé par l'écran 1
 * (`src/features`, tâche d'interface à part) et par `createTrip` (`src/server/creation/`), qui revérifie (le serveur fait
 * foi, F8-PO-17). Aucune donnée Google : le fuseau d'un voyage n'est jamais tiré d'une réponse Google (B9-PO-3).
 */

/** Pays de la table maison : code ISO 3166-1 alpha-2, nom français, fuseaux (une région lisible quand il y en a plusieurs). */
export interface PaysDeLaTable {
  readonly code: string;
  readonly nom: string;
  /**
   * Fuseaux du pays ; pour un pays à plusieurs fuseaux, chacun a une région lisible et des repères maison (latitude,
   * longitude de villes du fuseau, valeurs maison, jamais Google) : la position d'une ville choisie est rattachée au
   * fuseau du repère le plus proche (`fuseauParPosition`).
   */
  readonly fuseaux: readonly { readonly zone: string; readonly region?: string; readonly reperes?: readonly (readonly number[])[] }[];
}

/**
 * Table maison des pays (demande de Samuel du 23 octobre 2026 : n'importe quelle ville sur le site d'essai) : nom
 * français et fuseaux IANA du pays, liste fermée. Une ville absente de la table des villes est acceptée avec un pays (et,
 * pour un pays à plusieurs fuseaux, une région) choisis dans cette liste ; jamais une donnée Google ni un appel réseau.
 */
const PAYS_PAR_CODE: ReadonlyMap<string, PaysDeLaTable> = new Map(
  Object.entries(PAYS as Record<string, Omit<PaysDeLaTable, "code">>).map(([code, pays]) => [code, { code, ...pays }]),
);

/**
 * Table maison ville → fuseau IANA et code du pays (spécification E2E-essai, lot 3, décision D1 : jamais Google) : villes
 * touristiques du monde entier, avec leurs noms courants (français, local, anglais), clés normalisées par `cleVille`.
 * Le pays rendu est le nom français de la table des pays, comme le champ `pays` d'un brief du prototype
 * (`prototype/briefs/`).
 */
const TABLE: ReadonlyMap<string, readonly [zone: string, pays: string, nom: string]> = new Map(
  Object.entries(VILLES as Record<string, string[]>).map(([cle, [zone = "", pays = "", nom = ""]]) => [cle, [zone, pays, nom]] as const),
);

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
  const zone = TABLE.get(cleVille(nom))?.[0];
  return zone !== undefined && fuseauReconnu(zone) ? zone : null;
}

/** Pays d'une ville de la table (nom français, table maison), ou `null` pour une ville inconnue. */
export function paysDeVille(nom: string): string | null {
  const code = TABLE.get(cleVille(nom))?.[1];
  return code === undefined ? null : (PAYS_PAR_CODE.get(code)?.nom ?? null);
}

/** Clés de la table des villes qui ont un pays de la table des pays (tests). */
export function villesAvecPays(): readonly string[] {
  return [...TABLE.entries()].filter(([, [, code]]) => PAYS_PAR_CODE.has(code)).map(([cle]) => cle);
}

/** Pays de la table, triés par nom dans l'ordre français (liste « Pays » de l'écran 1). */
export function listeDesPays(): readonly PaysDeLaTable[] {
  return [...PAYS_PAR_CODE.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Pays de la table par son code, ou `null` (code inconnu ou absent). */
export function paysParCode(code: string | undefined): PaysDeLaTable | null {
  return code === undefined ? null : (PAYS_PAR_CODE.get(code) ?? null);
}

/**
 * Fuseau d'un pays choisi par la personne (liste fermée, revérifiée par le serveur) : la valeur **de la table** si
 * `zone` est l'un des fuseaux du pays, ou si le pays n'a qu'un fuseau et que `zone` est absent ; sinon `null`. Une
 * chaîne reçue n'est jamais rendue telle quelle.
 */
export function fuseauDuPays(code: string | undefined, zone?: string): string | null {
  const pays = paysParCode(code);
  if (pays === null) return null;
  const trouve = zone === undefined ? (pays.fuseaux.length === 1 ? pays.fuseaux[0] : undefined) : pays.fuseaux.find((f) => f.zone === zone);
  return trouve !== undefined && fuseauReconnu(trouve.zone) ? trouve.zone : null;
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

/**
 * Ville de la table dans un pays donné (code ISO) : nom maison (nom français de la table) et fuseau, ou `null`. Sert à
 * retrouver le nom maison et le fuseau d'une ville choisie dans les suggestions Google (le nom Google n'est jamais repris).
 */
export function villeDuPays(nom: string, code: string): { readonly nom: string; readonly zone: string } | null {
  const ligne = TABLE.get(cleVille(nom));
  if (ligne === undefined || ligne[1] !== code || !fuseauReconnu(ligne[0])) return null;
  return { nom: ligne[2], zone: ligne[0] };
}

const RAYON_TERRE_KM = 6371;
const radians = (degres: number) => (degres * Math.PI) / 180;

/** Distance du grand cercle entre deux points, en kilomètres (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fuseau d'un pays de la table pour une position (celle de la ville choisie, lue en mémoire) : le seul fuseau du pays,
 * ou celui du repère maison le plus proche pour un pays à plusieurs fuseaux. Valeur **de la table**, jamais reçue ; `null`
 * pour un code inconnu ou une position invalide. Approximation près des limites de fuseau (signalée dans la PR).
 */
export function fuseauParPosition(code: string, position: { lat: number; lng: number }): string | null {
  const pays = paysParCode(code);
  if (pays === null || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  let meilleur: { zone: string; distance: number } | null = null;
  for (const fuseau of pays.fuseaux) {
    if (pays.fuseaux.length === 1) return fuseauReconnu(fuseau.zone) ? fuseau.zone : null;
    for (const [lat = Number.NaN, lng = Number.NaN] of fuseau.reperes ?? []) {
      const distance = distanceKm(position, { lat, lng });
      if (meilleur === null || distance < meilleur.distance) meilleur = { zone: fuseau.zone, distance };
    }
  }
  return meilleur !== null && fuseauReconnu(meilleur.zone) ? meilleur.zone : null;
}

/** Clés de la table (tests). */
export function villesConnues(): readonly string[] {
  return [...TABLE.keys()];
}

/** Fuseaux distincts de la table des villes (tests). */
export function fuseauxDeLaTable(): readonly string[] {
  return [...new Set([...TABLE.values()].map(([zone]) => zone))];
}

/** Fuseaux distincts de la table des pays (tests). */
export function fuseauxDesPays(): readonly string[] {
  return [...new Set([...PAYS_PAR_CODE.values()].flatMap((pays) => pays.fuseaux.map((f) => f.zone)))];
}

/** Code du pays d'une ville de la table, ou `null` (tests). */
export function codePaysDeVille(nom: string): string | null {
  return TABLE.get(cleVille(nom))?.[1] ?? null;
}
