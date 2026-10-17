// @vitest-environment node
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DayMapSchema, DaySchema, ProposalSchema, TripSchema, TripSummarySchema } from "@/contracts";
import { prototypeAdapterAllowed } from "@/dev/flags";
import { createRelecteurSimule, DUREE_SENTINELLE_MINUTES } from "@/mocks/prototype-relecteur";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema, type ProgrammeReduit } from "@/prototype/programme-reduit";

import { getRequestContext, PROTOTYPE_USER_ID } from "./context";
import { getTripAdapter, prototypeRelectures } from "./index";
import { createPrototypeAdapter, RelectureError, type PaireRelecture, type SourceProgrammes } from "./prototype";
import { createProgrammeLoader } from "./prototype-loader";

const ROOT = process.cwd();
const DOSSIER_TEST = realpathSync(join(ROOT, "prototype", "programmes-test"));
const TRIP_ID = "proto_test_20261012_1";
const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

function programmeDeTest(): ProgrammeReduit {
  return ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER_TEST, `${TRIP_ID}.json`), "utf8")));
}

/** Source en mémoire : le programme de test, relu à chaque appel (comme le chargeur). */
function source(programme: ProgrammeReduit = programmeDeTest()): SourceProgrammes {
  return {
    ids: async () => [programme.trip.id],
    lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Environnement de test : `NODE_ENV` peut manquer ou prendre une valeur hors du type de Next.js. */
type Env = Record<string, string | undefined>;
const asEnv = (env: Env) => env as NodeJS.ProcessEnv;

describe("adaptateurs: prototype refusé en production et hors liste blanche (décision 0032 § A4.2)", () => {
  it.each<[string, Env]>([
    ["VERCEL_ENV=production", { VERCEL_ENV: "production", NODE_ENV: "development" }],
    ["VADROUILLE_ENV=production", { VADROUILLE_ENV: "production", NODE_ENV: "test" }],
    ["VERCEL_ENV=Production (casse)", { VERCEL_ENV: "Production", NODE_ENV: "test" }],
    ["VADROUILLE_ENV= production (espace)", { VADROUILLE_ENV: " production", NODE_ENV: "test" }],
    ["VADROUILLE_ENV=staging", { VADROUILLE_ENV: "staging", NODE_ENV: "test" }],
    ["VERCEL_ENV=preview avec VADROUILLE_ENV=production", { VERCEL_ENV: "preview", VADROUILLE_ENV: "production" }],
    ["NODE_ENV=production sans VERCEL_ENV ni drapeau", { NODE_ENV: "production" }],
    ["NODE_ENV absent", {}],
    ["NODE_ENV=staging", { NODE_ENV: "staging" }],
    ["VERCEL_ENV inconnu", { VERCEL_ENV: "staging", NODE_ENV: "development" }],
    ["drapeau sans CI", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1" }],
    ["drapeau avec CI=1", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "1" }],
    ["drapeau avec CI=false", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "false" }],
    ["drapeau avec CI=TRUE", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "TRUE" }],
    ["drapeau=true avec CI=true", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "true", CI: "true" }],
    // Combinaisons du test `env: gardes de configuration` de la décision 0006 (liste fermée, plus stricte).
    ["0006 : VADROUILLE_ENV=prod", { VADROUILLE_ENV: "prod", NODE_ENV: "test" }],
    ["0006 : VADROUILLE_ENV=ci et VERCEL_ENV=production", { VADROUILLE_ENV: "ci", VERCEL_ENV: "production" }],
    ["0006 : VADROUILLE_ENV=staging et VERCEL_ENV=preview", { VADROUILLE_ENV: "staging", VERCEL_ENV: "preview" }],
    ["0006 : valeur hors liste", { VERCEL_ENV: "prod", NODE_ENV: "development" }],
  ])("refus : %s", async (_cas, valeurs) => {
    const env = asEnv(valeurs);
    expect(prototypeAdapterAllowed(env)).toBe(false);
    expect(() => getTripAdapter("prototype", env)).toThrow(/adaptateur prototype refusé/);
    await expect(getRequestContext("prototype", env)).rejects.toThrow(/adaptateur prototype refusé/);
  });

  it.each<[string, Env]>([
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview", NODE_ENV: "production" }],
    ["VERCEL_ENV=development", { VERCEL_ENV: "development", NODE_ENV: "production" }],
    ["poste local (pnpm dev)", { NODE_ENV: "development" }],
    ["Vitest", { NODE_ENV: "test" }],
    ["VADROUILLE_ENV=local", { VADROUILLE_ENV: "local", NODE_ENV: "development" }],
    ["0006 : VERCEL_ENV=preview seule", { VERCEL_ENV: "preview" }],
    ["0006 : VADROUILLE_ENV=local et VERCEL_ENV=preview", { VADROUILLE_ENV: "local", VERCEL_ENV: "preview" }],
    ["drapeau de CI", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "true" }],
    ["drapeau de CI avec VADROUILLE_ENV=ci", { NODE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "true", VADROUILLE_ENV: "ci" }],
  ])("ouvert : %s", async (_cas, valeurs) => {
    const env = asEnv(valeurs);
    expect(prototypeAdapterAllowed(env)).toBe(true);
    expect(await getRequestContext("prototype", env)).toEqual({ organizationId: PROTOTYPE_ORG_ID, userId: PROTOTYPE_USER_ID, role: "owner" });
    expect(() => getTripAdapter("prototype", env)).not.toThrow();
  });
});

