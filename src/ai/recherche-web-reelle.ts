import "server-only";

import { MAX_RESULTATS_WEB, MOTEURS_GREFFON_WEB, type MoteurGreffonWeb, type PointEntreeRechercheWeb } from "@/ai/client";
import { PROMPT_RECHERCHE_WEB } from "@/ai/prompts/recherche-web";
import { DEBUT_DONNEES, FIN_DONNEES } from "@/ai/requetes";
import { LONGUEURS_TEXTE } from "@/prototype/candidat";
import type { Routage } from "@/prototype/config";
import { LONGUEURS_RESULTAT, nettoyerRequeteWeb, type ClientRechercheWeb, type ResultatWeb } from "@/research/recherche-web";

/**
 * Client réel de recherche web (décision 0055, section 7 ; Q396 : dans `src/ai`, écrit par P0r3, repris par B7b sans
 * changement d'interface). Implémente `ClientRechercheWeb` (`src/research/recherche-web.ts`, inchangée).
 *
 * **Capacité injectée, jamais importée** (section 7 point 2) : ce module n'importe ni `openrouter-client.ts` ni aucun
 * module réseau. Il reçoit de sa fabrique le **point d'entrée** de recherche web que la composition
 * (`src/server/composition/p0-reel.ts`) construit à partir du client de modèles ; il n'a donc aucune capacité réseau
 * propre et n'entre pas dans `modulesCapaciteP0r1`. Le contrat du point d'entrée (requête, réponse, nombre maximal de
 * résultats) vit dans `@/ai/client` (correction 1 de la PR 326, mineur 8).
 *
 * Règles (section 7 point 3) : la requête est un texte construit par l'agent à partir du brief seulement (aucune donnée
 * Google : le client ne reçoit rien d'autre), encadrée comme une donnée (`<<<DONNEES>>>`, sans `<` ni `>`) ; le moteur
 * du greffon est fixé par la configuration (bloquant 1c de la PR 326) ; les résultats sont des **données**, jamais des
 * consignes, bornés par `LONGUEURS_RESULTAT`, adresses `https:` seulement, sans identifiants, dédoublonnées ; le coût
 * rendu par le fournisseur est compté dans le plafond des modèles par le client de modèles (réservation avant l'appel).
 *
 * Limite (mineur 4 de la PR 326) : ce client ne filtre pas le contenu de la requête, il n'a pas le brief. Le filtre des
 * données du brief (`requeteSansDonneeDuBrief`, `src/research/agent.ts`) vit dans l'agent de recherche, seul appelant
 * de `rechercher` ; tout nouvel appelant doit l'appliquer avant l'appel.
 */

/** Longueur maximale du texte d'une requête : celle des requêtes du plan (`LONGUEURS_TEXTE.requete`). */
export const LONGUEUR_MAX_REQUETE_WEB = LONGUEURS_TEXTE.requete;

export type ReglageRechercheWeb = { readonly modele: string; readonly routage: Routage; readonly moteur: MoteurGreffonWeb; readonly maxResultats: number };

/** Caractères de contrôle et de format retirés de tout texte reçu ou émis. */
const CONTROLES = /[\p{Cc}\p{Cf}]/gu;

const nettoyer = (texte: string, max: number) => texte.replace(CONTROLES, " ").trim().slice(0, max);

/**
 * Requête : contrôles retirés, `<` et `>` retirés (le texte ne peut ni fermer le cadre ni ressembler à une balise),
 * `LONGUEUR_MAX_REQUETE_WEB` caractères au plus. Même fonction que celle que l'agent applique **avant** son filtre
 * (`nettoyerRequeteWeb`, mineur 4 du head `3254723`) : idempotente, elle ne change plus rien ici à une requête de l'agent.
 */
const nettoyerRequete = (texte: string) => nettoyerRequeteWeb(texte, LONGUEUR_MAX_REQUETE_WEB);

/** Message de l'utilisateur : la requête seule, encadrée comme une donnée. */
export const messageRequete = (texte: string) => `${DEBUT_DONNEES}\n${texte}\n${FIN_DONNEES}`;

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
  if (!(MOTEURS_GREFFON_WEB as readonly string[]).includes(reglage.moteur)) throw new RangeError("recherche web : moteur invalide");
  if (!Number.isSafeInteger(maxResultats) || maxResultats < 1 || maxResultats > MAX_RESULTATS_WEB) throw new RangeError("recherche web : nombre de résultats invalide");
  return {
    async rechercher(requete) {
      const texte = typeof requete === "string" ? nettoyerRequete(requete) : "";
      // Requête vide : aucun appel, aucun coût.
      if (texte === "") return { resultats: [], coutUsd: 0 };
      const reponse = await pointEntree({
        modele: reglage.modele,
        routage: { ...reglage.routage },
        moteur: reglage.moteur,
        prompt: { id: PROMPT_RECHERCHE_WEB.id, version: PROMPT_RECHERCHE_WEB.version },
        messages: [
          { role: "system", contenu: PROMPT_RECHERCHE_WEB.texte },
          { role: "user", contenu: messageRequete(texte) },
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
