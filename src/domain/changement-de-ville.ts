import type { CommitmentKind, MobilityMode, Pace, TransferItem } from "@/contracts";

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
 * - le **créneau occupé** par la ligne « Vers {ville} » (`creneauOccupe`, 0148 § 5.3) ;
 * - le nombre maximal d'activités (0148 § 5.4) et le thème « De {ville} à {ville} » ;
 * - la ville d'un engagement de ce jour (`villeDeLEngagement`, 0148 § 9 point 5).
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
 * Départ estimé d'un changement de ville sans billet ni vol (0148 § 5.2, défaut technique ; valeurs de M4-suite § 2) : la plus
 * tardive des fins occupées des engagements de ce jour qui ne dépassent pas `limite`, sans descendre sous `heureParDefaut` ;
 * sans telle fin, `heureParDefaut`. En « HH:MM ».
 */
export function departEstime(engagements: readonly EngagementLu[], date: string, configuration: ConfigurationMoteur): string {
  const { heureParDefaut, limite } = configuration.changementDeVille.departEstime;
  const plancher = versMinutes(heureParDefaut);
  let depart = plancher;
  for (const engagement of engagements) {
    if (engagement.date !== date) continue;
    const fin = finOccupeeEngagement(engagement, configuration);
    if (fin <= versMinutes(limite) && fin > depart) depart = fin;
  }
  return versHeure(depart);
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
  const activitesMax = lire(configuration.changementDeVille.activitesParRythme, voyage.pace);
  const changements: ChangementDeVille[] = [];
  for (const [rang, ville] of villes.entries()) {
    const precedente = rang === 0 ? undefined : villes.at(rang - 1);
    if (precedente === undefined) continue;
    const date = ville.arrivee;
    const saisi = engagementDuChangement(engagements, date);
    const engagement = saisi === undefined ? undefined : engagements.at(saisi);
    if (saisi !== undefined && engagement !== undefined) {
      changements.push({
        date,
        de: precedente.nom,
        vers: ville.nom,
        source: "entered",
        depart: engagement.start,
        ...(engagement.end !== undefined && engagement.end > engagement.start ? { arrivee: engagement.end } : {}),
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
      activitesMax,
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

/**
 * Créneau occupé par la ligne « Vers {ville} » (0148 § 5.3), en minutes depuis minuit :
 * - billet ou vol avec heure de fin : de `start` à `end` ;
 * - billet ou vol sans heure de fin : aucun créneau fixé, réduit à l'heure de départ (l'intervalle revient à M4-suite) ;
 * - départ estimé : de départ à départ + durée estimée, sinon + `creneauSansDureeMinutes` ;
 * borné à `fenetreJour.fin` dans tous les cas (0148 § 5.1 point 5).
 */
export function creneauOccupe(
  changement: Pick<TransferItem, "source" | "start" | "end" | "estimatedMinutes">,
  configuration: ConfigurationMoteur,
): { readonly debut: number; readonly fin: number } {
  const debut = versMinutes(changement.start);
  const finDuJour = Math.max(debut, versMinutes(configuration.fenetreJour.fin));
  let fin: number;
  if (changement.source === "entered") fin = changement.end === undefined ? debut : Math.max(debut, versMinutes(changement.end));
  else fin = debut + (changement.estimatedMinutes ?? configuration.changementDeVille.creneauSansDureeMinutes);
  return { debut, fin: Math.min(fin, finDuJour) };
}

/** Thème de la journée (spécification M4 § 3.2 ; 0148 § 5.1 point 3 (b)) : écrit par le code, jamais par l'IA. */
export function themeDuChangement(changement: Pick<ChangementDeVille, "de" | "vers">): string {
  return `De ${changement.de} à ${changement.vers}`;
}

/**
 * Ville d'un engagement le jour d'un changement de ville (0148 § 9 point 5), déduite par l'heure, sans champ saisi : `de`
 * (ville quittée) si sa fin occupée ne dépasse pas le départ, `vers` sinon (un engagement à cheval sur le départ est rangé
 * dans la ville d'arrivée, toléré jusqu'à M4-suite). Non affichée : elle sert au départ estimé et aux règles de M4-suite.
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