describe("adaptateurs: VADROUILLE_PROTOTYPE=1 n'ouvre jamais en production", () => {
  const drapeau = { VADROUILLE_PROTOTYPE: "1", CI: "true" } as const;
  it.each<[string, Env]>([
    ["VERCEL_ENV=production", { ...drapeau, VERCEL_ENV: "production" }],
    ["VERCEL_ENV=production, NODE_ENV=production", { ...drapeau, VERCEL_ENV: "production", NODE_ENV: "production" }],
    ["VADROUILLE_ENV=production", { ...drapeau, VADROUILLE_ENV: "production" }],
    ["VADROUILLE_ENV=production, NODE_ENV=production", { ...drapeau, VADROUILLE_ENV: "production", NODE_ENV: "production" }],
  ])("%s : refus pour l'adaptateur et le contexte", async (_cas, valeurs) => {
    const env = asEnv(valeurs);
    expect(prototypeAdapterAllowed(env)).toBe(false);
    expect(() => getTripAdapter("prototype", env)).toThrow(/adaptateur prototype refusé/);
    await expect(getRequestContext("prototype", env)).rejects.toThrow(/adaptateur prototype refusé/);
  });
});

describe("adaptateurs: relecteur simulé inatteignable hors liste blanche", () => {
  it("compteur null hors liste blanche, nombre sous liste blanche", () => {
    expect(prototypeRelectures({ NODE_ENV: "production" })).toBeNull();
    expect(prototypeRelectures(asEnv({ VADROUILLE_ENV: "production", VADROUILLE_PROTOTYPE: "1", CI: "true" }))).toBeNull();
    expect(prototypeRelectures({ NODE_ENV: "test" })).toEqual(expect.any(Number));
  });
});

