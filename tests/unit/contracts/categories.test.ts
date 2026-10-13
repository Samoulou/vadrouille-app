// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import * as contracts from "@/contracts";

import { DERIVED_STORAGE_SCHEMAS, EXCLUDED_CONTRACTS, type ExcludedContract } from "./exclusions";

/*
 * Test permanent du critère § 5 de B0 (décision 0037, B2-TL-5 ; spécification B2, § 5) : chaque champ de chaque
 * schéma objet ou union discriminée exporté par `src/contracts/index.ts` a exactement une ligne, et une seule
 * catégorie, dans le tableau du handover back-end § 5 ou dans celui du point 5 de la décision 0011.
 *
 * Notation (critère § 5 de B0) : `Contrat.champ` ; objet imbriqué non exporté déballé (`Trip.travellers.adults`) ;
 * union discriminée `Contrat[variante].champ` ; champ qui référence un autre contrat exporté : une ligne, sans
 * descente ; schéma exporté qui n'est ni objet ni union discriminée : aucune ligne.
 */

const ROOT = join(__dirname, "..", "..", "..");
const CATEGORIES = ["stocké", "chargé à la demande", "calculé"] as const;

/** Bases non raffinées : comptées sous le nom de leur schéma public (0037). */
const BASES: Record<string, string> = { TripBase: "Trip", ProposalBase: "Proposal" };

// --- Formes Zod --------------------------------------------------------------------------------------------------

type Schema = z.ZodType;
type Def = { type: string; innerType?: Schema; element?: Schema; discriminator?: string; options?: Schema[]; values?: unknown[] };

const defOf = (schema: Schema): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;
const isSchema = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && "_zod" in value && "parse" in value;
const shapeOf = (schema: Schema): Record<string, Schema> => (schema as unknown as { shape: Record<string, Schema> }).shape;

const WRAPPERS = new Set(["optional", "nullable", "nonoptional", "default", "prefault", "readonly", "catch"]);

/** Retire les enveloppes `optional`, `nullable`… (les raffinements de Zod 4 ne sont pas des enveloppes). */
function unwrap(schema: Schema): Schema {
  let current = schema;
  while (WRAPPERS.has(defOf(current).type)) current = defOf(current).innerType as Schema;
  return current;
}

const isObject = (schema: Schema): boolean => defOf(schema).type === "object";
const isDiscriminatedUnion = (schema: Schema): boolean =>
  defOf(schema).type === "union" && typeof defOf(schema).discriminator === "string";

/**
 * Même contrat « par identité d'objet après retrait des raffinements » : même instance, ou (un `.superRefine()`
 * de Zod 4 clone l'objet) mêmes clés portant les mêmes instances de champ ; pour une union, mêmes variantes.
 */
function sameContract(a: Schema, b: Schema): boolean {
  if (a === b) return true;
  if (isObject(a) && isObject(b)) {
    const sa = shapeOf(a);
    const sb = shapeOf(b);
    const ka = Object.keys(sa);
    return ka.length === Object.keys(sb).length && ka.every((k) => sa[k] === sb[k]);
  }
  if (isDiscriminatedUnion(a) && isDiscriminatedUnion(b)) {
    const oa = defOf(a).options as Schema[];
    const ob = defOf(b).options as Schema[];
    return defOf(a).discriminator === defOf(b).discriminator && oa.length === ob.length && oa.every((o, i) => sameContract(o, ob[i] as Schema));
  }
  return false;
}

/** Schémas exportés, nommés sans le suffixe `Schema`. */
function exportedSchemas(module: Record<string, unknown>): Map<string, Schema> {
  const out = new Map<string, Schema>();
  for (const [name, value] of Object.entries(module)) {
    if (name.endsWith("Schema") && isSchema(value)) out.set(name.slice(0, -"Schema".length), value);
  }
  return out;
}

