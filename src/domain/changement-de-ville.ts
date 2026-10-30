import type { CommitmentKind, DayLineItem, MobilityMode, Pace, TransferItem } from "@/contracts";

import type { ConfigurationMoteur } from "@/domain/configuration";
import { repasDeLHeure } from "@/domain/squelette";
import { lire } from "@/domain/tables";
import { joursEntre, versHeure, versMinutes } from "@/domain/temps";

/**
 * Règles du changement de ville (spécification M4 § 3 ; décision 0148 § 5 et § 9 ; décision 0151 § 5 et § 6) : **module
 * pur**, une seule source de vérité. Il calcule, depuis les villes et les engagements du brouillon (`TripCommitment`, qui
 * portent `end`) et la configuration (`changementDeVille` de `moteur.json`) :
 * - la liste des changements de ville (date, ville quittée, ville d'arrivée), un par ville ajoutée (§ 3.1) ;
 * - pour chacun, le départ **saisi** (règle du billet de trajet, `engagementDuChangement`) ou **estimé**
 *   (`departEstime`, 0148 § 5.2), l'arrivée saisie, le mode estimé ;
 * - le **créneau occupé** par la ligne « Vers {ville} » (`creneauOccupe`, 0148 § 5.3 ; M4-suite § 3.2) et ses **marges**
 *   (`margesDuChangement`, M4-suite § 3.3) ;
 * - le nombre maximal d'activités (0148 § 5.4), réduit pour un **long changement de ville** (`activitesMaxDuChangement`,
 *   M4-suite § 3.6), et le thème « De {ville} à {ville} » ;
 * - la ville d'un engagement de ce jour (`villeDeLEngagement`, 0148 § 9 point 5) et le **chevauchement** d'un engagement
 *   avec la ligne « Vers {ville} » (`chevauchementDuChangement`, M4-suite § 3.5 point 4 et § 5), lu à l'affichage.
 *
 * Appelé par la conversion de `api` (`briefProgrammeDepuisFormulaire`), le cadrage (`cadrerProgramme`), l'assemblage et le
 * patch d'un jour de changement de ville (`appliquerPatch`). N'importe que `@/contracts` (types) et `src/domain` : aucune
 * entrée-sortie, ni `src/server`, ni `src/ai`, ni `src/grounding` (0149 § 6). Aucune donnée Google : les durées sont celles
 * de la personne (billet) ou du modèle (estimation), jamais d'un trajet calculé.
 */

/** Section `changementDeVille` de la configuration du moteur. */
export type ConfigurationChangementDeVille = ConfigurationMoteur["changementDeVille"];

/** Engagement lu par ce module : type, date, heures ; le libellé n'est lu que pour l'assemblage (`transfer.label`). */
export type EngagementLu = { readonly kind: CommitmentKind; readonly date: string; readonly start: string; readonly end?: string };

/** Ville du voyage, dans l'ordre : nom maison, date d'arrivée (le premier jour pour la première) et nuits. */
export type VilleDuVoyage = { readonly nom: string; readonly arrivee: string; readonly nuits: number };

/** Changement de ville calculé avant le prompt (0148 § 5.1 point 1). Aucun libellé : il ne va jamais au modèle (0149 § 1.2). */
export type ChangementDeVille = {
  readonly date: string;
  readonly de: string;
  readonly vers: string;
  readonly source: TransferItem["source"];
  /** Départ « HH:MM » : heure du billet ou du vol, sinon départ estimé. */
  readonly depart: string;
  /** Arrivée « HH:MM » : seulement l'heure de fin saisie d'un billet ou d'un vol. */
  readonly arrivee?: string;
  /** Mode d'un départ estimé (spécification M4 § 3.3) ; absent avec la marche seule. */
  readonly mode?: NonNullable<TransferItem["mode"]>;
  /** Activités au plus ce jour-là (`changementDeVille.activitesParRythme`). */
  readonly activitesMax: number;
  /** Rang, dans les engagements reçus, de l'engagement devenu ce changement de ville (départ saisi seulement). */
  readonly engagement?: number;
};

