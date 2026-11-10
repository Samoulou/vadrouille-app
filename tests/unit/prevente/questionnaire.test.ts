// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREVENTE_MOTIFS, PREVENTE_PROVENANCES, type PreventeReponse, type PreventeVerdictReponse } from "@/contracts/prevente-mesure";
import { RATE_LIMITS } from "@/server/config/limites";
import { ACTION_LIMITEUR_QUESTIONNAIRE, envoyerQuestionnaire, type DependancesQuestionnaire } from "@/server/prevente/questionnaire";
import { creerReponsesPrevente, REQUETE_ENREGISTRER_REPONSE } from "@/server/prevente/reponses";

/**
 * Envoi du questionnaire de la prévente, cas d'usage (spécification `specs/C2-prevente-mesure.md`, § 3.2 point 6, § 3.3 et
 * § 3.4 ; tâche C2c, ticket 1137 ; décision 0177 § 4 à § 8 et § 11 ; critères C1 à C8, C10 et C11). Dépendances
 * injectées, base absente : ouverture, limiteur et écriture sont des doubles ; le **journal est le vrai**, capturé à la
 * sortie. La redirection (C9) est éprouvée par `src/server/actions/prevente-questionnaire.test.ts` ; le limiteur réel et
 * la fonction d'écriture, sur la base, par `tests/db/prevente-reponses.test.ts`.
 */

const ouverture = vi.hoisted(() => ({ prevente: null as object | null, questionnaire: false, lectures: 0 }));
const limiteurReel = vi.hoisted(() => ({ appels: [] as unknown[], ok: true }));

vi.mock("@/adapters", () => ({
  getPrevente: () => {
    ouverture.lectures += 1;
    return ouverture.prevente;
  },
  questionnairePreventeDisponible: () => {
    ouverture.lectures += 1;
    return ouverture.questionnaire;
  },
}));

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: async (requete: unknown) => {
    limiteurReel.appels.push(requete);
    return limiteurReel.ok ? { ok: true, value: undefined } : { ok: false, error: { code: "rate_limited", retryable: true } };
  },
}));

/** Valeurs qui ne doivent paraître dans aucun journal (C10). */
const DESTINATION = `Ville${randomBytes(6).toString("hex")}`;
const ADRESSE = "203.0.113.77";
const REFERENT = `https://exemple.test/fil/${randomBytes(4).toString("hex")}?src=reddit&apres=rien`;
const AGENT = `Navigateur/${randomBytes(4).toString("hex")}`;
const ENTETES = () => new Headers({ "x-vercel-forwarded-for": ADRESSE, "x-forwarded-for": ADRESSE, referer: REFERENT, "user-agent": AGENT, cookie: "session=abc" });

type Champs = Record<string, string | readonly string[]>;

function formulaire(champs: Champs): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (typeof valeur === "string") donnees.append(cle, valeur);
    else for (const v of valeur) donnees.append(cle, v);
  }
  return donnees;
}

const VALIDE: Champs = {
  src: "forum",
  parcours: "precommande",
  destination: `  ${DESTINATION} \n`,
  periode: "paques",
  preparation: ["assistant", "agence"],
  motifs: ["prix", "demonstration"],
  decouverte: "ami",
};
const SAISIE = { destination: DESTINATION, periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" };

type Banc = {
  dependances: Partial<DependancesQuestionnaire>;
  appels: { ouvert: number; limiteur: unknown[]; ecritures: PreventeReponse[] };
};

function banc(
  options: { ouvert?: boolean; limiteur?: boolean | Error; ecriture?: PreventeVerdictReponse | Error | (() => Promise<PreventeVerdictReponse>) } = {},
): Banc {
  const appels: Banc["appels"] = { ouvert: 0, limiteur: [], ecritures: [] };
  const { limiteur = true, ecriture = "admise" } = options;
  return {
    appels,
    dependances: {
      ouvert: () => {
        appels.ouvert += 1;
        return options.ouvert ?? true;
      },
      limiteur: async (entetes) => {
        appels.limiteur.push(entetes);
        if (limiteur instanceof Error) throw limiteur;
        return limiteur;
      },
      enregistrer: async (reponse) => {
        appels.ecritures.push(reponse);
        if (ecriture instanceof Error) throw ecriture;
        return typeof ecriture === "function" ? ecriture() : ecriture;
      },
    },
  };
}

let journal: string[];

beforeEach(() => {
  journal = [];
  ouverture.prevente = null;
  ouverture.questionnaire = false;
  ouverture.lectures = 0;
  limiteurReel.appels = [];
  limiteurReel.ok = true;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void journal.push(args.map(String).join(" ")));
});

