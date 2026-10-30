import type { ConfigurationMoteur } from "@/domain/configuration";
import { activitesMaxDuChangement, creneauDepasseLeJour, creneauOccupe, dureeConnue, dureeEstimeeAdmise, margesDuChangement } from "@/domain/changement-de-ville";
import { villesDeLaDate } from "@/domain/villes-du-voyage";
import { ajouterJours, versMinutes } from "@/domain/temps";
import type { ChangementDuBrief, VilleDuBrief } from "@/server/programme/forme";

/**
 * Cadrage de la sortie rédigée **avant** la vérification (décision 0148 § 5.1 point 3 (a), étape 2 bis de
 * `redigerEtVerifier` ; § 7.1 point 3), puis second contrôle de l'assemblage (§ 5.1 point 3 (b)). Fonction pure,
 * idempotente (un programme cadré ressort inchangé, aucun retrait). Elle **garantit** les règles du changement de ville
 * quelle que soit la sortie de l'IA :
 * - **ville de chaque créneau**, posée par le code (`villesDeLaDate` appliquée aux villes du brief) ; le champ `ville` de
 *   l'IA est toujours écrasé (bloquant 2 de 0148). Le jour d'un changement de ville : ville quittée pour un créneau rangé
 *   avant la ligne « Vers {ville} », ville d'arrivée pour un créneau rangé après ;
 * - le jour d'un changement de ville, **rangement** par la fin occupée (`finOccupeeDuCreneau`) et les **marges** de
 *   M4-suite § 3.3 (`margesDuChangement` : billet 45 et 30, vol 120 et 60, estimé 30 et 30) : fin occupée ≤ départ − marge
 *   avant (et `debut` dans le jour), avant ; `debut` ≥ fin du créneau occupé (`creneauOccupe`, 180 minutes pour une arrivée
 *   « à confirmer ») + marge après, après ; tout autre créneau (dans la fenêtre du changement de ville, à cheval sur ses
 *   bords, ou hors du jour) est **retiré**. Créneau occupé borné à la fin du jour, ou fenêtre qui finit après lui : aucun
 *   créneau n'est gardé après la ligne (0148 § 5.1 point 5 ; M4-suite § 3.8). `arrivee` et `depart` sont des terminus,
 *   jamais rangés ni retirés ;
 * - **plafond d'activités** de ce jour, dans l'ordre écrit : `activitesMax` du brief, ramené à `long.activitesMax` (1)
 *   pour un **long changement de ville** (durée connue ≥ `long.seuilMinutes`, M4-suite § 3.6 point 2) ; `visite`, `soiree`
 *   et `pause` avec lieu comptent ; les repas et les pauses sans lieu, non ; les suivantes sont retirées ;
 * - **repas** de ce jour (M4-suite § 3.6 point 3) : au plus un `repas_midi` et un `repas_soir` gardés (les suivants, dans
 *   l'ordre écrit, retirés) ; **aucun `apero`** (retiré) ; un repas dans la fenêtre du changement de ville est retiré par
 *   le rangement, sans texte de remplacement ;
 * - **`aReserver`** retiré de chaque créneau ce jour-là (spécification M4 § 3.2) ;
 * - **durée estimée** du jour (`dureeEstimeeMinutes`) rebornée (`dureeEstimeeAdmise` : entier, bornes de
 *   `changementDeVille.dureeEstimeeMinutes`, arrondi à 5) pour un départ estimé, retirée sinon ou hors bornes (0149 S-M4-2
 *   point 3 : une entrée qui ne serait pas passée par la lecture est rebornée ici) ; ignorée un jour ordinaire.
 * Les jours ordinaires ne changent que par la ville de leurs créneaux : ni marge, ni plafond, ni retrait de repas. Les
 * retraits sont comptés (`retires`, puis `compteurs.slotsRemoved`) ; un créneau retiré n'est jamais cherché (tout ce qui
 * suit lit le programme cadré). Ni déplacement ni priorité (M4-suite § 3.7).
 *
 * Module pur, chargé par `pnpm p0` (importé par `assemblage.ts` pour le second contrôle ; décision 0149 § 6) : n'importe que
 * `src/domain` et `forme.ts` (types), jamais `src/ai`, `src/grounding`, `src/research`, `src/prototype` ni `src/server/p0`.
 * Formes **structurelles** des créneaux (celles de `CreneauIa` de `src/ai/sorties.ts`, que ce module n'importe pas).
 */

/** Natures d'un créneau de la sortie (`NATURES_CRENEAU` de `src/ai/sorties.ts`). */
export type NatureCadrage = "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart";

/** Créneau tel que le cadrage le lit et le rend (ville posée par le code, `aReserver` retiré un jour de changement). */
export type CreneauCadrable = {
  readonly debut: string;
  readonly fin?: string;
  readonly nature: NatureCadrage;
  readonly lieu?: string;
  readonly aReserver?: boolean;
  readonly ville?: string;
};