/**
 * **Détection du départ saisi** (règle du billet de trajet, spécification M4 § 3.3 ; 0148 § 9 point 1 ; condition T-M4S-2
 * de 0151 § 6) : rang du premier « Billet » (`ticket`) ou « Vol » (`flight`) de la date qui commence, dans l'ordre des heures
 * puis dans l'ordre de saisie ; `undefined` sans tel engagement (départ estimé). Une « Sortie » (`booking`) n'est jamais le
 * changement de ville. **Ne lit aucune configuration** et n'importe rien de `src/server` : l'aide de l'écran 1 (M4-suite
 * § 4.2) l'appelle côté client. Elle ne lit que le type, la date, l'heure de début et l'ordre de saisie.
 */
export function engagementDuChangement(engagements: readonly Pick<EngagementLu, "kind" | "date" | "start">[], date: string): number | undefined {
  let retenu: { readonly rang: number; readonly debut: string } | undefined;
  for (const [rang, engagement] of engagements.entries()) {
    if (engagement.date !== date || (engagement.kind !== "ticket" && engagement.kind !== "flight")) continue;
    // « HH:MM » : l'ordre des chaînes est celui des heures ; à heure égale, le premier saisi reste.
    if (retenu === undefined || engagement.start < retenu.debut) retenu = { rang, debut: engagement.start };
  }
  return retenu?.rang;
}

/**
 * Fin occupée d'un engagement (0148 § 5.2, `finOccupee` de `squelette.ts` appliquée à l'engagement) : son heure de fin,
 * sinon son début plus la durée par défaut de sa nature (repas si une « Sortie » commence dans une fenêtre de repas, comme
 * `blocEngagement` ; activité sinon). En minutes depuis minuit.
 */
export function finOccupeeEngagement(engagement: EngagementLu, configuration: ConfigurationMoteur): number {
  const debut = versMinutes(engagement.start);
  if (engagement.end !== undefined) return Math.max(debut, versMinutes(engagement.end));
  const repas = engagement.kind === "booking" ? repasDeLHeure(debut, configuration) : undefined;
  return debut + (repas === undefined ? configuration.dureesParDefaut.activity : lire(configuration.dureesParDefaut, repas));
}

/**
 * Départ estimé d'un changement de ville sans billet ni vol (0148 § 5.2 ; M4-suite § 3.1, M4S-PO-2) : la plus tardive des
 * fins occupées des engagements de ce jour qui ne dépassent pas `limite` (18:00, comptée), **plus** la marge avant un départ
 * estimé (`margesMinutes.avantDepart.estimated`, 30 minutes), arrondie au **quart d'heure supérieur** (`arrondiMinutes`),
 * sans descendre sous `heureParDefaut` (10:00) ; sans telle fin, `heureParDefaut`. En « HH:MM ».
 */
export function departEstime(engagements: readonly EngagementLu[], date: string, configuration: ConfigurationMoteur): string {
  const { departEstime: regle, margesMinutes } = configuration.changementDeVille;
  const plancher = versMinutes(regle.heureParDefaut);
  let derniereFin: number | undefined;
  for (const engagement of engagements) {
    if (engagement.date !== date) continue;
    const fin = finOccupeeEngagement(engagement, configuration);
    if (fin <= versMinutes(regle.limite) && (derniereFin === undefined || fin > derniereFin)) derniereFin = fin;
  }
  if (derniereFin === undefined) return versHeure(plancher);
  const avecMarge = derniereFin + margesMinutes.avantDepart.estimated;
  const arrondi = Math.ceil(avecMarge / regle.arrondiMinutes) * regle.arrondiMinutes;
  return versHeure(Math.max(plancher, arrondi));
}

/** Mode d'un départ estimé (spécification M4 § 3.3) : voiture si cochée, sinon transports publics, sinon aucun. */
export function modeEstime(deplacements: readonly MobilityMode[]): ChangementDeVille["mode"] {
  if (deplacements.includes("car")) return "car";
  return deplacements.includes("transit") ? "transit" : undefined;
}

/**
 * Changements de ville d'un voyage (spécification M4 § 3.1 ; 0148 § 5.1 point 1) : un par ville ajoutée, à sa date
 * d'arrivée, de la ville précédente vers elle. Départ saisi si `engagementDuChangement` en trouve un ce jour-là (heure de
 * début et, si saisie, de fin), sinon estimé (`departEstime`, mode de `modeEstime`).
 */
