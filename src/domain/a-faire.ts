import { ChecklistItemSchema, type Change, type ChecklistKind, type StopSnapshot, type TripSnapshot } from "@/contracts";

import { identite } from "@/domain/patch";
import { versMinutes } from "@/domain/temps";

/**
 * Liste « À faire avant de partir » de la chaîne inversée (spécification M5, § 7 ; décision 0147 § 7, T7 et T9). Fonctions
 * pures, sans base ni réseau :
 *
 * - `lignesDuProgramme` : lignes écrites **à la génération de la version 1 seulement** (§ 7.1) : une ligne `reservation` par
 *   étape `toReserve` (libellé stocké = le seul nom de l'étape, le préfixe « Réserver : » est composé à l'écran) et une ligne
 *   `ticket` **faite** par engagement (`Day.events` avec `commitment`), dans l'ordre du programme ; les bons plans suivent
 *   (`other`, écrits par l'étape « programme ») ;
 * - `lignesApresVersion` : suite de la liste après **toute** version suivante (§ 7.2), appelée par l'unique écrivain des
 *   versions (`ecrireVersion`, champ obligatoire `instantanePrecedent`) et, à blanc, par l'aperçu de chaque écrivain ;
 * - `ordreDeLecture` : ordre des lignes à l'écran (§ 7.1 point 3).
 *
 * Aucune donnée Google : seuls des noms maison (`Stop.name`, nom de l'IA ou saisi par la personne) et des identifiants maison.
 */

/** Ligne du voyage telle que la fonction de suite la lit (`checklist_items`). `stopId` nul : ligne sans étape. */
export type LigneAFaire = {
  readonly id: string;
  readonly stopId: string | null;
  readonly kind: ChecklistKind;
  readonly done: boolean;
  readonly label: string;
};

/** Ligne à écrire (sans identifiant : l'écrivain le dérive de sa demande, `identifiantLigneAFaire`). */
export type LigneNouvelle = {
  readonly stopId: string;
  readonly kind: "reservation" | "ticket";
  readonly label: string;
  readonly done: boolean;
};

/** Effet d'une version sur la liste (0147 § 7.2 point 1). */
export type SuiteDeLaListe = {
  /** Lignes **non faites** d'une étape absente de la version d'arrivée : retirées. */
  readonly retirer: readonly string[];
  /** Lignes **faites** d'une étape absente de la version d'arrivée : gardées, sans lien (`stop_id` nul). */
  readonly delier: readonly string[];
  /** Une ligne `reservation` non faite par étape `toReserve` nouvelle, dans l'ordre du programme. */
  readonly ajouter: readonly LigneNouvelle[];
  /** Variante `checklist` de « Ce qui change » (0147 § 5.1) : retraits, puis ajouts. */
  readonly changements: readonly Change[];
};

/**
 * Identifiant déterministe de la ligne de rang `rang` (0147 § 7.1 point 2, forme de `identifiantBonPlan` de 0136 § 3.3) : les
 * 8 premiers chiffres hexadécimaux portent le rang, le reste vient de `base` (identifiant de l'exécution pour la version 1,
 * `request_id` de la version pour une retouche). Jamais tiré d'un texte ; rejouer donne les mêmes identifiants.
 */
export function identifiantLigneAFaire(base: string, rang: number): string {
  if (!Number.isInteger(rang) || rang < 0 || rang > 0xffffffff) throw new RangeError("à faire : rang hors bornes");
  return `${rang.toString(16).padStart(8, "0")}${base.slice(8)}`;
}

/** Étape qui demande une réservation : exception `toReserve`, jamais un engagement (déjà réservé). */
export function aReserver(stop: StopSnapshot): boolean {
  return stop.commitment === undefined && stop.exceptions.includes("toReserve");
}

type Situee = { readonly stop: StopSnapshot; readonly evenement: boolean };

/**
 * Étapes et événements d'un instantané **dans l'ordre du programme** : jour par jour, puis par heure de début dans la journée
 * (à égalité, les étapes de la ligne avant les événements, chacun dans son ordre stocké).
 */
export function etapesDansLOrdre(instantane: TripSnapshot): Situee[] {
  return [...instantane.days]
    .sort((a, b) => a.index - b.index)
    .flatMap((jour) => {
      const situees = [
        ...jour.items.flatMap((item) => (item.type === "stop" ? [{ stop: item.stop, evenement: false }] : [])),
        ...jour.events.map((stop) => ({ stop, evenement: true })),
      ];
      return situees
        .map((situee, rang) => ({ situee, rang, debut: versMinutes(situee.stop.start) }))
        .sort((a, b) => a.debut - b.debut || a.rang - b.rang)
        .map(({ situee }) => situee);
    });
}

/**
 * Lignes de la version 1 tirées du programme (0147 § 7.1 point 1) : `reservation` non faite par étape `toReserve`, `ticket`
 * **faite** par engagement, dans l'ordre du programme. Chaque ligne est validée par `ChecklistItemSchema` (un nom trop long ou
 * vide lève : erreur de programmation, l'instantané étant déjà validé).
 */
