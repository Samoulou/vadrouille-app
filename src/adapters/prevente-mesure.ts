import { headers } from "next/headers";
import { after } from "next/server";

import {
  PREVENTE_PROVENANCE_AUTRE,
  PREVENTE_PROVENANCE_DIRECT,
  PREVENTE_PROVENANCE_INTERNE,
  PREVENTE_PROVENANCES_SUIVI,
  PreventeProvenanceSchema,
  type PreventeProvenance,
  type PreventeProvenanceDeclaree,
} from "@/contracts/prevente-mesure";
import { isProductionDeployment } from "@/dev/flags";
import { estRobotDeclare } from "@/server/config/robots";

import { getPrevente } from "./prevente";
import { mesurePreventeBranchee, type MesurePrevente } from "./prevente-mesure-instance";

export type { MesurePrevente } from "./prevente-mesure-instance";

/**
 * Mesure de la prévente : compteur de visites de la page de prévente, « compteur disponible » et « questionnaire
 * disponible » (spécification `specs/C2-prevente-mesure.md`, § 2 et § 6.2 ; tâche C2b, ticket 1130). L'envoi du
 * questionnaire (C2c) et sa page (C2d) n'y sont pas.
 *
 * Règle au-dessus des autres : **la page de prévente ne casse ni n'attend jamais à cause de la mesure.** Rien ici ne
 * lève vers la page ; sans base, rien n'est tenté et rien n'est journalisé.
 *
 * Ce module n'atteint ni la base ni l'environnement du serveur : la mise en œuvre Postgres
 * (`src/server/prevente/visites.ts`), le prédicat du limiteur et le journal sont branchés au démarrage
 * (`./prevente-mesure-instance`, `src/instrumentation.ts`). Non branchée (tests, `next build`) : rien n'est disponible.
 *
 * Formes fixées par la décision 0175 (Tech Lead : T2 § 1, T3 § 2, `HEAD` § 3, T4 § 4 ; S4 : verdict Sécurité rapporté § 6) :
 * - **T3 (où compter)** : dans le rendu de `/` (`src/app/page.tsx`, rendue à chaque requête : `force-dynamic`), par un
 *   seul appel de `compterVisitePrevente`. La décision (« compter ou non ») est prise pendant le rendu, sur les en-têtes
 *   de la requête ; l'écriture est remise à `after()` de Next.js : elle part **après** l'envoi de la réponse, et la
 *   plateforme garde la fonction en vie jusqu'à sa fin. Un préchargement (`Next-Router-Prefetch`,
 *   `Next-Router-Segment-Prefetch`, `Purpose` ou `Sec-Purpose` contenant `prefetch`) n'est pas compté ; une navigation du
 *   routeur sans préchargement affiche la page et est comptée, comme une vue partagée (décision 0161, conséquences).
 *   **Limite : une requête `HEAD` n'est pas reconnue ici.** Next.js rend la page pour `HEAD` et un composant serveur ne
 *   connaît pas la méthode ; l'exclure demanderait de passer par le proxy (`src/proxy.ts`), ce que la décision 0175 écarte
 *   (§ 2 point 4) : limite acceptée, critère A6 amendé (0175 § 3).
 * - **T2 (robots)** : liste maison de `src/server/config/robots.ts`.
 * - **T4 (disponibilité)** : `compteurPreventeDisponible` et `questionnairePreventeDisponible` ci-dessous.
 * - **S4 (gonflement par des requêtes fabriquées)** : aucun plafond ; le volume stocké est borné par la forme (au plus
 *   9 lignes par jour).
 *
 * Aucun cookie, aucun identifiant ; l'adresse IP n'est jamais lue (ce module n'importe pas `src/server/ip.ts`) ;
 * l'agent utilisateur est lu pour reconnaître un robot, puis oublié : ni stocké, ni journalisé.
 */

/** Ligne du compteur : rien d'autre n'est gardé (critère A9). */
export type LigneVisitesPrevente = { readonly jour: string; readonly src: PreventeProvenance; readonly visites: number };

export type MesurePreventeMemoire = MesurePrevente & {
  /** Lignes du compteur, dans l'ordre de leur première écriture. */
  readonly lignes: () => LigneVisitesPrevente[];
};

/**
 * Mise en œuvre en mémoire (§ 6.2, « Adaptateur `mock` ») : pour les tests de C2b, C2d et C2f sans base. Elle n'est
 * choisie par **aucune variable** : seul un test la branche (`brancherMesurePrevente`). Sur un déploiement de
 * production elle se dit indisponible et refuse d'écrire, quoi qu'il arrive. `limiteurConfigure` : faux par défaut,
 * comme sans limiteur ; un test du questionnaire le pose à vrai.
 */
export function creerMesurePreventeMemoire(options: { readonly now?: () => number; readonly limiteurConfigure?: boolean } = {}): MesurePreventeMemoire {
  const now = options.now ?? Date.now;
  const compteurs = new Map<string, LigneVisitesPrevente>();
  return Object.freeze({
    compteurDisponible: () => !isProductionDeployment(),
    limiteurConfigure: () => options.limiteurConfigure === true && !isProductionDeployment(),
    visitePerdue: () => undefined,
    async compterVisite(src: PreventeProvenance): Promise<void> {
      if (isProductionDeployment()) throw new Error("mesure en mémoire refusée en production");
      const provenance = PreventeProvenanceSchema.parse(src);
      const jour = new Date(now()).toISOString().slice(0, 10);
      const cle = `${jour}|${provenance}`;
      compteurs.set(cle, { jour, src: provenance, visites: (compteurs.get(cle)?.visites ?? 0) + 1 });
    },
    lignes: () => [...compteurs.values()],
  });
}

