import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADRESSE_A, ADRESSE_B, ADRESSE_DEBLOQUER, ADRESSE_DEBLOQUER_REFUS } from "../support/bout-en-bout-api";
import { convertirVoyagesSimules, ecrireVoyagesSimules } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient } from "./helpers";

/**
 * Données des scénarios de bout en bout de l'adaptateur `api` (spécification B6, B6b point 5 ; décision 0086 § 2.3 et
 * § 1.6 point 4 : « les données de bout en bout de B6b passent par le même module »). Écrites par le **processus de
 * test** (jamais par le serveur), dans `pnpm test:db`, que le job `db` exécute avant le projet Playwright `auth` sur la
 * même base : personnes et organisations personnelles par `createOrg` (chemin de B3b, `vadrouille_auth`), voyages par
 * `ecrireVoyagesSimules` (`vadrouille_app`, droit par `vadrouille_webhook`). Idempotent : une personne existante est
 * reprise, et ses voyages ne sont écrits que si son organisation n'en a aucun. Voir `tests/support/bout-en-bout-api.ts`.
 */

let app: DbClient;
let auth: DbClient;

type Identite = { org: string; owner: string };

/** Organisation personnelle de l'adresse (adhésion `owner`), créée par `createOrg` si la personne n'existe pas. */
async function identite(adresse: string): Promise<Identite> {
  const existante = await inTx(auth, {}, async (c) =>
    (
      await c.query(
        `SELECT m.organization_id AS org, u.id AS owner FROM users u
         JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
         JOIN organizations o ON o.id = m.organization_id AND o.kind = 'personal'
         WHERE u.email = $1`,
        [adresse],
      )
    ).rows,
  );
  if (existante.length === 1) return existante[0] as Identite;
  expect(existante).toHaveLength(0);
  const { org, owner } = await createOrg(auth, 0, adresse);
  return { org, owner };
}

async function nombreDeVoyages(id: Identite): Promise<number> {
  return inTx(app, { org: id.org, user: id.owner }, async (c) => Number((await c.query("SELECT count(*) AS n FROM trips WHERE organization_id = $1", [id.org])).rows[0].n));
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
});

afterAll(closeAll);

describe("données de bout en bout de l'adaptateur api (B6b ; B4b pour le déblocage)", () => {
  it.each([ADRESSE_A, ADRESSE_B, ADRESSE_DEBLOQUER, ADRESSE_DEBLOQUER_REFUS])("%s : organisation personnelle et quatre voyages du jeu simulé", async (adresse) => {
    const id = await identite(adresse);
    if ((await nombreDeVoyages(id)) === 0) await ecrireVoyagesSimules(app, id);
    expect(await nombreDeVoyages(id)).toBe(convertirVoyagesSimules().length);
    // Rejouer ne crée ni personne ni voyage de plus.
    expect(await identite(adresse)).toEqual(id);
  });
});