describe("adaptateurs: prototype recompose et valide chaque sortie", () => {
  it("le programme de test passe le schéma strict de la forme réduite (importé de src/prototype)", () => {
    expect(ProgrammeReduitSchema.safeParse(programmeDeTest()).success).toBe(true);
  });

  it("getTrip : segments relus (estimated: false), travelMinutes = somme, TripSchema valide", async () => {
    const adapter = createPrototypeAdapter({ programmes: source(), relecteurs: { trajets: createRelecteurSimule() } });
    const trip = await adapter.getTrip(ctx, TRIP_ID);
    expect(trip).not.toBeNull();
    expect(TripSchema.safeParse(trip).success).toBe(true);
    for (const day of trip!.days) {
      const segments = day.items.flatMap((item) => (item.type === "segment" ? [item.segment] : []));
      expect(segments.length).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment).toMatchObject({ minutes: DUREE_SENTINELLE_MINUTES, estimated: false });
      }
      expect(day.travelMinutes).toBe(segments.length * DUREE_SENTINELLE_MINUTES);
    }
    expect(trip!.organizationId).toBe(PROTOTYPE_ORG_ID);
    expect(trip!.unlocked).toBe(true);
  });

  it("getDay et getDayMap : DaySchema et DayMapSchema valides, positions lues dans le programme", async () => {
    const programme = programmeDeTest();
    const adapter = createPrototypeAdapter({ programmes: source(programme), relecteurs: { trajets: createRelecteurSimule() } });
    const day = await adapter.getDay(ctx, TRIP_ID, 1);
    expect(DaySchema.safeParse(day).success).toBe(true);
    expect(await adapter.getDay(ctx, TRIP_ID, 9)).toBeNull();
    const map = await adapter.getDayMap(ctx, TRIP_ID, 1);
    expect(DayMapSchema.safeParse(map).success).toBe(true);
    const logement = programme.positions[programme.terminus[0]!.depart]!;
    expect(map!.points[0]).toEqual({ ref: { type: "terminus", role: "start" }, lat: logement.lat, lng: logement.lng });
    const etape = programme.positions["SENTINELLE_PLACE_ID_1"]!;
    expect(map!.points).toContainEqual({ ref: { type: "stop", stopId: "j1-a1" }, lat: etape.lat, lng: etape.lng });
    const all = await adapter.getTripMap(ctx, TRIP_ID);
    expect(all.map((carte) => carte.dayIndex)).toEqual([1, 2]);
  });

  it("listTrips : résumé sans relecture", async () => {
    const relecteur = createRelecteurSimule();
    const adapter = createPrototypeAdapter({ programmes: source(), relecteurs: { trajets: relecteur } });
    const summaries = await adapter.listTrips(ctx);
    expect(summaries).toHaveLength(1);
    expect(TripSummarySchema.safeParse(summaries[0]).success).toBe(true);
    expect(summaries[0]).toMatchObject({ id: TRIP_ID, dayCount: 2, toReserveCount: 0 });
    expect(relecteur.appels()).toBe(0);
  });

  it("detour : gardé avec une durée relue de 25 min, omis à 15 min, ProposalSchema valide dans les deux cas", async () => {
    for (const [minutes, garde] of [
      [25, true],
      [15, false],
    ] as const) {
      const adapter = createPrototypeAdapter({
        programmes: source(),
        relecteurs: { trajets: createRelecteurSimule({ minutes: () => minutes }) },
      });
      const proposals = await adapter.listProposals(ctx, TRIP_ID);
      expect(proposals.length).toBeGreaterThan(0);
      for (const proposal of proposals) {
        expect(ProposalSchema.safeParse(proposal).success).toBe(true);
        expect(proposal.travelFromPrevious).toEqual({ mode: expect.any(String), minutes, estimated: false });
        expect(proposal.detour !== undefined).toBe(garde);
      }
    }
  });

  it("trajet d'une proposition : depuis le lieu qui précède son étape dans la journée", async () => {
    const paires: PaireRelecture[][] = [];
    const adapter = createPrototypeAdapter({
      programmes: source(),
      relecteurs: {
        trajets: {
          relireJournee: async (demande) => {
            paires.push([...demande]);
            return { ok: true, minutes: demande.map(() => 5) };
          },
        },
      },
    });
    await adapter.listProposals(ctx, TRIP_ID);
    expect(paires[0]![0]).toEqual({ origine: "SENTINELLE_PLACE_ID_LOGEMENT", destination: "SENTINELLE_PLACE_ID_1", mode: "walk" });
    expect(paires[0]![1]).toEqual({ origine: "SENTINELLE_PLACE_ID_1", destination: "SENTINELLE_PLACE_ID_2", mode: "walk" });
  });
});

describe("adaptateurs: prototype ne renvoie rien pour une autre organisation", () => {
  it("getTrip, getDay, listProposals, getDayMap, getTripMap et listTrips", async () => {
    const relecteur = createRelecteurSimule();
    const adapter = createPrototypeAdapter({ programmes: source(), relecteurs: { trajets: relecteur } });
    const autre = { organizationId: "mock_org_edimbourg", userId: "user_test", role: "owner" as const };
    expect(await adapter.getTrip(autre, TRIP_ID)).toBeNull();
    expect(await adapter.getDay(autre, TRIP_ID, 1)).toBeNull();
    expect(await adapter.listProposals(autre, TRIP_ID)).toEqual([]);
    expect(await adapter.getDayMap(autre, TRIP_ID, 1)).toBeNull();
    expect(await adapter.getTripMap(autre, TRIP_ID)).toEqual([]);
    expect(await adapter.listTrips(autre)).toEqual([]);
    expect(relecteur.appels()).toBe(0);
  });

  it("identifiant mal formé : null sans lecture", async () => {
    const lire = vi.fn(async () => null);
    const adapter = createPrototypeAdapter({
      programmes: { ids: async () => [], lire },
      relecteurs: { trajets: createRelecteurSimule() },
    });
    expect(await adapter.getTrip(ctx, "../x")).toBeNull();
    expect(lire).not.toHaveBeenCalled();
  });
});

