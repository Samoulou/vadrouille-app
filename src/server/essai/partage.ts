import "server-only";

import { createHmac } from "node:crypto";

import { cookies } from "next/headers";

import type { PartageEssaiBranche } from "@/adapters/prototype-instance";
import { cookieAccesValide, NOM_COOKIE_ACCES, ouvertureP0, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { errorNameOf, logEvent } from "@/server/log";
import type { PoolSql } from "@/server/usage/neon";

/**
 * Partage réel d'un voyage du site d'essai (décision 0135, amendement de 0039 F10-TL-7), branché au démarrage par
 * `src/instrumentation.ts` sur l'adaptateur `prototype` (`brancherPartageEssai`).
 *
 * - **Clé** : `K = HMAC-SHA-256(code d'accès, "vadrouille/p0/partage/v1")`, comme la clé du cookie de déblocage (0124
 *   § 2) : ce module ne lit jamais le code ; il reçoit `attendu` de `ouvertureP0` et en dérive aussitôt une clé
 *   distincte, étiquetée (seconde exception à l'en-tête de `src/server/p0/acces.ts`, écrite dans 0135 § 3). Le code
 *   (`P0_RUN_TOKEN`) compte 32 octets au moins, non triviaux (`decodeSecret`) : la clé ne se devine pas depuis un jeton.
 *   Une rotation du code invalide d'un coup tous les liens émis (révocation de secours, 0135 § 7).
 * - **Session vérifiée** (création d'un lien) : cookie d'accès `__Host-p0_acces` valide, comme la lecture des programmes.
 * - **Barrière de la vue partagée** : pool `vadrouille_prototype` si la garde du mode réel est ouverte (conditions (1) à
 *   (7), déploiement autre que la production), **sans** cookie d'accès : le visiteur n'a pas le code. Elle n'est
 *   appelée que par le lecteur d'un seul voyage, après la vérification de la signature du jeton (`signed-share.ts`).
 *   Lecture seule (source sans `conserver`), sans relecture Routes.
 * - Garde fermée : aucune clé, aucune connexion, rien n'est journalisé. Ni la clé, ni un jeton, ni un identifiant de
 *   voyage n'atteignent un journal.
 */

const ETIQUETTE_CLE = "vadrouille/p0/partage/v1";

/** Clé de signature des liens tirée du code d'accès. */
export function clePartage(attendu: Buffer): Buffer {
  return createHmac("sha256", attendu).update(ETIQUETTE_CLE).digest();
}

export type DependancesPartage = DependancesAcces & { readonly cookie?: () => Promise<string | undefined> };

/**
 * Port du partage, sur des dépendances injectables (tests) ; `partageEssai` est la forme branchée. La clé est mémorisée
 * par port, garde ouverte ou fermée : la garde ne dépend que de l'environnement du processus, figé pour un déploiement.
 */
export function creerPartageEssai(dependances: DependancesPartage = {}): PartageEssaiBranche {
  let memoire: { readonly cle: Buffer | null } | null = null;
  return {
    cle() {
      if (memoire === null) {
        const ouverture = ouvertureP0(dependances, false);
        memoire = { cle: ouverture.ok ? clePartage(ouverture.attendu) : null };
      }
      return memoire.cle;
    },
    async sessionVerifiee() {
      const ouverture = ouvertureP0(dependances, false);
      if (!ouverture.ok) return false;
      const cookie = await (dependances.cookie ?? (async () => (await cookies()).get(NOM_COOKIE_ACCES)?.value))();
      return cookieAccesValide(cookie, ouverture.attendu, (dependances.maintenant ?? Date.now)());
    },
    async barriereLecture(): Promise<PoolSql | null> {
      if (!ouvertureP0(dependances, false).ok) return null;
      try {
        return poolPrototype();
      } catch (erreur) {
        logEvent("p0.read_unavailable", { errorName: errorNameOf(erreur) }, "error");
        return null;
      }
    },
  };
}

/** Partage branché sur l'adaptateur `prototype` par `src/instrumentation.ts`. */
export const partageEssai: PartageEssaiBranche = creerPartageEssai();
