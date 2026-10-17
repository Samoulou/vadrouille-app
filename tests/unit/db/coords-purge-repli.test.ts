// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `purge: le repli manuel purge sans laisser d'appartenance` (décision 0060 § 3.5 et § 4, B8c), partie statique :
 * `db/maintenance/coords-purge-repli.sql` contient exactement le bloc de 0060 § 3.5, commentaires retirés. La partie
 * base (bloc joué tel quel, avec et sans la ligne ADMIN, et sans sa ligne REVOKE) est dans `tests/db/coordonnees.test.ts`.
 */

const RACINE = process.cwd();
const FICHIER = readFileSync(path.join(RACINE, "db/maintenance/coords-purge-repli.sql"), "utf8");

/** Bloc de 0060 § 3.5, recopié de la décision. */
const BLOC = `DO $$
DECLARE
  v_moi CONSTANT text := pg_catalog.current_user();
BEGIN
  EXECUTE pg_catalog.format('GRANT vadrouille_coords_purge TO %I WITH INHERIT FALSE, SET TRUE', v_moi);
  SET LOCAL ROLE vadrouille_coords_purge;
  PERFORM public.purge_expired_coordinates();
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_moi);
  EXECUTE pg_catalog.format('REVOKE vadrouille_coords_purge FROM %I', v_moi);
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members am
    JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
    JOIN pg_catalog.pg_roles m ON m.oid = am.member
    WHERE r.rolname = 'vadrouille_coords_purge' AND m.rolname = v_moi
      AND (am.inherit_option OR am.set_option OR NOT am.admin_option)
  ) THEN
    RAISE EXCEPTION 'repli : appartenance temporaire non retirée';
  END IF;
END
$$;`;

describe("purge: le repli manuel purge sans laisser d'appartenance (texte du fichier)", () => {
  it("le fichier contient exactement le bloc de 0060 § 3.5, commentaires retirés", () => {
    const code = FICHIER.split("\n")
      .filter((l) => !/^\s*--/.test(l) && l.trim() !== "")
      .join("\n");
    expect(code).toBe(BLOC);
  });

  it("aucun commentaire en fin de ligne dans le bloc, aucune autre instruction", () => {
    const code = FICHIER.split("\n").filter((l) => !/^\s*--/.test(l));
    expect(code.filter((l) => l.includes("--"))).toEqual([]);
    expect(FICHIER.match(/\$\$;/g)).toHaveLength(1);
  });
});