export function lignesDuProgramme(instantane: TripSnapshot): LigneNouvelle[] {
  return etapesDansLOrdre(instantane).flatMap(({ stop, evenement }): LigneNouvelle[] => {
    if (evenement && stop.commitment !== undefined) return [valider({ stopId: stop.id, kind: "ticket", label: stop.name, done: true })];
    if (!evenement && aReserver(stop)) return [valider({ stopId: stop.id, kind: "reservation", label: stop.name, done: false })];
    return [];
  });
}

function valider(ligne: LigneNouvelle): LigneNouvelle {
  ChecklistItemSchema.parse({ id: "ligne", kind: ligne.kind, label: ligne.label, when: { type: "beforeDeparture" }, done: ligne.done, sponsored: false, stopId: ligne.stopId });
  return ligne;
}

/**
 * Suite de la liste après une version (0147 § 7.2 point 1 ; spécification § 7.4 ; M5-PO-15) :
 *
 * - une ligne dont l'étape (identité de `changements()`, 0147 § 5.2 point 1 : `id`, `placeId`, nom) est absente de `apres` :
 *   retirée si elle n'est pas faite, déliée si elle l'est ; l'ancienne étape d'un remplacement **est** absente (voulu) ;
 * - une étape `toReserve` de `apres` dont l'identité est absente de `avant` : une ligne `reservation` non faite, sauf si une
 *   ligne gardée la désigne déjà ;
 * - une étape déplacée (même identité, autre jour ou autre heure) : rien.
 *
 * Aucune ligne faite n'est retirée ni décochée. Après application, aucune ligne ne désigne une étape absente de `apres` :
 * le contrôle `checklist_orphan` de la lecture reste vrai.
 */
export function lignesApresVersion(lignes: readonly LigneAFaire[], avant: TripSnapshot, apres: TripSnapshot): SuiteDeLaListe {
  const situeesAvant = etapesDansLOrdre(avant);
  const situeesApres = etapesDansLOrdre(apres);
  const parIdAvant = new Map(situeesAvant.map(({ stop }) => [stop.id, stop] as const));
  const idsApres = new Set(situeesApres.map(({ stop }) => stop.id));
  const identitesAvant = new Set(situeesAvant.map(({ stop }) => identite(stop)));
  const identitesApres = new Set(situeesApres.map(({ stop }) => identite(stop)));

  // Étape d'une ligne absente de `apres` : par son identité dans `avant` ; une ligne dont l'étape n'est pas dans `avant`
  // (donnée déjà incohérente) reste tant que son identifiant existe dans `apres`.
  const absente = (stopId: string): boolean => {
    const ancienne = parIdAvant.get(stopId);
    return ancienne === undefined ? !idsApres.has(stopId) : !identitesApres.has(identite(ancienne));
  };

  const retirer: string[] = [];
  const delier: string[] = [];
  const changements: Change[] = [];
  const gardees = new Set<string>();
  for (const ligne of lignes) {
    if (ligne.stopId === null) continue;
    if (!absente(ligne.stopId)) {
      if (ligne.kind === "reservation") gardees.add(ligne.stopId);
      continue;
    }
    if (ligne.done) {
      delier.push(ligne.id);
    } else {
      retirer.push(ligne.id);
      changements.push({ type: "checklist", action: "removed", label: ligne.label });
    }
  }

  const ajouter = situeesApres.flatMap(({ stop, evenement }): LigneNouvelle[] =>
    !evenement && aReserver(stop) && !identitesAvant.has(identite(stop)) && !gardees.has(stop.id)
      ? [valider({ stopId: stop.id, kind: "reservation", label: stop.name, done: false })]
      : [],
  );
  for (const ligne of ajouter) changements.push({ type: "checklist", action: "added", label: ligne.label });
  return { retirer, delier, ajouter, changements };
}

/**
 * Ordre des lignes à l'écran (0147 § 7.1 point 3) : d'abord les lignes liées à une étape de `instantane`, par la position de
 * l'étape dans le programme (jour, puis heure), puis les lignes sans étape (bons plans, lignes faites déliées) ; à égalité, par
 * identifiant. Une ligne liée à une étape absente garde sa place parmi les lignes sans étape (la lecture la refuse avant).
 */
export function ordreDeLecture<T extends { readonly id: string; readonly stopId?: string | null | undefined }>(lignes: readonly T[], instantane: TripSnapshot): T[] {
  const position = new Map(etapesDansLOrdre(instantane).map(({ stop }, rang) => [stop.id, rang] as const));
  const rangDe = (ligne: T) => (ligne.stopId === null || ligne.stopId === undefined ? undefined : position.get(ligne.stopId)) ?? Number.MAX_SAFE_INTEGER;
  return [...lignes].sort((a, b) => rangDe(a) - rangDe(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
