import "server-only";

import { cookies } from "next/headers";

import { lireContenuProgramme, lireSuivi } from "@/adapters/prototype-suivi";
import type { ExecutionSuivie, LigneDecompte, ModeleLancementP0, RapportPage, SuiviPrototype } from "@/contracts/prototype-suivi";
import { etatPageAcces, NOM_COOKIE_ACCES, type EtatPageAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { COMPTEES_MAX, decompte, RELANCES_MAX } from "@/server/p0/decompte";
import { criteresDuRapport, etapesAvecSiteDuRapport, etapesDuRapport, liensSitesDuRapport, texteDuRapport } from "@/server/p0/rapport";
import { NOMS_BRIEFS } from "@/workflows";

/**
 * État de la page des exécutions du mode réel (`/prototype/executions` ; décision 0055, sections 2 et 8), lu par le
 * composant serveur de la page seulement. Module ordinaire, **pas** une action serveur : un export d'un fichier
 * `"use server"` serait appelable par n'importe quel client et rendrait l'état de la garde (revue du head 6be9299,
 * mineur 7). Les actions restent la saisie (`src/server/actions/p0-acces.ts`) et le lancement
 * (`src/server/actions/p0-lancement.ts`).
 *
 * Page ouverte seulement (garde ouverte et cookie d'accès valide), le modèle du lancement (P0r3d) est lu : briefs
 * admis, suivi des exécutions, décompte par brief et variante, rapport de la dernière exécution finie (la plus
 * récente qui n'est pas en cours : une exécution lancée n'efface pas le rapport de la précédente). Garde fermée ou
 * accès à saisir : aucune connexion à la base au-delà de celle de la saisie.
 */
export async function etatPageExecutionsP0(): Promise<EtatPageAcces> {
  const cookie = (await cookies()).get(NOM_COOKIE_ACCES)?.value;
  return etatPageAcces(cookie);
}

export type PageExecutionsP0 = { readonly etat: "fermee" | "saisie" } | { readonly etat: "ouverte"; readonly modele: ModeleLancementP0 };

const VARIANTES = ["B", "A"] as const;

async function suiviOuNul(): Promise<SuiviPrototype | null> {
  try {
    return await lireSuivi(poolPrototype());
  } catch {
    return null;
  }
}

async function rapportDe(execution: ExecutionSuivie | undefined, dernierePurge: string | null): Promise<RapportPage | null> {
  if (execution === undefined) return null;
  let contenu: unknown = null;
  if (execution.statut === "programme_ecrit") {
    try {
      contenu = await lireContenuProgramme(poolPrototype(), execution.id);
    } catch {
      contenu = null;
    }
  }
  const criteres = criteresDuRapport(execution, contenu);
  // Étapes avec et sans `placeId` : calculées à chaque affichage depuis le programme stocké (0116 § 4.4, 0117 § 4),
  // `null` sans programme écrit ; jamais dans le texte de « Copier le rapport » (`texteDuRapport` ne les reçoit pas).
  // Lot 2a : ligne oui ou non « liens vers les sites affichés » (source seule) dans le texte copié ; nombre d'étapes avec
  // site sur la page seulement (0122 § 2.3).
  return {
    execution,
    criteres,
    texte: texteDuRapport(execution, criteres, dernierePurge, liensSitesDuRapport(execution, contenu)),
    etapes: etapesDuRapport(contenu),
    etapesAvecSite: execution.statut === "programme_ecrit" ? etapesAvecSiteDuRapport(contenu) : null,
  };
}

/** Modèle du lancement : lu seulement si la page est ouverte. */
async function modeleLancement(): Promise<ModeleLancementP0> {
  const suivi = await suiviOuNul();
  const lignes =
    suivi === null
      ? []
      : NOMS_BRIEFS.flatMap((brief) =>
          VARIANTES.map((variante): LigneDecompte => ({
            brief,
            variante,
            compteesMax: COMPTEES_MAX[variante],
            relancesMax: RELANCES_MAX,
            ...decompte(suivi.executions, brief, variante),
          })),
        );
  const rapport = suivi === null ? null : await rapportDe(
          suivi.executions.find((execution) => execution.statut !== "en_cours"),
          suivi.dernierePurge,
        );
  return { briefs: NOMS_BRIEFS, suivi, decompte: lignes, rapport };
}

/** Page des exécutions : fermée (404), saisie du code, ou ouverte avec le modèle du lancement. */
export async function pageExecutionsP0(): Promise<PageExecutionsP0> {
  const etat = await etatPageExecutionsP0();
  if (etat !== "ouverte") return { etat };
  return { etat, modele: await modeleLancement() };
}
