import "server-only";

import { classer, type ParametresClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, TypeCreneau } from "@/domain/entrees";
import { demandeBornee, demandeDuJour, TYPES_SERIE } from "@/domain/demande-du-jour";
import { INCONNU, logementsDuJour, type Relectures } from "@/domain/relectures";
import type { JourSquelette } from "@/domain/squelette";
import { element, lire } from "@/domain/tables";
import { margeRemplacement } from "@/grounding/fiches-finales";
import { BLOC_MATRICE } from "@/grounding/ancrage";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { ficherSerie, positionsFraiches, type FicheChargee, type IssueFiche } from "@/grounding/fiches";
import { zoneEtDepart, type LogementAncre, type LogementAPositionner } from "@/grounding/ancrage-production";
import type { ClientPlacesMvp, ClientRoutes, ModeRoutes } from "@/grounding/interfaces";
import type { PositionGoogleFraiche } from "@/grounding/port-positions";
import { capturer, valeurOuEchec, type ResultatAncrage } from "@/grounding/resultat";
import { chargerTrajets, cleDuPoint, type DureeTrajet, type PointTrajet, type TableTrajets } from "@/grounding/trajets";
import { regrouperParJour } from "@/grounding/zone";
import { versRelectures } from "@/server/relecture/relectures";

/**
 * Relectures de la planification de l'aperçu (spécification B9, B9c ; décisions 0081 B9-TL-13, 0085, 0087 § 2.3, § 3 et
 * 0100 § 5.2) : **orchestration** des fonctions de `src/grounding` pour l'étape e, sur des clients injectés. Importable par
 * la seule composition de la génération (règle `ligne/relecture-imports`).
 *
 * Pour les jours à planifier **seulement** (moteur partiel, B9-TL-13) :
 * 1. zone et départ de chaque ville dont un jour est planifié (`zoneEtDepart` : au plus une fiche de position par ville).
 *    Une ville `area` ou `none` demande un Text Search de son nom (0087 § 2.3), couvert par la réserve de l'étape `e`
 *    (décision 0113 § 3 bis : une requête par ville `area` ou `none` positionnée). `budgets.textSearch` reste une **garde**
 *    (§ 3 bis point 4) : une ville qui n'aurait pas de requête, si la réserve était mal calculée, ne déclenche aucun appel ;
 * 2. demande de chaque jour par type de créneau (un lieu par créneau qui tient dans la fenêtre du jour), bornée par la
 *    capacité de la matrice Routes du jour (volume du forfait réparti sur les jours et les modes) ;
 * 3. fiches de la première série de chaque ville et de chaque type, dans l'ordre du classement (sans coût de trajet,
 *    aucune position n'étant connue avant la fiche), avec la marge de remplacement et sous le budget de fiches ;
 * 4. regroupement par jour à vol d'oiseau (jours de fermeture compris), puis **une matrice Routes par jour** sur les
 *    seuls points du jour (logements et lieux de son groupe) : aucun appel de fiche ni de trajet pour un lieu qui
 *    n'appartient qu'aux jours non planifiés ;
 * 5. tables `Relectures` du moteur (`versRelectures`, usage `planification`) : fiches des lieux retenus, durées de tous
 *    les jours (première durée définie), point de départ de chaque nuit.
 * Fiches, positions et durées sont des données Google : en mémoire de cette fonction et dans les tables rendues,
 * jamais journalisées ni mises dans un prompt. Les erreurs sont rendues en résultat fermé (`ResultatAncrage`).
 */

export type VilleAPlanifier = {
  readonly rang: number;
  readonly nom: string;
  readonly logement: LogementAPositionner;
};

/** Candidat noté et ancré, avec le rang de sa ville. */
export type CandidatAPlanifier = CandidatMoteur & { readonly ville: number };

