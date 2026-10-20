// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ApiErrorSchema, ChecklistUpdateSchema } from "@/contracts";

import { basculerAFaire } from "./a-faire";
import { RefusAction, executerActionVoyage, type DependancesAction } from "./actions";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Cadre des actions sur un voyage et `toggleChecklistItem`, sans base (spécification B6, B6b points 2 et 3 ; décision
 * 0086 § 2.2). Critère `actions: le contexte vient de la session, jamais du client` (partie sans base ; la partie en base,
 * isolation et idempotence, est dans `tests/db/actions-voyage.test.ts`). `withOrg` est un double qui enregistre ses
 * appels et rend des lignes fabriquées : aucun appel ne joint une base.
 */

const CTX: AdapterContext = { organizationId: "0d000000-0000-4000-8000-000000000001", userId: "0d000000-0000-4000-8000-000000000002", role: "owner" };
const TRIP = "0d000000-0000-4000-8000-0000000000aa";
const ITEM = "0d000000-0000-4000-8000-0000000000bb";

type Requete = { texte: string; valeurs: unknown[] };

/** Double de `withOrg` : transaction fabriquée dont `execute` rend `reponses` dans l'ordre. */
function doubleWithOrg(reponses: Record<string, unknown>[][]) {
  const requetes: Requete[] = [];
  const contextes: unknown[] = [];
  const espion = vi.fn(async (ctx: unknown, fn: (tx: never) => Promise<unknown>): Promise<unknown> => {
    contextes.push(ctx);
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const morceaux: string[] = [];
        const valeurs: unknown[] = [];
        for (const morceau of requete.queryChunks) {
          const m = morceau as { value?: unknown; queryChunks?: unknown[] };
          if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
          else if (m.queryChunks !== undefined) {
            for (const interne of m.queryChunks) {
              const i = interne as { value?: unknown };
              if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
              else {
                valeurs.push(i.value);
                morceaux.push(`$${valeurs.length}`);
              }
            }
          }
        }
        requetes.push({ texte: morceaux.join(""), valeurs });
        return { rows: reponses.shift() ?? [] };
      },
    };
    return fn(tx as never);
  });
  const withOrg = espion as unknown as FonctionWithOrg & typeof espion;
  return { withOrg, requetes, contextes };
}

const ligne = (done: boolean) => ({
  id: ITEM,
  label: "[Billets du Tattoo]",
  moment: { type: "beforeDeparture" },
  done,
  booking_url: null,
  sponsored: false,
  stop_id: null,
});

const session = (ctx: AdapterContext | null) => ({ contexte: async () => ctx });

afterEach(() => vi.restoreAllMocks());