export function changementsDuVoyage(
  villes: readonly VilleDuVoyage[],
  engagements: readonly EngagementLu[],
  voyage: { readonly pace: Pace; readonly deplacements: readonly MobilityMode[] },
  configuration: ConfigurationMoteur,
): ChangementDeVille[] {
  const parRythme = lire(configuration.changementDeVille.activitesParRythme, voyage.pace);
  const changements: ChangementDeVille[] = [];
  for (const [rang, ville] of villes.entries()) {
    const precedente = rang === 0 ? undefined : villes.at(rang - 1);
    if (precedente === undefined) continue;
    const date = ville.arrivee;
    const saisi = engagementDuChangement(engagements, date);
    const engagement = saisi === undefined ? undefined : engagements.at(saisi);
    if (saisi !== undefined && engagement !== undefined) {
      const arrivee = engagement.end !== undefined && engagement.end > engagement.start ? engagement.end : undefined;
      // Long changement de ville (M4-suite § 3.6 point 2) : durée connue dès le brouillon pour un départ saisi avec fin.
      const activitesMax = activitesMaxDuChangement(parRythme, dureeConnue({ source: "entered", start: engagement.start, ...(arrivee === undefined ? {} : { end: arrivee }) }), configuration);
      changements.push({
        date,
        de: precedente.nom,
        vers: ville.nom,
        source: "entered",
        depart: engagement.start,
        ...(arrivee === undefined ? {} : { arrivee }),
        activitesMax,
        engagement: saisi,
      });
      continue;
    }
    const mode = modeEstime(voyage.deplacements);
    changements.push({
      date,
      de: precedente.nom,
      vers: ville.nom,
      source: "estimated",
      depart: departEstime(engagements, date, configuration),
      ...(mode === undefined ? {} : { mode }),
      // Durée estimée inconnue avant la rédaction : le maximum du long changement de ville est appliqué au cadrage.
      activitesMax: parRythme,
    });
  }
  return changements;
}

/** Durée estimée admise (0148 § 2 point 2 ; 0149 S-M4-2 point 3) : entier dans `dureeEstimeeMinutes`, arrondi aux 5 minutes. */
export function dureeEstimeeAdmise(valeur: unknown, configuration: ConfigurationMoteur): number | undefined {
  const { min, max } = configuration.changementDeVille.dureeEstimeeMinutes;
  if (typeof valeur !== "number" || !Number.isSafeInteger(valeur) || valeur < min || valeur > max) return undefined;
  // `min` et `max` sont des multiples de 5 (contrôle de la configuration) : l'arrondi ne sort jamais des bornes.
  return Math.round(valeur / 5) * 5;
}

/** Ligne « Vers {ville} » telle que la lisent le créneau, la durée connue et l'arrivée : forme de `TransferItem`. */
export type ChangementLu = Pick<TransferItem, "source" | "start" | "end" | "estimatedMinutes">;

/**
 * Durée **connue** du changement de ville, en minutes (M4-suite § 3.6 point 2) : `end − start` pour un départ saisi avec
 * heure de fin postérieure, `estimatedMinutes` pour un départ estimé ; `undefined` sinon (arrivée « à confirmer »). Les
 * 180 minutes de `creneauSansDureeMinutes` ne sont jamais une durée connue.
 */
export function dureeConnue(changement: ChangementLu): number | undefined {
  if (changement.source === "estimated") return changement.estimatedMinutes;
  if (changement.end === undefined) return undefined;
  const duree = versMinutes(changement.end) - versMinutes(changement.start);
  return duree > 0 ? duree : undefined;
}

/** Fin brute du créneau de planification, en minutes : départ + durée connue, sinon + `creneauSansDureeMinutes`. */
function finBruteDuCreneau(changement: ChangementLu, configuration: ConfigurationMoteur): number {
  return versMinutes(changement.start) + (dureeConnue(changement) ?? configuration.changementDeVille.creneauSansDureeMinutes);
}

/**
 * Créneau occupé par la ligne « Vers {ville} » pour la planification (0148 § 5.3 ; M4-suite § 3.2, M4S-PO-3), en minutes
 * depuis minuit, jamais affiché :
 * - billet ou vol avec heure de fin : de `start` à `end` ;
 * - billet ou vol **sans heure de fin** : de `start` à `start + creneauSansDureeMinutes` (180), non affiché : aucune
 *   arrivée n'est inventée, l'écran garde « arrivée à confirmer » ;
 * - départ estimé : de départ à départ + durée estimée, sinon + `creneauSansDureeMinutes` ;
 * borné à `fenetreJour.fin` dans tous les cas (0148 § 5.1 point 5 ; `creneauDepasseLeJour`).
 */