export type BudgetsPlanification = {
  /**
   * Requêtes Text Search de la part de l'étape (sa réserve, décision 0113 § 3 bis), pour la zone des villes `area` et `none`
   * (une par ville). Garde : une ville qui n'en a plus n'est pas positionnée et ne déclenche aucun appel.
   */
  readonly textSearch: number;
  /** Fiches disponibles pour les séries (après les positions des villes). */
  readonly fiches: number;
  readonly routesRequetes: number;
  readonly routesElements: number;
  /** Règle de la marge de remplacement (Q389). */
  readonly marge: { readonly minimum: number; readonly part: number };
};

export type EntreePlanification = {
  /** Jours à planifier (squelette, 1 = J1). */
  readonly jours: readonly JourSquelette[];
  /** Rang de ville de chaque nuit, index 0 = première nuit. */
  readonly nuitsVille: readonly number[];
  readonly villes: readonly VilleAPlanifier[];
  readonly candidats: readonly CandidatAPlanifier[];
  readonly modes: readonly ModeRoutes[];
  readonly classement: ParametresClassement;
  readonly configuration: ConfigurationMoteur;
  readonly budgets: BudgetsPlanification;
};

export type ClientsPlanification = {
  readonly places: Pick<ClientPlacesMvp, "textSearch" | "details" | "position">;
  readonly routes: ClientRoutes;
};

export type SortiePlanification = {
  /** Candidats retenus (fiche lue, dans la zone, regroupés dans un jour), sans le rang de ville. */
  readonly candidats: readonly CandidatMoteur[];
  readonly relectures: Relectures;
  /**
   * Positions des fiches lues par cette planification (donnée Google, en mémoire), marquées pour l'écriture au cache : celle
   * de l'étape `e` n'en écrit que les `placeId` de la version publiée (0081 B9-TL-9).
   */
  readonly positions: ReadonlyMap<string, PositionGoogleFraiche>;
};

const TYPES = TYPES_SERIE;

/**
 * Nombre de points (logements et lieux) que la matrice d'un jour admet : `jours × modes` matrices de `n × n` éléments,
 * découpées en blocs de 10 × 10 (une requête par bloc), sous les plafonds d'éléments et de requêtes du forfait.
 */
export function capaciteMatrice(jours: number, modes: number, budget: { readonly routesElements: number; readonly routesRequetes: number }): number {
  if (jours <= 0 || modes <= 0) return 0;
  let n = 0;
  for (let candidat = 1; candidat <= 60; candidat += 1) {
    const blocs = Math.ceil(candidat / BLOC_MATRICE) ** 2;
    if (jours * modes * candidat * candidat > budget.routesElements || jours * modes * blocs > budget.routesRequetes) break;
    n = candidat;
  }
  return n;
}

/** Candidat admis pour un type de créneau (mêmes règles que le planificateur). */
function admis(candidat: CandidatMoteur, type: TypeCreneau): boolean {
  if (!candidat.notes.slotFit.includes(type)) return false;
  return type === "meal" ? candidat.typeEtape === "meal" : candidat.typeEtape === "activity";
}

/** Rangs (dans `jours`) des jours dont aucune plage d'ouverture ne recouvre la fenêtre ; horaires inconnus : aucun. */
function joursDeFermeture(relectures: Pick<Relectures, "plages">, placeId: string, jours: readonly JourSquelette[]): number[] {
  return jours.flatMap((jour, rang) => {
    const plages = relectures.plages(placeId, jour.date);
    if (plages === INCONNU) return [];
    return plages.some((plage) => plage.debut < jour.fin && jour.debut < plage.fin) ? [] : [rang];
  });
}

const tableVide: TableTrajets = { duree: () => undefined };

/** Table qui rend la première durée définie parmi les tables des jours (chaque paire n'appartient qu'à une ville). */
function unir(tables: readonly TableTrajets[]): TableTrajets {
  return {
    duree(depuis, vers, mode): DureeTrajet | undefined {
      for (const table of tables) {
        const duree = table.duree(depuis, vers, mode);
        if (duree !== undefined) return duree;
      }
      return undefined;
    },
  };
}