afterEach(() => {
  // C10, sur chaque cas de ce fichier : ni le texte de la question 1, ni l'adresse, ni un en-tête.
  const sortie = journal.join("\n");
  for (const interdit of [DESTINATION, ADRESSE, REFERENT, AGENT, "exemple.test", "session=abc"]) expect(sortie).not.toContain(interdit);
  vi.restoreAllMocks();
});

const evenements = () => journal.map((ligne) => JSON.parse(ligne) as Record<string, unknown>);

describe("C1, C11 — envoi valide", () => {
  it("l'écriture reçoit la provenance, le parcours et les codes des champs cachés et des questions ; l'envoi est accepté", async () => {
    const b = banc();
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances)).toEqual({ statut: "envoyee" });
    expect(b.appels.ecritures).toEqual([{ src: "forum", parcours: "precommande", ...SAISIE }]);
    expect(b.appels.limiteur).toHaveLength(1);
    expect(journal).toEqual([]);
  });

  it("C11 — sans Referer ni paramètre d'adresse : forum et precommande sont gardés ; un Referer contraire n'est pas lu", async () => {
    const sans = banc();
    await envoyerQuestionnaire(formulaire(VALIDE), new Headers(), sans.dependances);
    const avec = banc();
    await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), avec.dependances);
    for (const b of [sans, avec]) expect(b.appels.ecritures.map(({ src, parcours }) => ({ src, parcours }))).toEqual([{ src: "forum", parcours: "precommande" }]);
  });

  it("les en-têtes ne sont lus par le cas d'usage à aucun moment : ils ne sont que transmis au limiteur", async () => {
    const lus: string[] = [];
    const entetes = { get: (nom: string) => (lus.push(nom), null) };
    const b = banc();
    expect(await envoyerQuestionnaire(formulaire(VALIDE), entetes, b.dependances)).toEqual({ statut: "envoyee" });
    expect(lus).toEqual([]);
    expect(b.appels.limiteur).toEqual([entetes]);
  });

  it("C1 — parcours visite avec ses motifs ; chaque provenance stockée est transmise telle quelle", async () => {
    for (const src of PREVENTE_PROVENANCES) {
      const b = banc();
      expect(await envoyerQuestionnaire(formulaire({ src, parcours: "visite", motifs: [...PREVENTE_MOTIFS.visite] }), ENTETES(), b.dependances)).toEqual({ statut: "envoyee" });
      expect(b.appels.ecritures).toEqual([{ src, parcours: "visite", destination: null, periode: null, preparation: [], motifs: [...PREVENTE_MOTIFS.visite], decouverte: null }]);
    }
  });

  it("questions sans réponse : période et découverte absentes ou vides valent null, listes absentes valent liste vide", async () => {
    const b = banc();
    await envoyerQuestionnaire(formulaire({ src: "direct", parcours: "visite", periode: "", decouverte: "", destination: "", preparation: ["agence"] }), ENTETES(), b.dependances);
    expect(b.appels.ecritures).toEqual([{ src: "direct", parcours: "visite", destination: null, periode: null, preparation: ["agence"], motifs: [], decouverte: null }]);
  });

  it("par défaut, le module d'écriture reçoit sept arguments par la requête constante (chaîne complète, pool simulé)", async () => {
    const requetes: [string, unknown[] | undefined][] = [];
    const reponses = creerReponsesPrevente({ creerPool: () => ({ query: async (text, values) => (requetes.push([text, values]), { rows: [{ verdict: "admise" }] }) }) });
    const b = banc();
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), { ...b.dependances, enregistrer: reponses.enregistrer })).toEqual({ statut: "envoyee" });
    expect(requetes).toEqual([[REQUETE_ENREGISTRER_REPONSE, ["forum", "precommande", DESTINATION, "paques", ["assistant", "agence"], ["prix", "demonstration"], "ami"]]]);
  });
});