export type JourCadrable<C extends CreneauCadrable = CreneauCadrable> = {
  readonly date: string;
  readonly titre?: string;
  readonly dureeEstimeeMinutes?: number;
  readonly creneaux: readonly C[];
};

/** Ce que le cadrage lit du brief : villes dans l'ordre et changements de ville du domaine (`BriefProgramme`). */
export type BriefCadrage = { readonly villes: readonly VilleDuBrief[]; readonly changements: readonly ChangementDuBrief[] };

/** Repas (déjeuner, dîner, apéro) : sorte `meal` de l'étape, jamais une activité du plafond (0148 § 5.1, mineur 3). */
export const NATURES_REPAS: ReadonlySet<string> = new Set(["repas_midi", "repas_soir", "apero"]);

/** Fin du jour : le contrat n'admet pas d'heure au-delà (0116 § 1.7). */
export const FIN_DU_JOUR = "23:59";

/**
 * Fin d'une étape (0116 § 1.7) : `fin` postérieure à `debut` gardée ; `fin` antérieure ou égale à `debut` lue comme
 * passant minuit, **bornée à 23:59** ; absente (ou `debut` déjà à 23:59), pas de fin. Écrite ici pour le cadrage et
 * réexportée par `assemblage.ts` (une seule définition, 0148 § 8 point 2).
 */
export function finDeLEtape(debut: string, fin: string | undefined): string | undefined {
  if (fin === undefined) return undefined;
  if (versMinutes(fin) > versMinutes(debut)) return fin;
  return versMinutes(debut) < versMinutes(FIN_DU_JOUR) ? FIN_DU_JOUR : undefined;
}

/**
 * Fin occupée d'un créneau, en minutes (0148 § 5.1 point 3 (a)) : avec `fin`, celle de `finDeLEtape` ; sans `fin`, `debut`
 * plus la durée par défaut de sa nature (`dureesParDefaut` : `visite`, `apero` et `pause` avec lieu → `activity` ;
 * `repas_midi` → `lunch` ; `repas_soir` → `dinner` ; `soiree` → `evening`) ; une pause sans lieu finit à son `debut`.
 */
export function finOccupeeDuCreneau(creneau: CreneauCadrable, configuration: Pick<ConfigurationMoteur, "dureesParDefaut">): number {
  const debut = versMinutes(creneau.debut);
  const fin = finDeLEtape(creneau.debut, creneau.fin);
  if (fin !== undefined) return versMinutes(fin);
  if (creneau.fin !== undefined) return debut;
  const durees = configuration.dureesParDefaut;
  switch (creneau.nature) {
    case "repas_midi":
      return debut + durees.lunch;
    case "repas_soir":
      return debut + durees.dinner;
    case "soiree":
      return debut + durees.evening;
    case "pause":
      return creneau.lieu === undefined ? debut : debut + durees.activity;
    case "visite":
    case "apero":
    case "arrivee":
    case "depart":
      return debut + durees.activity;
  }
}

/** Activité comptée par le plafond du jour d'un changement de ville : visite, soirée, pause avec lieu. */
function estActivite(creneau: CreneauCadrable): boolean {
  return creneau.nature === "visite" || creneau.nature === "soiree" || (creneau.nature === "pause" && creneau.lieu !== undefined);
}

/** Copie d'un objet sans une clé (champ retiré par le cadrage). */
function sansCle<T extends object, K extends keyof T>(objet: T, cle: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(objet).filter(([nom]) => nom !== cle)) as Omit<T, K>;
}

const estTerminus = (creneau: CreneauCadrable) => creneau.nature === "arrivee" || creneau.nature === "depart";

/** Villes du brief en plages (`start` inclus, `end` exclusif), la forme de `Trip.cities` que lit `villesDeLaDate`. */
export function plagesDesVilles(villes: readonly VilleDuBrief[]): { readonly name: string; readonly start: string; readonly end: string }[] {
  return villes.map((ville) => ({ name: ville.nom, start: ville.arrivee, end: ajouterJours(ville.arrivee, ville.nuits) }));
}

/**
 * Partage d'une journée de changement de ville (créneaux dans l'ordre écrit) : créneaux gardés avant la ligne, après la
 * ligne, et nombre de créneaux retirés (rangement, puis plafond d'activités), avec la durée estimée admise. Les terminus
 * (`arrivee`, `depart`) ne sont ni rangés ni retirés : ils restent dans `terminus`. Utilisé par `cadrerProgramme` et par
 * l'assemblage (place de la ligne « Vers {ville} »).
 */