export async function preparerPlanification(entree: EntreePlanification, clients: ClientsPlanification): Promise<ResultatAncrage<SortiePlanification>> {
  return capturer(async () => {
    const { jours, villes, budgets } = entree;
    const nombreDeNuits = entree.nuitsVille.length;
    const villeDuJour = (jour: JourSquelette): number => entree.nuitsVille.at(jour.logementArrivee) ?? entree.nuitsVille.at(0) ?? 0;

    // 1. Zone et départ des villes dont un jour est planifié.
    const ancres = new Map<number, LogementAncre>();
    let textSearchRestants = Math.max(0, budgets.textSearch);
    for (const ville of villes) {
      if (!jours.some((jour) => villeDuJour(jour) === ville.rang)) continue;
      if (ville.logement.kind === "area" || ville.logement.kind === "none") {
        // Garde (0113 § 3 bis point 4) : aucun Text Search sans requête dans la part, jamais un centre inventé.
        if (textSearchRestants < 1) continue;
        textSearchRestants -= 1;
      }
      ancres.set(ville.rang, valeurOuEchec(await zoneEtDepart(ville.logement, ville.nom, clients.places)));
    }

    // 2. Demandes et capacités : une matrice par jour qui attend au moins un lieu.
    const demandesBrutes = jours.map((jour) => demandeDuJour(jour, entree.configuration));
    const capaciteTotale = capaciteMatrice(jours.length, entree.modes.length, budgets);
    const pointsLogement = (jour: JourSquelette): PointTrajet[] => {
      const { depart, arrivee } = logementsDuJour(jour.index - 1, nombreDeNuits);
      const points = new Map<string, PointTrajet>();
      for (const nuit of [depart, arrivee]) {
        const ancre = ancres.get(entree.nuitsVille.at(nuit) ?? -1);
        if (ancre !== undefined) points.set(cleDuPoint(ancre.depart), ancre.depart);
      }
      return [...points.values()];
    };
    const capacites = jours.map((jour) => Math.max(0, capaciteTotale - pointsLogement(jour).length));
    const demandes = demandesBrutes.map((demande, rang) => demandeBornee(demande, element(capacites, rang) ?? 0));

    // 3. Fiches : par ville et par type, dans l'ordre du classement.
    const series: { ville: number; type: TypeCreneau; n: number }[] = [];
    for (const ville of ancres.keys()) {
      for (const type of TYPES) {
        const n = jours.reduce((somme, jour, rang) => (villeDuJour(jour) === ville ? somme + lire(element(demandes, rang) ?? { activity: 0, meal: 0, evening: 0 }, type) : somme), 0);
        if (n > 0) series.push({ ville, type, n });
      }
    }
    const premiereSerie = series.reduce((somme, serie) => somme + serie.n, 0);
    // Comme P0 (`premiereSerie > budgetFiches` : refus sans programme) : une première série qui ne tient pas dans le budget de
    // fiches n'est pas lue en partie, elle est refusée avant toute fiche (`cap_reached`, jamais un lieu inventé).
    if (premiereSerie > Math.max(0, budgets.fiches)) throw new ErreurClientGoogle("cap_reached");
    const marge = margeRemplacement(premiereSerie, budgets.marge);
    let restant = Math.min(Math.max(0, budgets.fiches), premiereSerie + marge);
    let aVenir = premiereSerie;
    const lus = new Set<string>();
    const retenus: { readonly id: string; readonly ville: number; readonly type: TypeCreneau; readonly fiche: FicheChargee }[] = [];
    for (const serie of series) {
      aVenir -= serie.n;
      const ancre = ancres.get(serie.ville);
      if (ancre === undefined) continue;
      const classes = classer(
        entree.candidats.filter((candidat) => candidat.ville === serie.ville && admis(candidat, serie.type)),
        serie.type,
        () => 0,
        entree.classement,
      );
      const ordre: { id: string; placeId: string }[] = [];
      const dansOrdre = new Set<string>();
      for (const candidat of classes) {
        if (candidat.placeId === undefined || lus.has(candidat.placeId) || dansOrdre.has(candidat.placeId)) continue;
        dansOrdre.add(candidat.placeId);
        ordre.push({ id: candidat.id, placeId: candidat.placeId });
      }
      const borne = Math.max(0, restant - serie.n - aVenir);
      const issue = valeurOuEchec(await ficherSerie(ordre, { premiereSerie: serie.n, marge: borne }, ancre.zone, clients.places));
      // Un `placeId` distinct par fiche, lus dans l'ordre : les premiers `retenus + ecartes` de la liste.
      const consommees = issue.retenus.length + issue.ecartes;
      for (const lieu of ordre.slice(0, consommees)) lus.add(lieu.placeId);
      restant -= consommees;
      for (const lieu of issue.retenus) retenus.push({ id: lieu.id, ville: serie.ville, type: serie.type, fiche: lieu.fiche });
    }

    // 4. Regroupement par jour (par ville), puis une matrice par jour.
    const fichesLues: IssueFiche[] = retenus.map((lieu) => lieu.fiche);
    const horaires = versRelectures({ usage: "planification", fiches: fichesLues, trajets: tableVide, logementsParNuit: [] });
    const ficheDe = new Map(retenus.map((lieu) => [lieu.id, lieu.fiche]));
    const groupesDesJours: string[][] = jours.map(() => []);
    for (const ville of ancres.keys()) {
      const rangs = jours.flatMap((jour, rang) => (villeDuJour(jour) === ville ? [rang] : []));
      const joursDeLaVille = rangs.map((rang) => jours[rang] as JourSquelette);
      const groupes = regrouperParJour(
        retenus
          .filter((lieu) => lieu.ville === ville)
          .map((lieu) => ({ id: lieu.id, type: lieu.type, position: lieu.fiche.position, fermeLes: joursDeFermeture(horaires, lieu.fiche.placeId, joursDeLaVille) })),
        rangs.map((rang) => ({ demande: element(demandes, rang) ?? { activity: 0, meal: 0, evening: 0 }, capacite: element(capacites, rang) ?? 0 })),
      );
      groupes.forEach((groupe, position) => {
        const rang = rangs.at(position);
        if (rang !== undefined) groupesDesJours[rang] = groupe;
      });
    }
    const tables: TableTrajets[] = [];
    for (const [rang, jour] of jours.entries()) {
      const groupe = groupesDesJours.at(rang) ?? [];
      if (groupe.length === 0) continue;
      const lieux: PointTrajet[] = groupe.flatMap((id) => {
        const fiche = ficheDe.get(id);
        return fiche === undefined ? [] : [{ placeId: fiche.placeId, position: fiche.position }];
      });
      tables.push(valeurOuEchec(await chargerTrajets([...pointsLogement(jour), ...lieux], entree.modes, clients.routes)));
    }

    // 5. Tables du moteur : clé de départ de chaque nuit (placeId ou clé maison de sa ville).
    const logementsParNuit = entree.nuitsVille.map((ville) => {
      const ancre = ancres.get(ville);
      return ancre === undefined ? null : cleDuPoint(ancre.depart);
    });
    const relectures = versRelectures({ usage: "planification", fiches: fichesLues, trajets: unir(tables), logementsParNuit });
    const groupes = new Set(groupesDesJours.flat());
    const gardes = entree.candidats.filter((candidat) => groupes.has(candidat.id)).map((retenu): CandidatMoteur => {
      const { ville, ...candidat } = retenu;
      void ville;
      return candidat;
    });
    return { candidats: gardes, relectures, positions: positionsFraiches(fichesLues) };
  });
}
