import type { ClientSql, PoolSql, ResultatRequeteSql } from "@/server/usage/neon";

/**
 * Double de la base pour `prototype.run_attempts` et `prototype.runs` (P0r3b ; décision 0055, sections 1 et 2) :
 * verrou consultatif rendu par une file (deux transactions qui le prennent sont sérialisées, comme
 * `pg_advisory_xact_lock` ; une transaction qui ne le prend pas, celle du bon code, n'attend pas), compte des seuls
 * refus quand la requête filtre `resultat = 'refuse'` (décision 0165 § 4.1), lignes d'essais validées au `COMMIT`
 * seulement, horloge injectée. `lock_timeout` local (`set_config('lock_timeout', …, true)`) : noté pour la transaction
 * en cours seulement (après `BEGIN`, levé au `COMMIT` ou au `ROLLBACK`). Avec `verrouTenu`, le verrou est tenu par une
 * autre session : une transaction qui l'attend avec une borne reçoit l'erreur 55P03 de Postgres (`lock_not_available`) ;
 * sans borne, elle attend sans fin, comme Postgres (le test échoue alors par dépassement de son délai). Chaque requête est notée (texte et valeurs) pour les tests « aucune trace du code en
 * base » et pour l'ordre des requêtes (le bon code ne prend ni le verrou ni le compte).
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
  /** Verrou consultatif tenu par une autre session (risque 4 de l'amendement de 0165). */
  verrouTenu: boolean;
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
    verrouTenu: false,
  };
  const vide: ResultatRequeteSql = { rows: [] };

  function client(): ClientSql {
    base.connexions += 1;
    let liberer: (() => void) | undefined;
    let enAttente: { resultat: unknown; instant: number }[] = [];
    let enTransaction = false;
    let borneVerrou: string | undefined;
    const fin = () => {
      liberer?.();
      liberer = undefined;
      enTransaction = false;
      borneVerrou = undefined;
    };
    return {
      async query(texte, valeurs = []) {
        base.requetes.push({ texte, valeurs });
        if (texte === "BEGIN") {
          enTransaction = true;
          return vide;
        }
        const borne = /set_config\('lock_timeout', '([^']*)', true\)/.exec(texte);
        if (borne !== null) {
          // Hors transaction, `set_config(…, true)` ne dure que l'instruction : aucune borne pour la suite.
          if (enTransaction) borneVerrou = borne[1];
          return { rows: [{ set_config: borne[1] }] };
        }
        if (texte.includes("pg_advisory_xact_lock") && base.verrouTenu) {
          if (borneVerrou !== undefined && borneVerrou !== "0") {
            throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
          }
          return new Promise<never>(() => undefined);
        }
        if (texte.includes("pg_advisory_xact_lock")) {
          const precedent = file;
          file = new Promise<void>((resolve) => {
            liberer = resolve;
          });
          await precedent;
          return vide;
        }
        if (texte.includes("pg_catalog.count(*)")) {
          // Requête filtrée sur `resultat = 'refuse'` (décision 0165 § 1.2) : seuls les refus sont comptés.
          const refusSeuls = texte.includes("resultat = 'refuse'");
          const n = base.essais.filter((e) => e.instant > base.maintenant - 3_600_000 && (!refusSeuls || e.resultat === "refuse")).length;
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
