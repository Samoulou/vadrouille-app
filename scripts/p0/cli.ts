import { parseArgs } from "node:util";

import { creerModelesSimules } from "@/ai/modeles.simule";
import { slugDestination } from "@/domain/identifiant";
import { creerPlacesSimule } from "@/grounding/places.simule";
import { creerRoutesSimule } from "@/grounding/routes.simule";
import { VARIANTES, type Variante } from "@/prototype/config";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule } from "@/research/pages.simule";
import { creerRechercheSimulee } from "@/research/recherche-web.simule";

import { DOSSIERS_PAR_DEFAUT, ecrireSortie, lireBrief, lireConfiguration, lireFixtures, prochainNumero, type Dossiers } from "./fichiers";
import { codeErreur, creerJournal, creerRedacteur } from "./journal";
import { executerProgramme } from "./pipeline";

/**
 * Commande `pnpm p0` (spécification P0, « Deux modes » ; décision 0032, A3.4).
 *
 * - **Mode simulé** (seul mode livré) : aucune variable d'environnement lue, aucune connexion ; tous les clients
 *   sont des doubles sur fixtures.
 * - `--reel` : **erreur fermée constante** `real_mode_unavailable`, avant toute autre lecture (ni argument, ni
 *   configuration, ni clé, ni environnement, ni fichier). Aucun champ de configuration ne peut l'ouvrir.
 */

/** Erreur constante du mode réel, définie dans le code (jamais dans une configuration). */
export const ERREUR_MODE_REEL = "real_mode_unavailable";

export const CODES_SORTIE = { complete: 0, failed: 1, realUnavailable: 2, stopped: 3, usage: 64 } as const;

export type Sorties = { stdout: (ligne: string) => void; stderr: (ligne: string) => void };

export type OptionsPrincipal = {
  dossiers?: Dossiers;
  horloge?: () => number;
  aujourdHui?: () => string;
};

export async function principal(argv: readonly string[], sorties: Sorties, options: OptionsPrincipal = {}): Promise<number> {
  if (argv.some((argument) => argument === "--reel" || argument.startsWith("--reel="))) {
    sorties.stderr(JSON.stringify({ code: ERREUR_MODE_REEL }));
    return CODES_SORTIE.realUnavailable;
  }

  // Aucune clé n'est lue dans P0a1 : rien à masquer hors des tests (le filtre reste posé avant toute écriture).
  const redacteur = creerRedacteur([]);
  const journal = creerJournal(sorties.stdout, redacteur);

  let valeurs: { brief?: string; variante?: string };
  try {
    valeurs = parseArgs({
      args: [...argv],
      options: { brief: { type: "string" }, variante: { type: "string", default: "b" } },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch {
    journal.ecrire("usage");
    return CODES_SORTIE.usage;
  }
  const variante = valeurs.variante as Variante;
  if (valeurs.brief === undefined || !(VARIANTES as readonly string[]).includes(variante)) {
    journal.ecrire("usage");
    return CODES_SORTIE.usage;
  }

  const dossiers = options.dossiers ?? DOSSIERS_PAR_DEFAUT;
  const horloge = options.horloge ?? (() => performance.now());
  const dateExecution = (options.aujourdHui ?? (() => new Date().toISOString().slice(0, 10)))();
  try {
    const brief = lireBrief(valeurs.brief, dossiers);
    journal.ecrire("brief_loaded");
    const configuration = lireConfiguration(dossiers);
    const slug = slugDestination(brief.destination);
    const fixtures = lireFixtures(slug, dossiers);
    const numero = prochainNumero(`proto_${slug}_${dateExecution.replaceAll("-", "")}`, dossiers);

    // Décision 0116 § 7.2 : le mode simulé passe par la nouvelle chaîne (une sortie simulée du prompt `programme`).
    const { programme, rapport } = await executerProgramme({
      nomBrief: valeurs.brief,
      brief,
      variante,
      configuration,
      dateExecution,
      numero,
      journal,
      horloge,
      clients: {
        modeles: creerModelesSimules(fixtures.modeles),
        recherche: creerRechercheSimulee(fixtures.recherche),
        lecteur: creerLecteurPages({
          resoudre: creerResolveurSimule(fixtures.pages.dns),
          http: creerHttpSimule(fixtures.pages.pages),
        }),
        places: creerPlacesSimule(fixtures.places),
        routes: creerRoutesSimule(fixtures.routes),
      },
    });

    // Une exécution arrêtée n'écrit aucun programme partiel : seulement le rapport.
    if (programme !== undefined) {
      ecrireSortie(`${programme.trip.id}.json`, redacteur(`${JSON.stringify(programme, null, 2)}\n`), dossiers);
      journal.ecrire("programme_written");
    }
    ecrireSortie(`${rapport.tripId}.rapport.json`, redacteur(`${JSON.stringify(rapport, null, 2)}\n`), dossiers);
    journal.ecrire("report_written");
    if (rapport.statut === "complete") return CODES_SORTIE.complete;
    return rapport.statut === "stopped" ? CODES_SORTIE.stopped : CODES_SORTIE.failed;
  } catch (erreur) {
    journal.ecrire(codeErreur(erreur));
    return CODES_SORTIE.failed;
  }
}
