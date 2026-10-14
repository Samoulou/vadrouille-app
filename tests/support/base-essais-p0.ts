import type { ClientSql, PoolSql, ResultatRequeteSql } from "@/server/usage/neon";

/**
 * Double de la base pour `prototype.run_attempts` et `prototype.runs` (P0r3b ; décision 0055, sections 1 et 2) :
 * verrou consultatif rendu par une file (deux transactions qui le prennent sont sérialisées, comme
 * `pg_advisory_xact_lock`), lignes d'essais validées au `COMMIT` seulement, horloge injectée. Chaque requête est
 * notée (texte et valeurs) pour les tests « aucune trace du code en base ».
 */
export type BaseEssais = {
  readonly pool: PoolSql;
  readonly requetes: {
    readonly texte: string;
    readonly valeurs: readonly unknown[];
  }[];
  readonly essais: { readonly resultat: unknown; readonly instant: number }[];
  /** Lignes rendues par la lecture de l'exécution d'une étape. */
  executions: number;
  maintenant: number;
  connexions: number;
};

export function baseEssais(maintenant = Date.UTC(2026, 9, 14, 8)): BaseEssais {
  let file: Promise<void> = Promise.resolve();
  const base: BaseEssais = {
    pool: { connect: async () => client() },
    requetes: [],
    essais: [],
    executions: 1,
    maintenant,
    connexions: 0,
  };
  const vide: ResultatRequeteSql = { rows: [] };

  function client(): ClientSql {
    base.connexions += 1;
    let liberer: (() => void) | undefined;
    let enAttente: { resultat: unknown; instant: number }[] = [];
    const fin = () => {
      liberer?.();
      liberer = undefined;
    };
    return {
      async query(texte, valeurs = []) {
        base.requetes.push({ texte, valeurs });
        if (texte.includes("pg_advisory_xact_lock")) {
          const precedent = file;
          file = new Promise<void>((resolve) => {
            liberer = resolve;
          });
          await precedent;
          return vide;
        }
        if (texte.includes("pg_catalog.count(*)")) {
          const n = base.essais.filter((e) => e.instant > base.maintenant - 3_600_000).length;
          return { rows: [{ n: String(n) }] };
        }
        if (texte.startsWith("INSERT INTO prototype.run_attempts")) {
          enAttente.push({ resultat: valeurs[0], instant: base.maintenant });
          return vide;
        }
        if (texte.includes("FROM prototype.runs"))
          return {
            rows: Array.from({ length: base.executions }, () => ({ ok: 1 })),
          };
        if (texte === "COMMIT") {
          base.essais.push(...enAttente);
          enAttente = [];
          fin();
        }
        if (texte === "ROLLBACK") {
          enAttente = [];
          fin();
        }
        return vide;
      },
      release() {
        fin();
      },
    };
  }

  return base;
}