/** Nom du contrat exporté que désigne ce sous-schéma, base comptée sous son schéma public. */
function contractOf(schema: Schema, exported: Map<string, Schema>): string | undefined {
  for (const [name, candidate] of exported) {
    if ((isObject(schema) || isDiscriminatedUnion(schema)) && sameContract(schema, candidate)) return BASES[name] ?? name;
  }
  return undefined;
}

/** Clés (ensemble A) d'un contrat : une par feuille, dans la notation du critère § 5 de B0. */
function keysOf(name: string, schema: Schema, exported: Map<string, Schema>): string[] {
  const keys: string[] = [];
  const walkObject = (prefix: string, object: Schema) => {
    for (const [field, raw] of Object.entries(shapeOf(object))) {
      const path = `${prefix}.${field}`;
      const core = unwrap(raw);
      const isArray = defOf(core).type === "array";
      const target = isArray ? unwrap(defOf(core).element as Schema) : core;
      if (contractOf(target, exported) !== undefined) {
        keys.push(path);
      } else if (isObject(target) || isDiscriminatedUnion(target)) {
        if (isArray) throw new Error(`${path} : tableau d'objets non exportés, sans notation ; exporter l'objet`);
        if (isDiscriminatedUnion(target)) throw new Error(`${path} : union non exportée, sans notation ; l'exporter`);
        walkObject(path, target);
      } else {
        keys.push(path);
      }
    }
  };
  if (isObject(schema)) {
    walkObject(name, schema);
  } else if (isDiscriminatedUnion(schema)) {
    const discriminator = defOf(schema).discriminator as string;
    for (const option of defOf(schema).options as Schema[]) {
      const values = defOf(unwrap(shapeOf(option)[discriminator] as Schema)).values ?? [];
      for (const value of values) walkObject(`${name}[${String(value)}]`, option);
    }
  }
  return keys;
}

/**
 * Ensemble A : clés de tous les contrats objet ou union exportés, bases comptées sous leur schéma public ; un contrat
 * exclu n'est pas parcouru (ses clés seraient retirées de toute façon).
 */
function codeKeys(exported: Map<string, Schema>, excluded: ReadonlySet<string> = new Set()): string[] {
  const keys: string[] = [];
  for (const [name, schema] of exported) {
    if (name in BASES || excluded.has(name)) continue;
    keys.push(...keysOf(name, schema, exported));
  }
  return keys;
}

// --- Document ----------------------------------------------------------------------------------------------------

interface DocRow {
  key: string;
  category: string;
  source: string;
  /** Première cellule brute : elle ne doit porter qu'une clé. */
  cell: string;
}

const cells = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());

/** Lignes d'un tableau `| \`clé\` | catégorie | … |` entre deux bornes. */
function tableRows(lines: string[], source: string): DocRow[] {
  const rows: DocRow[] = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const [first, second] = cells(line);
    if (first === undefined || second === undefined || !first.startsWith("`")) continue;
    const key = first.split("`")[1] ?? "";
    rows.push({ key, category: second, source, cell: first });
  }
  return rows;
}

function handoverSection5(markdown: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## § 5."));
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (start < 0) throw new Error("handover : section « ## § 5. » introuvable");
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Tableau du point 5 de 0011 : celui dont l'en-tête est « Champ | Catégorie | Règle ». */
function decision0011Table(markdown: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith("|") && cells(l).join("|") === "Champ|Catégorie|Règle");
  if (start < 0) throw new Error("0011 : tableau « Champ | Catégorie | Règle » introuvable");
  const out: string[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    out.push(line);
  }
  return out;
}

/** Catégories nommées dans une cellule. */
function categoriesOf(cell: string): string[] {
  return CATEGORIES.filter((c) => new RegExp(`(^|[^\\p{L}])${c}([^\\p{L}]|$)`, "u").test(cell));
}