describe("C2, C11 — validation_failed : ni l'écriture ni le limiteur ne sont appelés", () => {
  const fichier = () => {
    const donnees = formulaire(VALIDE);
    donnees.append("preparation", new File(["x"], "x.txt"));
    return donnees;
  };
  const fichierUnique = () => {
    const donnees = formulaire({ ...VALIDE, destination: [] });
    donnees.append("destination", new File(["x"], "x.txt"));
    return donnees;
  };

  it.each([
    ["code de période hors liste", () => formulaire({ ...VALIDE, periode: "noel" })],
    ["code de préparation hors liste", () => formulaire({ ...VALIDE, preparation: ["tarot"] })],
    ["code de préparation vide", () => formulaire({ ...VALIDE, preparation: [""] })],
    ["code de découverte hors liste", () => formulaire({ ...VALIDE, decouverte: "tele" })],
    ["clé inconnue", () => formulaire({ ...VALIDE, email: "a@exemple.test" })],
    ["clé inconnue vide", () => formulaire({ ...VALIDE, plafond: "" })],
    ["clé proche d'un champ de React", () => formulaire({ ...VALIDE, ACTION_ID: "x" })],
    ["texte de 81 caractères", () => formulaire({ ...VALIDE, destination: "x".repeat(81) })],
    ["texte de 81 caractères après nettoyage", () => formulaire({ ...VALIDE, destination: `  ${"x".repeat(81)}\n` })],
    ["texte de plus de 1 000 caractères avant nettoyage, même fait d'espaces", () => formulaire({ ...VALIDE, destination: " ".repeat(1001) })],
    ["motifs de l'autre parcours", () => formulaire({ ...VALIDE, motifs: ["pas-de-voyage"] })],
    ["motifs de l'autre parcours (visite)", () => formulaire({ ...VALIDE, parcours: "visite", motifs: ["demonstration"] })],
    ["doublon dans une liste", () => formulaire({ ...VALIDE, preparation: ["agence", "agence"] })],
    ["src hors liste (C11)", () => formulaire({ ...VALIDE, src: "inconnu-123" })],
    ["src vide", () => formulaire({ ...VALIDE, src: "" })],
    ["src absent", () => formulaire({ ...VALIDE, src: [] })],
    ["src répété", () => formulaire({ ...VALIDE, src: ["forum", "forum"] })],
    ["parcours hors liste (C11)", () => formulaire({ ...VALIDE, parcours: "paiement" })],
    ["parcours absent", () => formulaire({ ...VALIDE, parcours: [] })],
    ["parcours répété", () => formulaire({ ...VALIDE, parcours: ["precommande", "visite"] })],
    ["destination répétée", () => formulaire({ ...VALIDE, destination: ["Lisbonne", "Porto"] })],
    ["période répétée", () => formulaire({ ...VALIDE, periode: ["paques", "paques"] })],
    ["découverte répétée", () => formulaire({ ...VALIDE, decouverte: ["ami", "autre"] })],
    ["fichier dans un champ répété", fichier],
    ["fichier dans un champ à valeur unique", fichierUnique],
    ["formulaire vide", () => new FormData()],
  ])("%s", async (_nom, donnees) => {
    const b = banc();
    expect(await envoyerQuestionnaire(donnees(), ENTETES(), b.dependances)).toEqual({ statut: "validation_failed", saisie: null });
    expect(b.appels.limiteur).toEqual([]);
    expect(b.appels.ecritures).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("une clé $ACTION_ID_x (formulaire envoyé sans JavaScript) est ignorée, ainsi que $ACTION_REF_1 et $ACTION_1:0", async () => {
    const b = banc();
    const donnees = formulaire({ $ACTION_ID_4a1f: "", ...VALIDE, "$ACTION_REF_1": "", "$ACTION_1:0": '{"id":"x"}' });
    expect(await envoyerQuestionnaire(donnees, ENTETES(), b.dependances)).toEqual({ statut: "envoyee" });
    expect(b.appels.ecritures).toEqual([{ src: "forum", parcours: "precommande", ...SAISIE }]);
  });

  it("1 000 caractères avant nettoyage, 80 après : admis", async () => {
    const b = banc();
    const brut = `${" ".repeat(460)}${"x".repeat(80)}${" ".repeat(460)}`;
    expect(brut).toHaveLength(1000);
    expect(await envoyerQuestionnaire(formulaire({ ...VALIDE, destination: brut }), ENTETES(), b.dependances)).toEqual({ statut: "envoyee" });
    expect(b.appels.ecritures[0]?.destination).toBe("x".repeat(80));
  });
});

describe("C3 — question 1 : la valeur passée à l'écriture", () => {
  it.each([
    ["  Lisbonne \n", "Lisbonne"],
    ["Lisbonne\r\nPorto", "Lisbonne Porto"],
    ["Lisbonne    et\tPorto", "Lisbonne et Porto"],
  ])("%j est stocké %j", async (brut, attendu) => {
    const b = banc();
    await envoyerQuestionnaire(formulaire({ src: "forum", parcours: "visite", destination: brut }), new Headers(), b.dependances);
    expect(b.appels.ecritures.map((r) => r.destination)).toEqual([attendu]);
  });

  it("une valeur faite d'espaces est stockée absente (une autre question porte la réponse)", async () => {
    const b = banc();
    await envoyerQuestionnaire(formulaire({ src: "forum", parcours: "visite", destination: "   \n\t ", periode: "paques" }), new Headers(), b.dependances);
    expect(b.appels.ecritures).toEqual([{ src: "forum", parcours: "visite", destination: null, periode: "paques", preparation: [], motifs: [], decouverte: null }]);
  });
});

describe("C4 — réponse entièrement vide", () => {
  it.each([
    ["champs cachés seuls", { src: "forum", parcours: "visite" }],
    ["questions vides", { src: "forum", parcours: "precommande", destination: "", periode: "", decouverte: "" }],
    ["question 1 faite d'espaces", { src: "direct", parcours: "visite", destination: "  \n " }],
    ["src=interne", { src: "interne", parcours: "visite" }],
  ] as [string, Champs][])("%s : reponse_vide, ni limiteur ni écriture, aucun journal", async (_nom, champs) => {
    const b = banc();
    expect(await envoyerQuestionnaire(formulaire(champs), ENTETES(), b.dependances)).toEqual({ statut: "reponse_vide", saisie: null });
    expect(b.appels.limiteur).toEqual([]);
    expect(b.appels.ecritures).toEqual([]);
    expect(journal).toEqual([]);
  });
});

describe("C5 — src=interne", () => {
  it("accepté, limiteur appelé, écriture non appelée, aucun journal qui le distingue", async () => {
    const b = banc();
    expect(await envoyerQuestionnaire(formulaire({ ...VALIDE, src: "interne" }), ENTETES(), b.dependances)).toEqual({ statut: "envoyee" });
    expect(b.appels.limiteur).toHaveLength(1);
    expect(b.appels.ecritures).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("interne refusé par le limiteur : rate_limited, comme un autre envoi", async () => {
    const b = banc({ limiteur: false });
    expect(await envoyerQuestionnaire(formulaire({ ...VALIDE, src: "interne" }), ENTETES(), b.dependances)).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(b.appels.ecritures).toEqual([]);
  });
});

describe("C6 — limiteur", () => {
  it("limiteur qui refuse : rate_limited, saisie rendue (destination nettoyée, sans src ni parcours), écriture non appelée", async () => {
    const b = banc({ limiteur: false });
    const etat = await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances);
    expect(etat).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(Object.keys((etat as { saisie: object }).saisie).sort()).toEqual(["decouverte", "destination", "motifs", "periode", "preparation"]);
    expect(b.appels.ecritures).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("limiteur qui échoue fermé (il lève) : rate_limited, saisie rendue, écriture non appelée, rien ne remonte", async () => {
    const b = banc({ limiteur: new Error(`panne ${ADRESSE}`) });
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances)).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(b.appels.ecritures).toEqual([]);
  });

  it("limiteur qui rend autre chose que vrai : fermé", async () => {
    const b = banc();
    const etat = await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), { ...b.dependances, limiteur: async () => undefined as never });
    expect(etat).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(b.appels.ecritures).toEqual([]);
  });

  it("par défaut : checkRateLimit, action questionnaire-prevente (règle de la configuration), avec les en-têtes reçus ; son refus donne rate_limited", async () => {
    ouverture.prevente = {};
    ouverture.questionnaire = true;
    const entetes = ENTETES();
    const ecritures: PreventeReponse[] = [];
    const enregistrer = async (reponse: PreventeReponse) => (ecritures.push(reponse), "admise" as const);
    expect(ACTION_LIMITEUR_QUESTIONNAIRE).toBe("questionnaire-prevente");
    expect(Object.hasOwn(RATE_LIMITS, ACTION_LIMITEUR_QUESTIONNAIRE)).toBe(true);
    expect(await envoyerQuestionnaire(formulaire(VALIDE), entetes, { enregistrer })).toEqual({ statut: "envoyee" });
    expect(limiteurReel.appels).toEqual([{ action: "questionnaire-prevente", headers: entetes }]);
    limiteurReel.ok = false;
    expect(await envoyerQuestionnaire(formulaire(VALIDE), entetes, { enregistrer })).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(ecritures).toHaveLength(1);
  });
});

describe("C7 — plafond du jour, tenu par la base", () => {
  it("verdict plafond_atteint : rate_limited (même état que le limiteur), saisie rendue ; journal prevente.plafond_atteint sans champ", async () => {
    const plafond = banc({ ecriture: "plafond_atteint" });
    const refus = banc({ limiteur: false });
    const etat = await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), plafond.dependances);
    expect(etat).toEqual({ statut: "rate_limited", saisie: SAISIE });
    expect(evenements()).toEqual([{ level: "warn", event: "prevente.plafond_atteint" }]);
    // L'état ne dit pas lequel du limiteur ou du plafond a refusé.
    expect(etat).toEqual(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), refus.dependances));
    expect(plafond.appels.ecritures).toHaveLength(1);
  });
});

