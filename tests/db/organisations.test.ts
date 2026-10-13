import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeAll, connect, createOrg, type DbClient, expectRefused, inTx, unique } from "./helpers";

/**
 * Invariant « exactement un propriétaire » (décisions 0007 et 0008, handover § 7) : à la validation de la
 * transaction, toute organisation qui n'est pas en suppression a exactement une adhésion `owner`. Sous
 * `vadrouille_auth`, seul rôle qui écrit dans `organizations` et `memberships`.
 */

let auth: DbClient;
let app: DbClient;

beforeAll(async () => {
  auth = await connect("auth");
  app = await connect("app");
});

afterAll(closeAll);

/** Exécute une transaction sous vadrouille_auth ; renvoie le code d'erreur (à l'instruction ou à la validation). */
async function authTx(fn: (c: DbClient) => Promise<void>): Promise<string | undefined> {
  try {
    await inTx(auth, {}, fn);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? "erreur";
  }
}

const newUser = async (c: DbClient) => (await c.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [`p-${unique()}@exemple.ch`])).rows[0].id as string;
const newOrg = async (c: DbClient) =>
  (await c.query("INSERT INTO organizations (name, slug, kind) VALUES ('Organisation', $1, 'personal') RETURNING id", [`o-${unique()}`])).rows[0].id as string;

describe("organisations: exactement un propriétaire", () => {
  it("une organisation créée sans adhésion owner échoue à la validation", async () => {
    expect(
      await authTx(async (c) => {
        await newUser(c);
        await newOrg(c);
      }),
    ).toBe("23000");
  });

  it("une organisation avec seulement un membre (member) échoue à la validation", async () => {
    expect(
      await authTx(async (c) => {
        const user = await newUser(c);
        const org = await newOrg(c);
        await c.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'member')", [org, user]);
      }),
    ).toBe("23000");
  });

  it("deux adhésions owner sont refusées", async () => {
    expect(
      await authTx(async (c) => {
        const org = await newOrg(c);
        await c.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [org, await newUser(c)]);
        await c.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')", [org, await newUser(c)]);
      }),
    ).toMatch(/^23/);
  });

  it("retirer l'adhésion owner d'une organisation qui n'est pas en suppression échoue à la validation", async () => {
    const { org, owner } = await createOrg(auth);
    expect(await authTx((c) => c.query("DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2", [org, owner]).then(() => undefined))).toBe(
      "23000",
    );
  });

  it("UPDATE sur memberships refusé ; INSERT dans organizations avec deletion_requested_at refusé (droit de colonne)", async () => {
    const { org } = await createOrg(auth);
    await inTx(auth, {}, async (c) => {
      await expectRefused(c, "UPDATE memberships SET role = 'member' WHERE organization_id = $1", [org]);
      await expectRefused(c, "UPDATE organizations SET deletion_requested_at = now() WHERE id = $1", [org]);
      await expectRefused(
        c,
        "INSERT INTO organizations (name, slug, kind, deletion_requested_at) VALUES ('Organisation', $1, 'personal', now())",
        [`o-${unique()}`],
      );
    });
  });

  it("une organisation en suppression peut perdre son adhésion owner (étape 2 de deleteAccount)", async () => {
    const { org, owner } = await createOrg(auth);
    await inTx(app, { org, user: owner }, (c) => c.query("SELECT purge_organization_data($1)", [org]), "vadrouille_account_admin");
    expect(await authTx((c) => c.query("DELETE FROM memberships WHERE organization_id = $1", [org]).then(() => undefined))).toBeUndefined();
  });
});