export function creneauOccupe(changement: ChangementLu, configuration: ConfigurationMoteur): { readonly debut: number; readonly fin: number } {
  const debut = versMinutes(changement.start);
  const finDuJour = Math.max(debut, versMinutes(configuration.fenetreJour.fin));
  return { debut, fin: Math.min(finBruteDuCreneau(changement, configuration), finDuJour) };
}

/**
 * Créneau de planification qui sort du jour (fin brute au-delà de `fenetreJour.fin`) : aucune étape après la ligne, qui finit
 * la journée avant le terminus `end` (0148 § 5.1 point 5 ; M4-suite § 3.8).
 */
export function creneauDepasseLeJour(changement: ChangementLu, configuration: ConfigurationMoteur): boolean {
  return finBruteDuCreneau(changement, configuration) > versMinutes(configuration.fenetreJour.fin);
}

/** Source des marges d'un changement de ville : nature du billet ou du vol saisi, sinon départ estimé (M4-suite § 2). */
export type SourceDesMarges = { readonly source: TransferItem["source"]; readonly nature?: "ticket" | "flight" };

/**
 * Marges avant le départ et après l'arrivée, en minutes (M4-suite § 3.3, M4S-PO-4) : `margesMinutes` de la section, par
 * source (« Billet » `ticket`, « Vol » `flight`, départ estimé `estimated`). Un départ saisi sans nature connue prend les
 * marges du billet. Elles ne servent qu'au rangement des créneaux **de l'IA** et au départ estimé : jamais affichées, jamais
 * appliquées à un engagement ni au chevauchement.
 */
export function margesDuChangement(changement: SourceDesMarges, configuration: ConfigurationMoteur): { readonly avant: number; readonly apres: number } {
  const { avantDepart, apresArrivee } = configuration.changementDeVille.margesMinutes;
  const cle = changement.source === "estimated" ? "estimated" : (changement.nature ?? "ticket");
  return { avant: lire(avantDepart, cle), apres: lire(apresArrivee, cle) };
}

/**
 * Activités au plus le jour d'un changement de ville (0148 § 5.4 ; M4-suite § 3.6 point 2) : `long.activitesMax` (1) quand
 * la durée connue atteint `long.seuilMinutes` (240), quel que soit le rythme ; sinon le maximum du rythme. Sans durée connue,
 * la journée n'est pas longue.
 */
export function activitesMaxDuChangement(parRythme: number, duree: number | undefined, configuration: ConfigurationMoteur): number {
  const { seuilMinutes, activitesMax } = configuration.changementDeVille.long;
  return duree !== undefined && duree >= seuilMinutes ? Math.min(parRythme, activitesMax) : parRythme;
}

/**
 * Arrivée **affichée** de la ligne « Vers {ville} », en minutes depuis minuit (M4-suite § 3.5 point 4) : `end` d'un départ
 * saisi, `start + estimatedMinutes` d'un départ estimé ; `undefined` quand l'arrivée est « à confirmer ». Peut dépasser
 * minuit (durée estimée longue) : la valeur n'est pas bornée.
 */
export function arriveeAffichee(changement: ChangementLu): number | undefined {
  const duree = dureeConnue(changement);
  return duree === undefined ? undefined : versMinutes(changement.start) + duree;
}

/** Engagement lu par le chevauchement : forme de `Stop` de `Day.events` (début, fin facultative). */
export type EvenementLu = { readonly start: string; readonly end?: string };

/**
 * **Chevauchement** d'engagements avec la ligne « Vers {ville} » (M4-suite § 3.5 point 4 et § 5 ; T-M4S-1) : fonction pure,
 * lue **à l'affichage** depuis la ligne du jour (`Day.items`) et les événements (`Day.events`) de l'instantané, sans
 * configuration, sans champ de contrat nouveau ni donnée stockée. Contrat de lecture, pour le bandeau de M4-suite-front :
 * - `undefined` : aucun `transfer` dans la ligne, arrivée « à confirmer » (billet ou vol sans heure de fin, départ estimé
 *   sans durée : aucun intervalle, les 180 minutes de planification ne sont pas un fait), ou aucun engagement qui chevauche ;
 * - sinon `{ vers, source, engagements }` : la ville d'arrivée (`transfer.to`, nom maison), la source (`estimated` : textes
 *   « d'après la durée estimée ») et les engagements qui chevauchent, dans l'ordre de `Day.events` (un : son heure et son
 *   libellé ; plusieurs : leur nombre).
 * Intervalles **semi-ouverts** : ligne `[start, arrivée)` ; engagement `[start, end)` s'il a une heure de fin postérieure, sinon
 * son seul `start`. Un engagement qui commence à l'arrivée exacte ne chevauche pas. Les **marges ne comptent pas**. Aucune
 * durée par défaut n'est supposée pour un engagement sans fin (cas limite du § 3.5 point 4).
 */