/** Une cellule de clé valide porte exactement une clé entre accents graves, et rien d'autre (critère § 5 de B0). */
const singleKey = (cell: string): boolean => /^`[^`]+`$/.test(cell);

/** Une cellule valide commence par exactement une catégorie et n'en nomme pas d'autre. */
const singleCategory = (cell: string): boolean =>
  categoriesOf(cell).length === 1 && cell.startsWith(categoriesOf(cell)[0] as string);

/** Lignes du tableau « Contrats à créer » (handover § 4) : contrat → colonne « Tâche ». */
function contractsToCreate(markdown: string): Map<string, string> {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith("### Contrats à créer"));
  const out = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (!line.startsWith("| `")) continue;
    const row = cells(line);
    out.set((row[0] ?? "").split("`")[1] ?? "", row[2] ?? "");
  }
  return out;
}

// --- Vérifications -----------------------------------------------------------------------------------------------

/** Erreurs d'une liste d'exclusions temporaires (tâche absente, B2, hors de la ligne, ou contrat non exporté). */
function exclusionErrors(entries: ExcludedContract[], exported: Map<string, Schema>, toCreate: Map<string, string>): string[] {
  const errors: string[] = [];
  for (const { contract, task } of entries) {
    if (!exported.has(contract)) errors.push(`${contract} : contrat absent des exports`);
    if (!task) {
      errors.push(`${contract} : exclusion sans tâche`);
      continue;
    }
    if (task === "B2") errors.push(`${contract} : B2 ne peut pas se reporter à elle-même`);
    const column = toCreate.get(contract);
    if (column === undefined) errors.push(`${contract} : aucune ligne dans « Contrats à créer »`);
    else if (!new RegExp(`(^|[^\\w])${task}([^\\w]|$)`).test(column)) errors.push(`${contract} : ${task} absente de « ${column} »`);
  }
  return errors;
}

const prefixOf = (key: string): string => key.split(/[.[]/)[0] ?? key;

function compare(codeSet: string[], doc: DocRow[], excluded: Set<string>) {
  const a = new Set(codeSet.filter((k) => !excluded.has(prefixOf(k))));
  const rows = doc.filter((r) => !excluded.has(prefixOf(r.key)));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) duplicates.push(row.key);
    seen.add(row.key);
  }
  return {
    missingFromTable: [...a].filter((k) => !seen.has(k)).sort(),
    extraInTable: [...seen].filter((k) => !a.has(k)).sort(),
    duplicates,
    multipleCategories: rows
      .filter((r) => !singleCategory(r.category))
      .map((r) => `${r.key} (${r.source}) : « ${r.category} »`),
    multipleKeys: rows.filter((r) => !singleKey(r.cell)).map((r) => `${r.key} (${r.source}) : « ${r.cell} »`),
  };
}

// --- Tests -------------------------------------------------------------------------------------------------------