describe("C8 — l'écriture échoue : provider_error, saisie rendue, rien ne remonte", () => {
  class ErreurBase extends Error {
    override name = "DatabaseError";
    constructor(
      message: string,
      readonly code: string,
      readonly detail?: string,
    ) {
      super(message);
    }
  }
  const illisible = async () => {
    const reponses = creerReponsesPrevente({ creerPool: () => ({ query: async () => ({ rows: [{ verdict: "refusee" }] }) }) });
    return reponses.enregistrer({ src: "forum", parcours: "visite", destination: null, periode: "paques", preparation: [], motifs: [], decouverte: null });
  };

  it.each([
    ["erreur quelconque", new TypeError(`connexion perdue vers ${ADRESSE} (${DESTINATION})`), "TypeError"],
    ["42883, fonction absente (migration non appliquée)", new ErreurBase("function public.prevente_enregistrer_reponse does not exist", "42883"), "DatabaseError"],
    ["23514, contrainte de la base", new ErreurBase("réponse refusée par une contrainte de la base", "23514", `Failing row contains (${DESTINATION})`), "DatabaseError"],
    ["23502, colonne obligatoire", new ErreurBase("réponse refusée par une contrainte de la base", "23502"), "DatabaseError"],
    ["délai de 2 s", Object.assign(new Error("Query read timeout"), { name: "Error" }), "Error"],
  ] as [string, Error, string][])("%s", async (_nom, erreur, nom) => {
    const b = banc({ ecriture: erreur });
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances)).toEqual({ statut: "provider_error", saisie: SAISIE });
    expect(evenements()).toEqual([{ level: "warn", event: "prevente.reponse_perdue", errorName: nom }]);
    expect(journal.join("\n")).not.toMatch(/42883|23514|23502|contrainte|does not exist|timeout|connexion/);
  });

  it("verdict illisible lu par le module d'écriture : provider_error, nom de l'erreur seul", async () => {
    const b = banc({ ecriture: illisible });
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances)).toEqual({ statut: "provider_error", saisie: SAISIE });
    expect(evenements()).toEqual([{ level: "warn", event: "prevente.reponse_perdue", errorName: "VerdictPreventeIllisibleError" }]);
  });

  it("verdict hors contrat rendu par l'écriture : provider_error, jamais accepté", async () => {
    const b = banc({ ecriture: "refusee" as never });
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), b.dependances)).toEqual({ statut: "provider_error", saisie: SAISIE });
    expect(evenements().map((e) => e.event)).toEqual(["prevente.reponse_perdue"]);
  });

  it("une valeur levée qui n'est pas une erreur, et un journal qui lève : provider_error quand même", async () => {
    const b = banc();
    const dependances: Partial<DependancesQuestionnaire> = {
      ...b.dependances,
      enregistrer: () => Promise.reject(DESTINATION),
      journal: {
        reponsePerdue: () => {
          throw new Error("journal");
        },
        plafondAtteint: () => undefined,
      },
    };
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), dependances)).toEqual({ statut: "provider_error", saisie: SAISIE });
  });
});

