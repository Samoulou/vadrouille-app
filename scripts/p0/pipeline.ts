import { avecGardeDataCollection, type ClientModeles } from "@/ai/client";
import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { requeteNotation, requeteRaisons } from "@/ai/requetes";
import { lireNotes, lireRaisons } from "@/ai/sorties";
import { identifiantVoyage } from "@/domain/identifiant";
import { planifier } from "@/domain/planification";
import { squelette } from "@/domain/squelette";
import { ancrerCandidats, ancrerLogements, matriceTrajets } from "@/grounding/ancrage";
import type { ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import { estAncre, type Ancrage, type AncrageResolu, type Position } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat, CandidatNote } from "@/prototype/candidat";
import { CONFIG_SCHEMA, modelesDeLaVariante, RoutageSchema, type Variante } from "@/prototype/config";
import type { ProgrammeReduit } from "@/prototype/programme-reduit";
import { reduireProgramme } from "@/prototype/reduction";
import { chercherCandidats, type CompteursAgent } from "@/research/agent";
import { RAISONS_REFUS_PAGE, type LecteurPages } from "@/research/fetch-page";
import type { ClientRechercheWeb } from "@/ai/recherche-web";

import { assembler, type Raison } from "@/server/p0/assemblage";
import {
  bornesDepuisDemande,
  candidatPourModele,
  complementDepuisBrief,
  donneesProtegeesDepuisBrief,
  entreeModelesDepuisBrief,
  lieuRetenuDepuisCandidat,
} from "@/server/p0/vers-couche-ia";
import type { Configuration } from "./fichiers";
import { codeErreur, type Journal } from "./journal";
import {
  Compteurs,
  PlafondAtteint,
  plafonnerLecteur,
  plafonnerModeles,
  plafonnerPlaces,
  plafonnerRecherche,
  plafonnerRoutes,
} from "./plafonds";
import { lireSiPresent } from "@/domain/tables";
import { RapportSchema, type Rapport } from "./rapport";
import {
  briefDepuisBrief,
  candidatVersMoteur,
  demandesDuSejour,
  engagementsDepuisBrief,
  evenementVersMoteur,
  modeDeTrajet,
  nuitsDepuisBrief,
  relecturesDepuisAncrages,
  violationsP0,
  type ViolationsP0,
} from "@/server/p0/vers-moteur";

/**
 * Orchestrateur du prototype (spécification P0, « Déroulement » ; décision 0032, A3.1) : seul fichier qui compose
 * recherche, ancrage, moteur et modèles. Il reçoit tous ses clients **injectés** (dans P0a1 : des doubles sur
 * fixtures), pose les décorateurs de plafonds et la garde `data_collection`, et rend le programme réduit et le
 * rapport. Il n'écrit rien lui-même (l'écriture est faite par `main.ts`) et ne lit aucune variable d'environnement.
 */

export type Clients = {
  modeles: ClientModeles;
  recherche: ClientRechercheWeb;
  lecteur: LecteurPages;
  places: ClientPlaces;
  routes: ClientRoutes;
};

export type EntreePipeline = {
  nomBrief: string;
  brief: Brief;
  variante: Variante;
  configuration: Configuration;
  dateExecution: string;
  numero: number;
  clients: Clients;
  journal: Journal;
  horloge: () => number;
};

export type ResultatPipeline = { programme?: ProgrammeReduit; rapport: Rapport };

function enLots<T>(valeurs: readonly T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let index = 0; index < valeurs.length; index += taille) lots.push(valeurs.slice(index, index + taille));
  return lots;
}