describe("adaptateurs: prototype n'écrit aucune relecture Google", () => {
  it("deux requêtes successives rappellent le relecteur simulé (une relecture par journée)", async () => {
    const relecteur = createRelecteurSimule();
    const adapter = createPrototypeAdapter({ programmes: source(), relecteurs: { trajets: relecteur } });
    await adapter.getTrip(ctx, TRIP_ID);
    expect(relecteur.appels()).toBe(2);
    await adapter.getTrip(ctx, TRIP_ID);
    expect(relecteur.appels()).toBe(4);
    await adapter.getDay(ctx, TRIP_ID, 1);
    expect(relecteur.appels()).toBe(5);
  });
});

describe("adaptateurs: relecture en échec ou quota Google atteint, état d'erreur et aucune durée inventée", () => {
  it.each(["quota_reached", "unavailable"] as const)("refus %s : erreur fermée, aucune sortie", async (refus) => {
    const adapter = createPrototypeAdapter({
      programmes: source(),
      relecteurs: { trajets: createRelecteurSimule({ refus }) },
    });
    await expect(adapter.getTrip(ctx, TRIP_ID)).rejects.toThrow(RelectureError);
    await expect(adapter.getDay(ctx, TRIP_ID, 1)).rejects.toThrow(new RegExp(refus));
    await expect(adapter.listProposals(ctx, TRIP_ID)).rejects.toThrow(RelectureError);
  });

  it.each<[string, number[]]>([
    ["trop peu de durées", [1]],
    ["durée négative", [-1, 1, 1, 1, 1]],
    ["durée non entière", [1.5, 1, 1, 1, 1]],
  ])("réponse invalide (%s) : erreur, jamais corrigée", async (_cas, minutes) => {
    const adapter = createPrototypeAdapter({
      programmes: source(),
      relecteurs: { trajets: { relireJournee: async () => ({ ok: true, minutes }) } },
    });
    await expect(adapter.getDay(ctx, TRIP_ID, 1)).rejects.toThrow(/invalid_response/);
  });

  it("le message d'erreur ne contient aucun identifiant de lieu", async () => {
    const adapter = createPrototypeAdapter({
      programmes: source(),
      relecteurs: { trajets: createRelecteurSimule({ refus: "quota_reached" }) },
    });
    const erreur = await adapter.getTrip(ctx, TRIP_ID).catch((e: unknown) => e);
    expect(String((erreur as Error).message)).not.toMatch(/SENTINELLE/);
  });
});

describe("adaptateurs: le chargeur lit le dossier injecté", () => {
  it("programme de test servi depuis prototype/programmes-test", async () => {
    const adapter = createPrototypeAdapter({
      programmes: createProgrammeLoader({ dossier: DOSSIER_TEST }),
      relecteurs: { trajets: createRelecteurSimule() },
    });
    expect((await adapter.listTrips(ctx)).map((trip) => trip.id)).toEqual([TRIP_ID]);
    expect(TripSchema.safeParse(await adapter.getTrip(ctx, TRIP_ID)).success).toBe(true);
  });
});

/** Fichiers du prototype côté application (décision 0032 § A6.5). */
function fichiersPrototype(): string[] {
  const adapters = readdirSync(join(ROOT, "src", "adapters"))
    .filter((nom) => /^prototype.*\.ts$/.test(nom) && !nom.endsWith(".test.ts"))
    .map((nom) => join(ROOT, "src", "adapters", nom));
  const prototype = readdirSync(join(ROOT, "src", "prototype"))
    .filter((nom) => nom.endsWith(".ts") && !nom.endsWith(".test.ts"))
    .map((nom) => join(ROOT, "src", "prototype", nom));
  return [
    ...adapters,
    ...prototype,
    join(ROOT, "src", "mocks", "prototype-relecteur.ts"),
    join(ROOT, "src", "app", "dev", "api", "prototype", "relectures", "route.ts"),
  ];
}