describe("ordre de la décision 0177 § 6", () => {
  it("questionnaire fermé : indisponible, rien n'est lu, compté ni journalisé (même pour un envoi invalide)", async () => {
    for (const donnees of [formulaire(VALIDE), formulaire({ src: "inconnu-123" }), new FormData()]) {
      const b = banc({ ouvert: false });
      const lectures = vi.spyOn(donnees, "entries");
      expect(await envoyerQuestionnaire(donnees, ENTETES(), b.dependances)).toEqual({ statut: "indisponible", saisie: null });
      expect(lectures).not.toHaveBeenCalled();
      expect(b.appels).toEqual({ ouvert: 1, limiteur: [], ecritures: [] });
    }
    expect(journal).toEqual([]);
  });

  it("ouverture qui lève : indisponible, rien d'appelé", async () => {
    const b = banc();
    const dependances = {
      ...b.dependances,
      ouvert: () => {
        throw new Error("panne");
      },
    };
    expect(await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), dependances)).toEqual({ statut: "indisponible", saisie: null });
    expect(b.appels).toEqual({ ouvert: 0, limiteur: [], ecritures: [] });
  });

  it.each([
    ["précommande fermée", null, true],
    ["précommande fermée, questionnaire indisponible", null, false],
    ["questionnaire indisponible", {}, false],
  ])("par défaut, %s (lu par @/adapters) : indisponible, ni limiteur ni écriture", async (_nom, prevente, questionnaire) => {
    ouverture.prevente = prevente;
    ouverture.questionnaire = questionnaire;
    const ecritures: unknown[] = [];
    const etat = await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), { enregistrer: async (r) => (ecritures.push(r), "admise") });
    expect(etat).toEqual({ statut: "indisponible", saisie: null });
    expect(ouverture.lectures).toBeGreaterThanOrEqual(1);
    expect(limiteurReel.appels).toEqual([]);
    expect(ecritures).toEqual([]);
    expect(journal).toEqual([]);
  });

  it("validation avant limiteur, limiteur avant écriture : l'ordre des appels d'un envoi accepté", async () => {
    const ordre: string[] = [];
    await envoyerQuestionnaire(formulaire(VALIDE), ENTETES(), {
      ouvert: () => (ordre.push("ouvert"), true),
      limiteur: async () => (ordre.push("limiteur"), true),
      enregistrer: async () => (ordre.push("ecriture"), "admise"),
    });
    expect(ordre).toEqual(["ouvert", "limiteur", "ecriture"]);
  });
});