describe("tableau des champs (handover § 5, décision 0011 point 5)", () => {
  const exported = exportedSchemas(contracts as Record<string, unknown>);
  const handover = readFileSync(join(ROOT, "docs", "handovers", "backend.md"), "utf8");
  const decisionsDir = join(ROOT, "docs", "decisions");
  const file0011 = readdirSync(decisionsDir).find((f) => f.startsWith("0011-"));
  if (!file0011) throw new Error("décision 0011 introuvable");
  const decision = readFileSync(join(decisionsDir, file0011), "utf8");

  it("contrats: chaque champ a une seule catégorie", () => {
    // Bases : mêmes clés que le schéma public.
    for (const [base, pub] of Object.entries(BASES)) {
      const b = exported.get(base);
      const p = exported.get(pub);
      expect(b && p, `${base} et ${pub} exportés`).toBeTruthy();
      expect(Object.keys(shapeOf(b as Schema)).sort()).toEqual(Object.keys(shapeOf(p as Schema)).sort());
      expect(contractOf(p as Schema, exported)).toBe(pub);
    }

    expect(exclusionErrors(EXCLUDED_CONTRACTS, exported, contractsToCreate(handover))).toEqual([]);
    for (const { contract, source } of DERIVED_STORAGE_SCHEMAS) {
      expect(exported.has(contract), contract).toBe(true);
      expect(exported.has(source), source).toBe(true);
    }

    const excluded = new Set([...EXCLUDED_CONTRACTS.map((e) => e.contract), ...DERIVED_STORAGE_SCHEMAS.map((e) => e.contract)]);
    const doc = [...tableRows(handoverSection5(handover), "handover § 5"), ...tableRows(decision0011Table(decision), "0011")];
    expect(tableRows(decision0011Table(decision), "0011")).toHaveLength(7);

    const result = compare(codeKeys(exported, excluded), doc, excluded);
    expect(result).toEqual({ missingFromTable: [], extraInTable: [], duplicates: [], multipleCategories: [], multipleKeys: [] });
  });

  it("le parcours suit la notation du critère § 5 (schémas de test)", () => {
    const Ref = z.strictObject({ a: z.string() });
    const Union = z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("x"), n: z.number() }),
      z.strictObject({ type: z.literal("y") }),
    ]);
    const X = z
      .strictObject({
        nested: z.strictObject({ a: z.strictObject({ b: z.string() }) }).optional(),
        ref: Ref.superRefine(() => undefined).optional(),
        refs: z.array(Ref),
        union: Union,
        leaf: z.number().nullable(),
      })
      .superRefine(() => undefined);
    const exportedTest = new Map<string, Schema>([
      ["X", X],
      ["Ref", Ref],
      ["Union", Union],
    ]);
    expect(codeKeys(exportedTest).sort()).toEqual(
      ["Ref.a", "Union[x].type", "Union[x].n", "Union[y].type", "X.leaf", "X.nested.a.b", "X.ref", "X.refs", "X.union"].sort(),
    );

    const Bad = z.strictObject({ list: z.array(z.strictObject({ v: z.string() })) });
    expect(() => codeKeys(new Map([["Bad", Bad]]))).toThrow(/Bad\.list/);
  });

  it("une exclusion sans tâche, avec B2 ou hors de sa ligne échoue", () => {
    const toCreate = new Map([["TripSummary", "F11 ; complété par B6"]]);
    const ok = exclusionErrors([{ contract: "TripSummary", task: "B6", reason: "" }], exported, toCreate);
    expect(ok).toEqual([]);
    expect(exclusionErrors([{ contract: "TripSummary", task: "B2", reason: "" }], exported, toCreate)).not.toEqual([]);
    expect(exclusionErrors([{ contract: "TripSummary", task: "", reason: "" }], exported, toCreate)).not.toEqual([]);
    expect(exclusionErrors([{ contract: "TripSummary", task: "B12", reason: "" }], exported, toCreate)).not.toEqual([]);
    expect(exclusionErrors([{ contract: "Inconnu", task: "B6", reason: "" }], exported, toCreate)).not.toEqual([]);
  });

  it("une cellule à deux clés, ou qui ajoute du texte à sa clé, est signalée", () => {
    expect(singleKey("`Trip.id`")).toBe(true);
    expect(singleKey("`Trip.id`, `Trip.title`")).toBe(false);
    expect(singleKey("`Trip.id` et `Trip.title`")).toBe(false);
    expect(singleKey("`Trip.id` (voir 0011)")).toBe(false);
    const rows = tableRows(["| `Trip.id`, `Trip.title` | stocké | … |"], "test");
    expect(compare(["Trip.id"], rows, new Set()).multipleKeys).toEqual(["Trip.id (test) : « `Trip.id`, `Trip.title` »"]);
  });

  it("une cellule à deux catégories ou sans catégorie en tête est signalée", () => {
    expect(singleCategory("stocké, sans `toConfirm`")).toBe(true);
    expect(singleCategory("chargé à la demande")).toBe(true);
    expect(singleCategory("stocké ou calculé")).toBe(false);
    expect(singleCategory("à voir")).toBe(false);
    expect(singleCategory("voir calculé")).toBe(false);
  });
});