/**
 * **Compteur disponible** (§ 6.2 ; décision 0175 § 4 point 2) : une mise en œuvre est branchée, et elle se dit disponible.
 * Pour Postgres : la variable de connexion de `vadrouille_app` est posée et la garde de `db/connection.ts` admet
 * l'environnement (jamais en production aujourd'hui, décision 0034). Répond sans ouvrir de connexion, sans journal ; ne
 * lève jamais.
 */
export function compteurPreventeDisponible(): boolean {
  try {
    return mesurePreventeBranchee()?.compteurDisponible() === true;
  } catch {
    return false;
  }
}

/**
 * **Questionnaire disponible** (§ 6.2 ; décision 0175 § 4 point 3) : compteur disponible **et** limiteur configuré (les
 * variables que le limiteur exige à l'usage, `limiteurConfigure` de `src/server/rate-limit.ts`). C'est la condition
 * d'affichage des deux liens vers le questionnaire et du formulaire (C2d). Ne lève jamais.
 */
export function questionnairePreventeDisponible(): boolean {
  try {
    return compteurPreventeDisponible() && mesurePreventeBranchee()?.limiteurConfigure() === true;
  } catch {
    return false;
  }
}

/**
 * Provenance gardée (§ 2.2 point 4), à partir de la valeur rendue par `sourcePrevente` (lettres minuscules, chiffres,
 * tirets, 30 au plus ; `null` si `src` est absent, répété ou de forme invalide) :
 * `interne` reste `interne` (rien n'est écrit) ; une valeur de la liste de `suivi.md` est gardée ; une valeur valide
 * hors liste devient `autre` ; `null` devient `direct`.
 */
export function provenancePrevente(src: string | null): PreventeProvenanceDeclaree {
  if (src === null) return PREVENTE_PROVENANCE_DIRECT;
  if (src === PREVENTE_PROVENANCE_INTERNE) return PREVENTE_PROVENANCE_INTERNE;
  return PREVENTE_PROVENANCES_SUIVI.find((connue) => connue === src) ?? PREVENTE_PROVENANCE_AUTRE;
}

/** En-têtes d'une requête, en lecture (`Headers`). */
export type EntetesRequete = { get(nom: string): string | null };

/** En-têtes dont la seule présence signale un préchargement du routeur de Next.js. */
const EN_TETES_PRECHARGEMENT_ROUTEUR = ["next-router-prefetch", "next-router-segment-prefetch"] as const;
/** En-têtes des navigateurs dont la valeur dit `prefetch` (`Sec-Purpose: prefetch;prerender` compris). */
const EN_TETES_INTENTION = ["purpose", "sec-purpose", "x-purpose", "x-moz"] as const;

/** Vrai pour une requête qui prépare un affichage sans l'être (C2-PO-2). */
export function estPrechargement(entetes: EntetesRequete): boolean {
  if (EN_TETES_PRECHARGEMENT_ROUTEUR.some((nom) => entetes.get(nom) !== null)) return true;
  return EN_TETES_INTENTION.some((nom) => entetes.get(nom)?.toLowerCase().includes("prefetch") === true);
}

/**
 * Provenance sous laquelle compter cet affichage, ou `null` s'il ne compte pas : lien de test `interne`, préchargement,
 * robot déclaré, agent utilisateur absent ou vide. Fonction pure ; ne lit ni adresse IP, ni cookie, ni `Referer`.
 */
export function visiteACompter(src: string | null, entetes: EntetesRequete): PreventeProvenance | null {
  const provenance = provenancePrevente(src);
  if (provenance === PREVENTE_PROVENANCE_INTERNE) return null;
  if (estPrechargement(entetes)) return null;
  if (estRobotDeclare(entetes.get("user-agent"))) return null;
  return provenance;
}

/** Écriture d'une visite : n'échoue jamais ; une visite non écrite est perdue (C2-PO-6), une ligne de journal, nom seul. */
async function ecrireVisite(mesure: MesurePrevente, provenance: PreventeProvenance): Promise<void> {
  try {
    await mesure.compterVisite(provenance);
  } catch (error) {
    try {
      mesure.visitePerdue(error);
    } catch {
      // Le journal lui-même ne doit rien casser.
    }
  }
}

/** Remet la tâche après l'envoi de la réponse (`after`) ; hors d'une requête de Next.js (tests), la lance sans l'attendre. */
function apresLaReponse(tache: () => Promise<void>): void {
  try {
    after(tache);
  } catch {
    void tache();
  }
}

/**
 * Compte un affichage de la page de prévente. **Seul appel de la mesure dans `src/app/page.tsx`**, avec la provenance
 * déjà lue par `sourcePrevente`.
 *
 * Dans l'ordre : précommande fermée, rien (critère A7) ; `interne`, rien ; mesure non branchée ou compteur indisponible, rien, sans lire la
 * requête ni tenter de connexion (A12) ; préchargement, robot ou agent utilisateur absent, rien ; sinon une écriture,
 * lancée après la réponse et jamais attendue par le rendu (A10, A11). Ne lève jamais.
 */
export async function compterVisitePrevente(src: string | null): Promise<void> {
  try {
    if (getPrevente() === null) return;
    if (provenancePrevente(src) === PREVENTE_PROVENANCE_INTERNE) return;
    const mesure = mesurePreventeBranchee();
    if (mesure === undefined || mesure.compteurDisponible() !== true) return;
    const provenance = visiteACompter(src, await headers());
    if (provenance === null) return;
    apresLaReponse(() => ecrireVisite(mesure, provenance));
  } catch {
    // Hors d'une requête (en-têtes illisibles) ou toute autre erreur : la page s'affiche comme sans compteur.
  }
}