export function chevauchementDuChangement<E extends EvenementLu>(
  items: readonly DayLineItem[],
  events: readonly E[],
): { readonly vers: string; readonly source: TransferItem["source"]; readonly engagements: readonly E[] } | undefined {
  const ligne = items.find((item): item is TransferItem => item.type === "transfer");
  if (ligne === undefined) return undefined;
  const arrivee = arriveeAffichee(ligne);
  if (arrivee === undefined) return undefined;
  const depart = versMinutes(ligne.start);
  const engagements = events.filter((evenement) => {
    const debut = versMinutes(evenement.start);
    const fin = evenement.end === undefined ? undefined : versMinutes(evenement.end);
    if (fin === undefined || fin <= debut) return depart <= debut && debut < arrivee;
    return debut < arrivee && fin > depart;
  });
  return engagements.length === 0 ? undefined : { vers: ligne.to, source: ligne.source, engagements };
}

/** Thème de la journée (spécification M4 § 3.2 ; 0148 § 5.1 point 3 (b)) : écrit par le code, jamais par l'IA. */
export function themeDuChangement(changement: Pick<ChangementDeVille, "de" | "vers">): string {
  return `De ${changement.de} à ${changement.vers}`;
}

/**
 * Ville d'un engagement le jour d'un changement de ville (0148 § 9 point 5, confirmée par M4-suite § 3.5 point 1), déduite
 * par l'heure, sans champ saisi : `de` (ville quittée) si sa fin occupée (durée par défaut comprise) ne dépasse pas le départ,
 * `vers` sinon (un engagement à cheval sur le départ est rangé dans la ville d'arrivée et garde son heure ; s'il chevauche la
 * ligne affichée, `chevauchementDuChangement` le signale). Non affichée.
 */
export function villeDeLEngagement(engagement: EngagementLu, changement: Pick<ChangementDeVille, "depart">, configuration: ConfigurationMoteur): "de" | "vers" {
  return finOccupeeEngagement(engagement, configuration) <= versMinutes(changement.depart) ? "de" : "vers";
}

/**
 * Élément `transfer` de la ligne du jour (0148 § 1) : ville quittée et d'arrivée, source, départ ; pour un départ saisi,
 * l'arrivée saisie et le libellé ; pour un départ estimé, la durée estimée admise et le mode. Aucune donnée Google.
 */
export function elementDuChangement(
  changement: ChangementDeVille,
  libelle: string | undefined,
  dureeEstimeeMinutes: number | undefined,
): TransferItem {
  if (changement.source === "entered") {
    return {
      type: "transfer",
      from: changement.de,
      to: changement.vers,
      source: "entered",
      start: changement.depart,
      ...(changement.arrivee === undefined ? {} : { end: changement.arrivee }),
      label: libelle ?? `${changement.de} – ${changement.vers}`,
    };
  }
  return {
    type: "transfer",
    from: changement.de,
    to: changement.vers,
    source: "estimated",
    start: changement.depart,
    ...(dureeEstimeeMinutes === undefined ? {} : { estimatedMinutes: dureeEstimeeMinutes }),
    ...(changement.mode === undefined ? {} : { mode: changement.mode }),
  };
}

/** Villes du voyage depuis la première ville et les autres (nom, date d'arrivée), nuits comprises ; fin exclusive. */
export function villesDuVoyage(
  premiere: string,
  autres: readonly { readonly nom: string; readonly arrivee: string }[],
  sejour: { readonly start: string; readonly end: string },
): VilleDuVoyage[] {
  const arrivees = [{ nom: premiere, arrivee: sejour.start }, ...autres];
  return arrivees.map((ville, rang) => {
    const suivante = arrivees.at(rang + 1)?.arrivee ?? sejour.end;
    return { nom: ville.nom, arrivee: ville.arrivee, nuits: joursEntre(ville.arrivee, suivante) };
  });
}
