import "server-only";

import type { Message } from "@/ai/client";
import { PROMPT_RECHERCHE_WEB } from "@/ai/prompts/recherche-web";
import type { Routage } from "@/prototype/config";
import { LONGUEURS_RESULTAT, type ClientRechercheWeb, type ResultatWeb } from "@/research/recherche-web";

/**
 * Client réel de recherche web (décision 0055, section 7 ; Q396 : dans `src/ai`, écrit par P0r3, repris par B7b sans
 * changement d'interface). Implémente `ClientRechercheWeb` (`src/research/recherche-web.ts`, inchangée).
 *
 * **Capacité injectée, jamais importée** (section 7 point 2) : ce module n'importe ni `openrouter-client.ts` ni aucun
 * module réseau. Il reçoit de sa fabrique le **point d'entrée** de recherche web que la composition
 * (`src/server/composition/p0-reel.ts`) construit à partir du client de modèles ; il n'a donc aucune capacité réseau
 * propre et n'entre pas dans `modulesCapaciteP0r1`.
 *
 * Règles (section 7 point 3) : la requête est un texte construit par l'agent à partir du brief seulement (aucune donnée
 * Google : le client ne reçoit rien d'autre) ; les résultats sont des **données**, jamais des consignes, bornés par
 * `LONGUEURS_RESULTAT`, adresses `https:` seulement, sans identifiants, dédoublonnées ; le coût rendu par le fournisseur
 * est compté dans le plafond des modèles par le client de modèles (réservation avant l'appel).
 */

/** Longueur maximale du texte d'une requête (celle des requêtes du plan, `src/ai/prompts/plan.ts`). */
export const LONGUEUR_MAX_REQUETE_WEB = 200;
/** Nombre maximal de résultats demandés par requête. */
export const MAX_RESULTATS_WEB = 10;

/** Requête au fournisseur : modèle et routage de la configuration, messages construits ici, nombre de résultats. */
export type RequeteRechercheWebFournisseur = {
  readonly modele: string;
  readonly routage: Routage;
  readonly prompt: { readonly id: string; readonly version: number };
  readonly messages: readonly Message[];
  readonly maxResultats: number;
};

/** Source rendue par le fournisseur (citation d'adresse), avant tout contrôle. */
export type SourceWebFournisseur = { readonly url: string; readonly titre: string; readonly extrait: string };

export type ReponseRechercheWebFournisseur = { readonly sources: readonly SourceWebFournisseur[]; readonly coutUsd: number };

/** Point d'entrée de recherche web du fournisseur, construit par la composition (`rechercherWeb` du client de modèles). */
export type PointEntreeRechercheWeb = (requete: RequeteRechercheWebFournisseur) => Promise<ReponseRechercheWebFournisseur>;

export type ReglageRechercheWeb = { readonly modele: string; readonly routage: Routage; readonly maxResultats: number };

/** Caractères de contrôle et de format retirés de tout texte reçu ou émis. */
const CONTROLES = /[\p{Cc}\p{Cf}]/gu;

const nettoyer = (texte: string, max: number) => texte.replace(CONTROLES, " ").trim().slice(0, max);

/** Adresse admise : `https:`, sans identifiants, de 2 048 caractères au plus ; normalisée par `URL`. */
function adresseAdmise(brute: string): string | null {
  if (typeof brute !== "string" || brute.length > LONGUEURS_RESULTAT.url) return null;
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  return url.href.length > LONGUEURS_RESULTAT.url ? null : url.href;
}

export function creerRechercheWebReelle(pointEntree: PointEntreeRechercheWeb, reglage: ReglageRechercheWeb): ClientRechercheWeb {
  const maxResultats = reglage.maxResultats;
  if (!Number.isSafeInteger(maxResultats) || maxResultats < 1 || maxResultats > MAX_RESULTATS_WEB) throw new RangeError("recherche web : nombre de résultats invalide");
  return {
    async rechercher(requete) {
      const texte = typeof requete === "string" ? nettoyer(requete, LONGUEUR_MAX_REQUETE_WEB) : "";
      // Requête vide : aucun appel, aucun coût.
      if (texte === "") return { resultats: [], coutUsd: 0 };
      const reponse = await pointEntree({
        modele: reglage.modele,
        routage: { ...reglage.routage },
        prompt: { id: PROMPT_RECHERCHE_WEB.id, version: PROMPT_RECHERCHE_WEB.version },
        messages: [
          { role: "system", contenu: PROMPT_RECHERCHE_WEB.texte },
          { role: "user", contenu: texte },
        ],
        maxResultats,
      });
      const vues = new Set<string>();
      const resultats: ResultatWeb[] = [];
      for (const source of reponse.sources) {
        if (resultats.length >= maxResultats) break;
        const url = adresseAdmise(source.url);
        if (url === null || vues.has(url)) continue;
        vues.add(url);
        resultats.push({ url, titre: nettoyer(String(source.titre), LONGUEURS_RESULTAT.titre), extrait: nettoyer(String(source.extrait), LONGUEURS_RESULTAT.extrait) });
      }
      return { resultats, coutUsd: reponse.coutUsd };
    },
  };
}