describe("actions: le contexte vient de la session, jamais du client", () => {
  it("sans session : unauthenticated, rien n'est lu", async () => {
    const { withOrg } = doubleWithOrg([]);
    const resultat = await basculerAFaire({ ...session(null), withOrg }, { tripId: TRIP, itemId: ITEM, done: true });
    expect(resultat).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(withOrg).not.toHaveBeenCalled();
  });

  it.each([{ organizationId: CTX.organizationId }, { userId: CTX.userId }, { organizationId: "autre", userId: "autre" }])(
    "un champ %j dans l'entrée : validation_failed, sans rien lire",
    async (extra) => {
      const { withOrg } = doubleWithOrg([]);
      const resultat = await basculerAFaire({ ...session(CTX), withOrg }, { tripId: TRIP, itemId: ITEM, done: true, ...extra });
      expect(resultat.ok).toBe(false);
      if (!resultat.ok) expect(resultat.error.code).toBe("validation_failed");
      expect(withOrg).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, "texte", { tripId: TRIP, itemId: ITEM }, { tripId: TRIP, itemId: ITEM, done: "oui" }, { tripId: "a/b", itemId: ITEM, done: true }])(
    "entrée invalide %j : validation_failed",
    async (entree) => {
      const { withOrg } = doubleWithOrg([]);
      const resultat = await basculerAFaire({ ...session(CTX), withOrg }, entree);
      expect(resultat.ok).toBe(false);
      if (!resultat.ok) expect(ApiErrorSchema.parse(resultat.error).code).toBe("validation_failed");
      expect(withOrg).not.toHaveBeenCalled();
    },
  );

  it("identifiant de voyage qui n'est pas un uuid : not_found sans requête (B6-PO-11)", async () => {
    const { withOrg } = doubleWithOrg([]);
    expect(await basculerAFaire({ ...session(CTX), withOrg }, { tripId: "mock_trip_edimbourg", itemId: ITEM, done: true })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(withOrg).not.toHaveBeenCalled();
  });

  it("contexte de withOrg : celui de la session ; voyage contrôlé dans l'organisation de la session", async () => {
    const { withOrg, requetes, contextes } = doubleWithOrg([[{ present: 1 }], [ligne(true)]]);
    const resultat = await basculerAFaire({ ...session(CTX), withOrg }, { tripId: TRIP, itemId: ITEM, done: true });
    expect(resultat).toEqual({ ok: true, value: { id: ITEM, label: "[Billets du Tattoo]", when: { type: "beforeDeparture" }, done: true, sponsored: false } });
    expect(contextes).toEqual([CTX]);
    expect(requetes).toHaveLength(2);
    expect(requetes[0]?.texte).toMatch(/FROM public\.trips WHERE organization_id = \$1 AND id = \$2/);
    expect(requetes[0]?.valeurs).toEqual([CTX.organizationId, TRIP]);
    expect(requetes[1]?.texte).toMatch(/UPDATE public\.checklist_items/);
    // `$4` figure deux fois dans le texte : deux paramètres liés de même valeur, dans l'ordre d'apparition.
    expect(requetes[1]?.valeurs).toEqual([true, true, CTX.organizationId, TRIP, ITEM]);
  });

  it("voyage absent de l'organisation : not_found (jamais forbidden), aucune écriture", async () => {
    const { withOrg, requetes } = doubleWithOrg([[]]);
    expect(await basculerAFaire({ ...session(CTX), withOrg }, { tripId: TRIP, itemId: ITEM, done: false })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(requetes).toHaveLength(1);
  });

  it("ligne absente du voyage, ou identifiant de ligne qui n'est pas un uuid : not_found", async () => {
    const absente = doubleWithOrg([[{ present: 1 }], []]);
    expect(await basculerAFaire({ ...session(CTX), withOrg: absente.withOrg }, { tripId: TRIP, itemId: ITEM, done: false })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    const malFormee = doubleWithOrg([[{ present: 1 }]]);
    expect(await basculerAFaire({ ...session(CTX), withOrg: malFormee.withOrg }, { tripId: TRIP, itemId: "j2-concert", done: false })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(malFormee.requetes).toHaveLength(1);
  });

  it("erreur inattendue (base) : internal, sans message ni pile ; journal sans valeur", async () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infos = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const SENTINELLE = "relation checklist_items SENTINELLE-B6B";
    const withOrg = async () => {
      throw new Error(SENTINELLE);
    };
    const resultat = await basculerAFaire({ ...session(CTX), withOrg }, { tripId: TRIP, itemId: ITEM, done: true });
    expect(resultat).toEqual({ ok: false, error: { code: "internal" } });
    const journal = [...erreurs.mock.calls, ...infos.mock.calls].map((appel) => String(appel[0])).join("");
    expect(journal).toContain('"event":"voyages.action_failed"');
    expect(journal).toContain('"action":"toggle-checklist-item"');
    expect(journal).not.toContain("SENTINELLE");
    expect(journal).not.toContain(ITEM);
  });

  it("ligne écrite qui ne valide plus le contrat : internal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { withOrg } = doubleWithOrg([[{ present: 1 }], [{ ...ligne(true), moment: { type: "inconnu" } }]]);
    expect(await basculerAFaire({ ...session(CTX), withOrg }, { tripId: TRIP, itemId: ITEM, done: true })).toEqual({ ok: false, error: { code: "internal" } });
  });

  it("contexte de session illisible (session non branchée) : internal, jamais unauthenticated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const contexte = async (): Promise<AdapterContext | null> => {
      throw new Error("session non branchée");
    };
    expect(await basculerAFaire({ contexte }, { tripId: TRIP, itemId: ITEM, done: true })).toEqual({ ok: false, error: { code: "internal" } });
  });

  it("refus fermé d'un traitement (RefusAction) : rendu tel quel", async () => {
    const { withOrg } = doubleWithOrg([[{ present: 1 }]]);
    const resultat = await executerActionVoyage("toggle-checklist-item", { ...session(CTX), withOrg }, ChecklistUpdateSchema, { tripId: TRIP, itemId: ITEM, done: true }, async () => {
      throw new RefusAction("not_found");
    });
    expect(resultat).toEqual({ ok: false, error: { code: "not_found" } });
  });
});