export async function executer(entree: EntreePipeline): Promise<ResultatPipeline> {
  const { brief, configuration, journal, horloge } = entree;
  const compteurs = new Compteurs(configuration.plafonds, horloge);
  const debut = horloge();
  type EtapeChronometree = "recherche" | "ancrage" | "notation" | "planification" | "raisons" | "validation";
  const temps = new Map<EtapeChronometree, number>([
    ["recherche", 0],
    ["ancrage", 0],
    ["notation", 0],
    ["planification", 0],
    ["raisons", 0],
    ["validation", 0],
  ]);
  const chrono = async <T>(etape: EtapeChronometree, travail: () => Promise<T> | T): Promise<T> => {
    const depart = horloge();
    try {
      return await travail();
    } finally {
      temps.set(etape, (temps.get(etape) ?? 0) + Math.max(0, Math.round(horloge() - depart)));
    }
  };

  // Garde data_collection avant chaque requête, puis plafonds (vérifiés avant chaque appel).
  const modeles = plafonnerModeles(avecGardeDataCollection(entree.clients.modeles), compteurs);
  const recherche = plafonnerRecherche(entree.clients.recherche, compteurs);
  const lecteur = plafonnerLecteur(entree.clients.lecteur, compteurs);
  const places = plafonnerPlaces(entree.clients.places, compteurs);
  const routes = plafonnerRoutes(entree.clients.routes, compteurs);
  const choisis = modelesDeLaVariante(configuration.modeles, entree.variante);
  const routage = configuration.modeles.routage;
  const tripId = identifiantVoyage(brief.destination, entree.dateExecution, entree.numero);

  const sortiesRefusees = { plan: 0, recherche: 0, notation: 0, raisons: 0 };
  let agent: CompteursAgent | undefined;
  let candidats: Candidat[] = [];
  let ancres = 0;
  let nonRetenus = 0;
  let notes = new Map<string, CandidatNote["notes"]>();
  let retenus = 0;
  let propositions = 0;
  let jours = 0;
  let violations: ViolationsP0 = { R1: 0, R2: 0, R4: 0, R5: 0, R6: 0, R8: 0 };
  let programme: ProgrammeReduit | undefined;
  let statut: Rapport["statut"] = "complete";
  let raisonArret: Rapport["raisonArret"];
  let compteurAtteint: Rapport["compteurAtteint"];

  journal.ecrire("run_started");
  try {
    // Types de production de la couche IA (adaptateur `vers-couche-ia.ts`, décision 0077 § 1 point 5) : le récit et
    // les logements de P0 partent par `ComplementP0`, pour P0 seulement (B7-PO-1), prompts et octets inchangés.
    const entreeIa = entreeModelesDepuisBrief(brief);
    const complement = complementDepuisBrief(brief);
    // Squelette du séjour : il ne dépend que du brief (nombre de nuits), pas des lieux ancrés.
    const briefMoteur = briefDepuisBrief(brief);
    const joursSquelette = squelette({
      voyage: { start: brief.arrivee, end: brief.depart },
      pace: briefMoteur.pace,
      nombreDeNuits: nuitsDepuisBrief(brief, []).length,
      engagements: engagementsDepuisBrief(brief),
      configuration: configuration.moteur,
      budgetTrajetReduit: false,
    });
    // Mineur 3 de la revue de la PR #490 : mêmes cibles que `p0Run` (exécution comptée), par le même chemin
    // (`demandesDuSejour` puis `bornesDepuisDemande`). Une seule matrice ici : la demande n'est pas bornée par jour.
    // Plafond : Text Search moins une requête par logement (une par candidat à l'ancrage) ; plafond nul : arrêt avant
    // tout appel, comme un plafond atteint. `candidatsTrouves` n'y entre pas : ici il reste un fusible qui arrête
    // l'exécution (`cost_cap_reached`, tests/unit/p0/pipeline.test.ts), au lieu de devenir une cible.
    const bornes = bornesDepuisDemande(
      configuration.recherche,
      demandesDuSejour(joursSquelette, configuration.moteur).serie,
      configuration.plafonds.placesTextSearch - brief.logements.length,
    );
    if (bornes === null) throw new PlafondAtteint("placesTextSearch");
    // Étapes 2 et 3 : plan et recherche bornée. L'agent ne voit aucun résultat d'ancrage et ne sera pas relancé.
    const resultatAgent = await chrono("recherche", () =>
      chercherCandidats(entreeIa, {
        modeles,
        modele: choisis.recherche,
        routage,
        recherche,
        lecteur,
        bornes,
        complement,
        protegees: donneesProtegeesDepuisBrief(brief),
      }),
    );
    agent = resultatAgent.compteurs;
    candidats = resultatAgent.candidats;
    sortiesRefusees.plan += agent.sortiesRefusees.plan;
    sortiesRefusees.recherche += agent.sortiesRefusees.recherche;
    compteurs.consommer("candidatsTrouves", candidats.length);
    journal.ecrire("research_done", { candidats: candidats.length, recherches: agent.recherches, pagesLues: agent.pagesLues });

    // Étape 4 : ancrage, en mémoire. Un candidat non résolu ou fermé définitivement disparaît sans trace par lieu.
    const { logements, ancrages, fermes, positions } = await chrono("ancrage", async () => {
      const logements = await ancrerLogements(brief, places);
      const premier = logements[0] as AncrageResolu;
      const bruts: Map<string, Ancrage> = await ancrerCandidats(candidats, brief.destination, places, premier.position);
      const resolus = new Map<string, AncrageResolu>();
      const fermes = new Set<string>();
      for (const [id, ancrage] of bruts) {
        if (estAncre(ancrage)) resolus.set(id, ancrage);
        else if (ancrage.resolu) fermes.add(id);
      }
      const positions = new Map<string, Position>();
      for (const ancrage of [...logements, ...resolus.values()]) positions.set(ancrage.placeId, ancrage.position);
      return { logements, ancrages: resolus, fermes, positions };
    });
    const ancresLieux = candidats.filter((candidat) => candidat.typeEtape !== "event" && ancrages.has(candidat.id));
    // Événements : un lieu fermé définitivement les écarte ; un lieu non résolu les laisse sans placeId (R1).
    const evenements = candidats.filter((candidat) => candidat.typeEtape === "event" && !fermes.has(candidat.id));
    ancres = ancresLieux.length;
    nonRetenus = candidats.filter((candidat) => candidat.typeEtape !== "event").length - ancres;
    journal.ecrire("grounding_done", { ancres, nonRetenus });

    // Étape 6 : notation des seuls candidats ancrés, par lots, sur nos descriptions seulement.
    notes = await chrono("notation", async () => {
      const resultat = new Map<string, CandidatNote["notes"]>();
      for (const lot of enLots(ancresLieux, configuration.recherche.tailleLotNotation)) {
        const reponse = await modeles.envoyer(requeteNotation(entreeIa, lot.map(candidatPourModele), choisis.notation, routage, complement));
        const lecture = lireNotes(reponse.texte, new Set(lot.map((candidat) => candidat.id)));
        sortiesRefusees.notation += lecture.refuses;
        for (const [id, note] of lecture.valeur) resultat.set(id, note);
      }
      return resultat;
    });
    const notesCandidats: CandidatNote[] = ancresLieux.flatMap((candidat) => {
      const note = notes.get(candidat.id);
      return note === undefined ? [] : [{ ...candidat, notes: note }];
    });
    journal.ecrire("notation_done", { notes: notesCandidats.length });

    // Étapes 5, 7 et 8 : squelette, classement et planification, déterministes, par le moteur (`src/domain`),
    // sur ses propres entrées (adaptateur `vers-moteur.ts`, décision 0045 § 1.3).
    const placesLogements = logements.map((logement) => logement.placeId);
    const trajetsMemoire = await chrono("planification", () =>
      matriceTrajets(
        [...placesLogements, ...notesCandidats.flatMap((candidat) => ancrages.get(candidat.id)?.placeId ?? [])],
        modeDeTrajet(brief),
        routes,
      ),
    );
    const nuits = nuitsDepuisBrief(brief, placesLogements);
    const ancragesParPlace = new Map<string, AncrageResolu>();
    for (const ancrage of [...logements, ...ancrages.values()]) ancragesParPlace.set(ancrage.placeId, ancrage);
    const relectures = relecturesDepuisAncrages(ancragesParPlace, nuits, trajetsMemoire);
    const planifies = await chrono("planification", () =>
      planifier({
        jours: joursSquelette,
        candidats: notesCandidats.map((candidat) => candidatVersMoteur(candidat, ancrages.get(candidat.id))),
        evenements: evenements.flatMap((candidat) => evenementVersMoteur(candidat, ancrages.get(candidat.id)) ?? []),
        relectures,
        mode: modeDeTrajet(brief),
        parametres: {
          classement: configuration.classement,
          ageSourceMaxJours: configuration.recherche.ageSourceMaxJours,
          dateReference: entree.dateExecution,
        },
        configuration: configuration.moteur,
        voyage: { start: brief.arrivee, end: brief.depart },
      }),
    );
    journal.ecrire("planning_done", { jours: planifies.length });

    // Étape 9 : raisons des seuls lieux retenus.
    const idsRetenus = new Set<string>();
    for (const jour of planifies) {
      for (const etape of jour.etapes) idsRetenus.add(etape.candidatId);
      if (jour.idee) idsRetenus.add(jour.idee.candidatId);
      for (const evenement of jour.evenements) idsRetenus.add(evenement.candidatId);
    }
    const parId = new Map(candidats.map((candidat) => [candidat.id, candidat]));
    const lieuxRetenus = [...idsRetenus].flatMap((id) => parId.get(id) ?? []);
    retenus = lieuxRetenus.length;
    const raisons = await chrono("raisons", async () => {
      const resultat = new Map<string, Raison>();
      for (const lot of enLots(lieuxRetenus, configuration.recherche.tailleLotNotation)) {
        const reponse = await modeles.envoyer(requeteRaisons(entreeIa, lot.map(lieuRetenuDepuisCandidat), choisis.raisons, routage, complement));
        const lecture = lireRaisons(reponse.texte, new Set(lot.map((candidat) => candidat.id)));
        sortiesRefusees.raisons += lecture.refuses;
        for (const [id, valeur] of lecture.valeur) resultat.set(id, valeur);
      }
      return resultat;
    });
    journal.ecrire("reasons_done", { raisons: raisons.size });

    // Étapes 10 et 11 : assemblage et validation complète en mémoire, validateurs, réduction.
    programme = await chrono("validation", () => {
      const complet = assembler({
        tripId,
        brief,
        nuits,
        configuration: configuration.moteur,
        jours: planifies,
        candidats: parId,
        raisons,
        mode: modeDeTrajet(brief),
        positions,
      });
      // Validateurs du moteur (R1 à R10, rapport en mémoire), ramenés aux six compteurs du rapport de P0.
      violations = violationsP0(complet.trip.days, {
        brief,
        briefMoteur,
        nuits,
        relectures,
        configuration: configuration.moteur,
        planifies,
        candidats: parId,
      });
      propositions = complet.proposals.length;
      jours = complet.trip.days.length;
      return reduireProgramme(complet, {
        positions,
        terminus: complet.terminus,
        justifications: complet.justifications,
      });
    });
    journal.ecrire("validation_done", { ...violations });
  } catch (erreur) {
    programme = undefined;
    if (erreur instanceof PlafondAtteint) {
      statut = "stopped";
      raisonArret = erreur.code;
      compteurAtteint = erreur.compteur;
    } else {
      statut = "failed";
      raisonArret = codeErreur(erreur);
    }
    journal.ecrire(raisonArret);
  }

  const repartition = new Map(Array.from({ length: 10 }, (_, i) => [String(i + 1), 0]));
  let oui = 0;
  let incontournables = 0;
  for (const note of notes.values()) {
    const risque = String(note.notForMeRisk);
    repartition.set(risque, (repartition.get(risque) ?? 0) + 1);
    if (note.matchesWishes) oui += 1;
    if (note.mustSee) incontournables += 1;
  }
  const locales = candidats.filter((candidat) => candidat.source.classe !== "generique").length;
  const { registre } = compteurs;
  const rapport = RapportSchema.parse({
    schema: 1,
    variante: entree.variante,
    brief: entree.nomBrief,
    tripId,
    dateExecution: entree.dateExecution,
    mode: "simule",
    statut,
    ...(raisonArret === undefined ? {} : { raisonArret }),
    ...(compteurAtteint === undefined ? {} : { compteurAtteint }),
    prompts: {
      plan: PROMPT_PLAN.version,
      recherche: PROMPT_RECHERCHE.version,
      notation: PROMPT_NOTATION.version,
      raisons: PROMPT_RAISONS.version,
    },
    modeles: choisis,
    ...(RoutageSchema.safeParse(configuration.modeles.routage).success ? { routage: { ...configuration.modeles.routage } } : {}),
    fichiersConfig: { modeles: CONFIG_SCHEMA, recherche: CONFIG_SCHEMA, classement: CONFIG_SCHEMA, plafonds: CONFIG_SCHEMA },
    notes: {
      notForMeRisk: Object.fromEntries(repartition),
      matchesWishes: { oui, non: notes.size - oui },
      mustSee: { oui: incontournables, non: notes.size - incontournables },
    },
    sortiesRefusees,
    elapsedMs: { total: Math.max(0, Math.round(horloge() - debut)), ...Object.fromEntries(temps) },
    coutUsd: {
      modeles: registre.cout.modeles,
      rechercheWeb: registre.cout.rechercheWeb,
      total: registre.cout.modeles + registre.cout.rechercheWeb,
    },
    google: {
      placesTextSearchIdsOnly: registre.utilise.placesTextSearch,
      placesDetails: registre.utilise.placesDetails,
      routesRequetes: registre.utilise.routesRequetes,
      routesElements: registre.utilise.routesElements,
    },
    compteurs: {
      toursAgent: agent?.tours ?? 0,
      recherches: agent?.recherches ?? registre.utilise.recherchesWeb,
      pagesLues: agent?.pagesLues ?? 0,
      pagesRefusees: Object.fromEntries(RAISONS_REFUS_PAGE.map((raison) => [raison, (agent === undefined ? undefined : lireSiPresent(agent.pagesRefusees, raison)) ?? 0])),
      candidatsTrouves: candidats.length,
      candidatsRefuses: agent?.candidatsRefuses ?? { source_not_in_results: 0, duplicate: 0, over_total: 0, invalid: 0 },
      candidatsAncres: ancres,
      candidatsNonRetenusParAncrage: nonRetenus,
      candidatsNotes: notes.size,
      candidatsRetenus: retenus,
      propositions,
      jours,
    },
    partSourcesLocalesOuIndependantes: candidats.length === 0 ? 0 : locales / candidats.length,
    violations,
    reglesSansObjet: ["R3", "R7", "R10"],
  });
  return programme === undefined ? { rapport } : { programme, rapport };
}