export function partageDuJour<C extends CreneauCadrable>(
  jour: JourCadrable<C>,
  changement: ChangementDuBrief,
  configuration: ConfigurationMoteur,
): { readonly avant: C[]; readonly apres: C[]; readonly terminus: C[]; readonly retires: number; readonly dureeEstimeeMinutes?: number } {
  const duree = changement.source === "estimated" ? dureeEstimeeAdmise(jour.dureeEstimeeMinutes, configuration) : undefined;
  const transfert = {
    source: changement.source,
    start: changement.depart,
    ...(changement.arrivee === undefined ? {} : { end: changement.arrivee }),
    ...(duree === undefined ? {} : { estimatedMinutes: duree }),
  };
  const creneau = creneauOccupe(transfert, configuration);
  const marges = margesDuChangement(changement, configuration);
  const debutDuJour = versMinutes(configuration.fenetreJour.debut);
  const finDuJour = versMinutes(configuration.fenetreJour.fin);
  // Fenêtre du changement de ville (M4-suite § 3.3) : de départ − marge avant à fin du créneau + marge après. Créneau borné à
  // la fin du jour, ou fenêtre qui en sort : aucun créneau de l'IA n'est gardé après la ligne (0148 § 5.1 point 5).
  const finAvant = versMinutes(changement.depart) - marges.avant;
  const debutApres = creneauDepasseLeJour(transfert, configuration) || creneau.fin + marges.apres > finDuJour ? undefined : creneau.fin + marges.apres;
  const activitesMax = activitesMaxDuChangement(changement.activitesMax, dureeConnue(transfert), configuration);
  const avant: C[] = [];
  const apres: C[] = [];
  const terminus: C[] = [];
  let retires = 0;
  let activites = 0;
  const repas = new Set<string>();
  for (const lu of jour.creneaux) {
    if (estTerminus(lu)) {
      terminus.push(lu);
      continue;
    }
    const debut = versMinutes(lu.debut);
    const cote =
      finOccupeeDuCreneau(lu, configuration) <= finAvant && debut >= debutDuJour ? "avant" : debutApres !== undefined && debut >= debutApres ? "apres" : undefined;
    // Aucun apéro le jour d'un changement de ville ; au plus un déjeuner et un dîner (M4-suite § 3.6 point 3).
    const repasEnTrop = lu.nature === "apero" || ((lu.nature === "repas_midi" || lu.nature === "repas_soir") && repas.has(lu.nature));
    if (cote === undefined || repasEnTrop) {
      retires += 1;
      continue;
    }
    if (estActivite(lu)) {
      if (activites >= activitesMax) {
        retires += 1;
        continue;
      }
      activites += 1;
    }
    if (lu.nature === "repas_midi" || lu.nature === "repas_soir") repas.add(lu.nature);
    const cadre = { ...sansCle(lu, "aReserver"), ville: cote === "avant" ? changement.de : changement.vers } as C;
    if (cote === "avant") avant.push(cadre);
    else apres.push(cadre);
  }
  return { avant, apres, terminus, retires, ...(duree === undefined ? {} : { dureeEstimeeMinutes: duree }) };
}

/**
 * Cadrage du programme rédigé (voir l'en-tête) : rend le programme cadré (mêmes journées, dans le même ordre ; créneaux
 * gardés dans l'ordre écrit, ceux de la ville quittée puis ceux de la ville d'arrivée, terminus à leur place d'origine en
 * tête ou en queue) et le nombre de créneaux retirés. Un jour hors des villes du brief garde ses créneaux, sans ville.
 */
export function cadrerProgramme<C extends CreneauCadrable, J extends JourCadrable<C>, P extends { readonly jours: readonly J[] }>(
  programme: P,
  brief: BriefCadrage,
  configuration: ConfigurationMoteur,
): { readonly programme: P; readonly retires: number } {
  const plages = plagesDesVilles(brief.villes);
  let retires = 0;
  // Les deux `as unknown as J` restent (revue de la PR 932, mineur) : TypeScript ne prouve pas qu'un `J` générique privé de
  // `dureeEstimeeMinutes` puis complété redevient `J` ; seules `dureeEstimeeMinutes`, `creneaux` et `ville` changent.
  const jours = programme.jours.map((jour): J => {
    const sansDuree = sansCle(jour, "dureeEstimeeMinutes");
    const changement = brief.changements.find((c) => c.date === jour.date);
    if (changement === undefined) {
      const villes = villesDeLaDate(plages, jour.date);
      const ville = villes !== undefined && "ville" in villes ? villes.ville : undefined;
      const creneaux = jour.creneaux.map((creneau) => {
        const sansVille = sansCle(creneau, "ville");
        return (ville === undefined ? sansVille : { ...sansVille, ville }) as C;
      });
      // Durée estimée : ignorée un jour ordinaire (0149 S-M4-2 point 2).
      return { ...sansDuree, creneaux } as unknown as J;
    }
    const partage = partageDuJour(jour, changement, configuration);
    retires += partage.retires;
    const tete = partage.terminus.filter((creneau) => creneau.nature === "arrivee");
    const queue = partage.terminus.filter((creneau) => creneau.nature === "depart");
    return {
      ...sansDuree,
      ...(partage.dureeEstimeeMinutes === undefined ? {} : { dureeEstimeeMinutes: partage.dureeEstimeeMinutes }),
      creneaux: [...tete, ...partage.avant, ...partage.apres, ...queue],
    } as unknown as J;
  });
  return { programme: { ...programme, jours } as P, retires };
}
