import type { OrgTransaction } from "@/server/with-org";

/**
 * Transaction simulée pour les tests des cas d'usage du partage (ticket 1013, M6a). Le test double `executeurSql` de
 * `@/server/with-org` par l'identité : la « transaction » est directement un exécuteur qui note chaque requête (texte et
 * valeurs, tels que le module les passe) et la confie à `repondre`. Aucune base, aucun réseau.
 */
export type RequeteNotee = { readonly texte: string; readonly valeurs: readonly unknown[] };

export function fausseTransaction(repondre: (requete: RequeteNotee) => Record<string, unknown>[]): { tx: OrgTransaction; requetes: RequeteNotee[] } {
  const requetes: RequeteNotee[] = [];
  const executeur = {
    async query(texte: string, valeurs: readonly unknown[] = []) {
      const requete = { texte, valeurs };
      requetes.push(requete);
      return { rows: repondre(requete) };
    },
  };
  return { tx: executeur as unknown as OrgTransaction, requetes };
}