/** Fichiers de `src/app` (pages, routes, mises en page) servis par l'adaptateur. */
function fichiersApp(): string[] {
  return readdirSync(join(ROOT, "src", "app"), { recursive: true, encoding: "utf8" })
    .filter((fichier) => /(^|[\\/])(page|route|layout)\.tsx?$/.test(fichier))
    .map((fichier) => join(ROOT, "src", "app", fichier));
}

const lireCode = (fichier: string) => readFileSync(fichier, "utf8");

describe("adaptateurs: prototype sans cache", () => {
  it("aucun unstable_cache, « use cache », cacheLife, cacheTag ni revalidate positif dans les fichiers du prototype et de src/app", () => {
    const interdits = [/unstable_cache/, /["']use cache["']/, /\bcacheLife\b/, /\bcacheTag\b/, /revalidate\s*[:=]\s*[1-9]/];
    const fautifs = [...fichiersPrototype(), ...fichiersApp()].flatMap((fichier) =>
      interdits.filter((motif) => motif.test(lireCode(fichier))).map((motif) => `${relative(ROOT, fichier)} : ${motif}`),
    );
    expect(fautifs).toEqual([]);
  });

  // Décision 0032 § A6.2 : seuls `src/app/layout.tsx` et `src/app/voyages/layout.tsx` n'exportaient pas la constante.
  // Depuis F8a (après 0032), l'écran 1 de la création et son layout non plus : pages statiques, sans lecture de
  // données. Liste fermée : une nouvelle page sans l'export fait échouer le test ; un fichier de la liste ne lit
  // aucune donnée (ni `@/adapters`, ni chargeur de `src/features`). F10b ajoute la page de repli hors ligne,
  // rendue statiquement à la construction sans aucune donnée (`force-static`, F10-TL-4).
  const SANS_EXPORT = [
    "src/app/(creation)/layout.tsx",
    "src/app/(creation)/voyages/nouveau/page.tsx",
    "src/app/hors-ligne/page.tsx",
    "src/app/layout.tsx",
    "src/app/voyages/layout.tsx",
  ];

  it("chaque page, route et layout de src/app exporte dynamic = force-dynamic, sauf une liste fermée qui ne lit aucune donnée", () => {
    const exportDynamique = /export const dynamic = "force-dynamic";/;
    const lecture = /@\/adapters|@\/features\/[^"']*\/(load|unlock-load|screens|screen-[a-z]+)["']/;
    const fichiers = fichiersApp().map((fichier) => relative(ROOT, fichier).split(sep).join("/"));
    expect(fichiers.length).toBeGreaterThan(10);
    const sansExport = fichiers.filter((fichier) => !exportDynamique.test(lireCode(join(ROOT, fichier))));
    expect(sansExport.sort()).toEqual(SANS_EXPORT);
    for (const fichier of sansExport) expect(lireCode(join(ROOT, fichier)), fichier).not.toMatch(lecture);
  });

  it("next.config.ts n'active ni cacheComponents ni le prérendu partiel", () => {
    const config = lireCode(join(ROOT, "next.config.ts"));
    expect(config).not.toMatch(/cacheComponents|\bppr\b/);
  });
});

describe("adaptateurs: P0b1 n'appelle jamais Google", () => {
  it("aucun hôte googleapis.com, aucun fetch, aucune lecture de GOOGLE_MAPS_SERVER_KEY ni d'OPENROUTER_API_KEY", () => {
    const fautifs = fichiersPrototype().flatMap((fichier) => {
      const code = lireCode(fichier);
      return [/googleapis\.com/, /GOOGLE_MAPS_SERVER_KEY/, /OPENROUTER_API_KEY/, /\bfetch\s*\(/, /XMLHttpRequest|WebSocket/]
        .filter((motif) => motif.test(code))
        .map((motif) => `${relative(ROOT, fichier)} : ${motif}`);
    });
    expect(fautifs).toEqual([]);
  });
});

describe("adaptateurs: répertoire de programmes vide ou absent", () => {
  it("dossier absent : aucun voyage, sans erreur", async () => {
    const adapter = createPrototypeAdapter({
      programmes: createProgrammeLoader({ dossier: join(realpathSync(DOSSIER_TEST), "absent") }),
      relecteurs: { trajets: createRelecteurSimule() },
    });
    expect(await adapter.listTrips(ctx)).toEqual([]);
    expect(await adapter.getTrip(ctx, TRIP_ID)).toBeNull();
  });
});