describe("C10 — journal capturé sur l'ensemble des cas", () => {
  it("tous les statuts joués à la suite : seuls prevente.plafond_atteint et prevente.reponse_perdue sont écrits, sans texte, adresse ni en-tête", async () => {
    const cas: [Champs, Parameters<typeof banc>[0]][] = [
      [VALIDE, {}],
      [VALIDE, { ouvert: false }],
      [{ ...VALIDE, periode: "noel" }, {}],
      [{ src: "forum", parcours: "visite" }, {}],
      [{ ...VALIDE, src: "interne" }, {}],
      [VALIDE, { limiteur: false }],
      [VALIDE, { limiteur: new Error(ADRESSE) }],
      [VALIDE, { ecriture: "plafond_atteint" }],
      [VALIDE, { ecriture: new Error(`${DESTINATION} ${ADRESSE} ${REFERENT}`) }],
    ];
    const statuts = [];
    for (const [champs, options] of cas) statuts.push((await envoyerQuestionnaire(formulaire(champs), ENTETES(), banc(options).dependances)).statut);
    expect(statuts).toEqual(["envoyee", "indisponible", "validation_failed", "reponse_vide", "envoyee", "rate_limited", "rate_limited", "rate_limited", "provider_error"]);
    expect(evenements()).toEqual([
      { level: "warn", event: "prevente.plafond_atteint" },
      { level: "warn", event: "prevente.reponse_perdue", errorName: "Error" },
    ]);
    const sortie = journal.join("\n");
    for (const interdit of [DESTINATION, ADRESSE, REFERENT, AGENT, "forum", "precommande", "paques", "assistant"]) expect(sortie).not.toContain(interdit);
  });
});
