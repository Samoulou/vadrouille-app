// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  nettoyerDestinationPrevente,
  PREVENTE_DESTINATION_BRUT_MAX,
  PREVENTE_DESTINATION_MAX,
  PREVENTE_ETAT_ENVOI_INITIAL,
  PREVENTE_MOTIFS,
  PREVENTE_PROVENANCES,
  PREVENTE_STATUTS_ENVOI,
  PreventeEnvoiSchema,
  preventeReponseVide,
  PreventeReponseSchema,
} from "@/contracts/prevente-mesure";

/**
 * Contrats de l'envoi du questionnaire de la prévente (spécification `specs/C2-prevente-mesure.md`, § 3.3 points 2 à 4 ;
 * tâche C2c, ticket 1137 ; décision 0177 § 4 et § 5 ; critères C2, C3, C4 et C11 côté contrat) : nettoyage de la question 1,
 * schéma de l'envoi, prédicat « réponse vide », statuts.
 *
 * Les caractères de contrôle et de mise en forme sont construits par leur point de code : aucun n'est écrit dans ce
 * fichier.
 */

const RACINE = path.resolve(__dirname, "../../..");
const c = (...points: number[]) => String.fromCodePoint(...points);

/** Points de code que le nettoyage change en espace, puis ceux qu'il retire (0177 § 4 point 3). */
const BLANCS_DE_CONTROLE = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029];
const plage = (debut: number, fin: number) => Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);
const RETIRES = [
  ...plage(0x00, 0x1f).filter((p) => !BLANCS_DE_CONTROLE.includes(p)),
  ...plage(0x7f, 0x9f).filter((p) => !BLANCS_DE_CONTROLE.includes(p)),
  ...plage(0x200b, 0x200f),
  ...plage(0x202a, 0x202e),
  ...plage(0x2060, 0x2064),
  ...plage(0x2066, 0x2069),
  0xfeff,
];

describe("question 1 : nettoyerDestinationPrevente", () => {
  it.each([
    ["espaces de début et de fin, saut de ligne final (C3)", "  Lisbonne \n", "Lisbonne"],
    ["valeur faite d'espaces (C3)", "     ", null],
    ["chaîne vide", "", null],
    ["blancs de contrôle seuls", "\t\r\n \n", null],
    ["saut de ligne interne", "Lisbonne\nPorto", "Lisbonne Porto"],
    ["retour chariot et saut de ligne", "Lisbonne\r\nPorto", "Lisbonne Porto"],
    ["tabulation interne", "Lisbonne\tPorto", "Lisbonne Porto"],
    ["suite d'espaces", "Lisbonne    et   Porto", "Lisbonne et Porto"],
    ["texte déjà propre", "Côte d'Azur, l'été", "Côte d'Azur, l'été"],
    ["espace insécable", `Lisbonne${c(0xa0)}${c(0xa0)}Porto`, "Lisbonne Porto"],
    ["séparateurs de ligne et de paragraphe", `Lisbonne${c(0x2028)}Porto${c(0x2029)}Faro${c(0x85)}Braga`, "Lisbonne Porto Faro Braga"],
    ["caractère nul et sonnerie retirés", `Lis${c(0x00)}bon${c(0x07)}ne`, "Lisbonne"],
    ["marques de sens d'écriture retirées", `${c(0x202e)}Lisbonne${c(0x202c)}`, "Lisbonne"],
    ["largeur nulle et marque d'ordre des octets retirées", `${c(0xfeff)}Lis${c(0x200b)}bonne${c(0x2060)}`, "Lisbonne"],
    ["mise en forme seule", `${c(0x200b)}${c(0x200e)}${c(0xfeff)}`, null],
    ["caractère hors du plan de base gardé", `Tokyo ${c(0x1f5fc)}`, `Tokyo ${c(0x1f5fc)}`],
  ] as [string, string, string | null][])("%s", (_nom, brut, attendu) => {
    expect(nettoyerDestinationPrevente(brut)).toBe(attendu);
  });

  it("chaque blanc de contrôle devient une espace ; chaque caractère de contrôle ou de mise en forme est retiré", () => {
    for (const point of BLANCS_DE_CONTROLE) expect(nettoyerDestinationPrevente(`a${c(point)}b`), point.toString(16)).toBe("a b");
    for (const point of RETIRES) expect(nettoyerDestinationPrevente(`a${c(point)}b`), point.toString(16)).toBe("ab");
  });

  it("idempotent, et ne borne pas la longueur : la borne se mesure après, par le schéma", () => {
    const long = `  ${"x".repeat(200)}  `;
    expect(nettoyerDestinationPrevente(long)).toBe("x".repeat(200));
    for (const brut of ["  Lisbonne \n", `a${c(0x2028)} ${c(0x200b)} b`, "x"]) {
      const une = nettoyerDestinationPrevente(brut);
      expect(nettoyerDestinationPrevente(une ?? "")).toBe(une);
    }
    expect(PREVENTE_DESTINATION_BRUT_MAX).toBe(1000);
  });

  it("80 caractères après nettoyage : admis ; 81 : refusé ; la longueur se mesure après le nettoyage", () => {
    const vide = { src: "direct", parcours: "visite", periode: null, preparation: [], motifs: [], decouverte: null };
    const admis = nettoyerDestinationPrevente(`  ${"x".repeat(PREVENTE_DESTINATION_MAX)} \n`);
    expect(admis).toHaveLength(80);
    expect(PreventeEnvoiSchema.safeParse({ ...vide, destination: admis }).success).toBe(true);
    expect(PreventeEnvoiSchema.safeParse({ ...vide, destination: nettoyerDestinationPrevente("x".repeat(PREVENTE_DESTINATION_MAX + 1)) }).success).toBe(false);
    // Plus strict que le `char_length` de la base hors du plan de base : 41 caractères de deux unités font 82.
    expect(PreventeEnvoiSchema.safeParse({ ...vide, destination: c(0x1f5fc).repeat(41) }).success).toBe(false);
    expect(PreventeEnvoiSchema.safeParse({ ...vide, destination: c(0x1f5fc).repeat(40) }).success).toBe(true);
  });

  describe("toute valeur rendue passe le CHECK prevente_reponses_destination_check de db/schema/prevente.ts", () => {
    /**
     * L'expression est lue dans le schéma, jamais recopiée : les deux bornes de `char_length`, et la classe de caractères
     * refusée par `!~`. Sa syntaxe (`\xHH`, `\uHHHH`, plages) est commune à Postgres et à JavaScript.
     */
    const source = readFileSync(path.join(RACINE, "db/schema/prevente.ts"), "utf8");
    const debut = source.indexOf('"prevente_reponses_destination_check"');
    const expression = source.slice(debut, source.indexOf('check("prevente_reponses_periode_check"', debut));
    const classe = /!~ '(\[[^']+\])'/.exec(expression)?.[1]?.replaceAll("\\\\", "\\");
    const interdits = new RegExp(classe ?? "(?!)", "u");
    const passeLeCheck = (valeur: string | null): boolean => {
      if (valeur === null) return true;
      const longueur = [...valeur].length;
      return longueur >= 1 && longueur <= PREVENTE_DESTINATION_MAX && valeur.replace(/^ +| +$/g, "") !== "" && !interdits.test(valeur);
    };

    it("l'expression lue est bien celle du schéma", () => {
      expect(debut).toBeGreaterThan(0);
      expect(expression).toContain("char_length(${t.destination}) BETWEEN 1 AND ${sql.raw(String(PREVENTE_DESTINATION_MAX))}");
      expect(expression).toContain("btrim(${t.destination}) <> ''");
      expect(classe).toMatch(/^\[.+\]$/);
      // La classe lue refuse bien ce que la base refuse.
      for (const point of [0x01, 0x09, 0x0a, 0x1f, 0x7f, 0x85, 0x9f, 0x200b, 0x2028, 0x2029, 0x202e, 0x2060, 0x2069, 0xfeff]) {
        expect(passeLeCheck(`a${c(point)}b`), point.toString(16)).toBe(false);
      }
      expect(passeLeCheck("Lisbonne")).toBe(true);
      expect(passeLeCheck("   ")).toBe(false);
      expect(passeLeCheck("")).toBe(false);
      expect(passeLeCheck("x".repeat(81))).toBe(false);
    });

    it("chaque caractère de U+0000 à U+FFFF, seul, entouré d'espaces ou au milieu d'un mot : la valeur rendue et admise par le schéma passe", () => {
      const ecarts: string[] = [];
      for (let point = 0; point <= 0xffff; point += 1) {
        // Les demi-codets isolés ne sont pas des caractères : un formulaire ne peut pas en envoyer.
        if (point >= 0xd800 && point <= 0xdfff) continue;
        for (const brut of [c(point), ` ${c(point)} `, `a${c(point)}b`, `${c(point)}a${c(point)}`]) {
          const rendu = nettoyerDestinationPrevente(brut);
          if (rendu !== null && rendu.length > PREVENTE_DESTINATION_MAX) continue;
          if (!passeLeCheck(rendu)) ecarts.push(point.toString(16));
        }
      }
      expect(ecarts).toEqual([]);
    });

    it("mélanges : contrôles, mises en forme, blancs et longueurs limites", () => {
      const morceaux = ["Lisbonne", " ", "\n", "\t", c(0x00), c(0x1b), c(0x85), c(0x9f), c(0xa0), c(0x200b), c(0x200f), c(0x2028), c(0x202e), c(0x2064), c(0x2069), c(0xfeff), c(0x3000), c(0x1f5fc), "é"];
      const ecarts: string[] = [];
      for (let i = 0; i < morceaux.length; i += 1) {
        for (let j = 0; j < morceaux.length; j += 1) {
          for (let k = 0; k < morceaux.length; k += 1) {
            const rendu = nettoyerDestinationPrevente(`${morceaux[i]}${morceaux[j]}${morceaux[k]}`);
            if (!passeLeCheck(rendu)) ecarts.push(`${i}-${j}-${k}`);
          }
        }
      }
      expect(ecarts).toEqual([]);
      for (const longueur of [79, 80]) expect(passeLeCheck(nettoyerDestinationPrevente(` ${"é".repeat(longueur)}${c(0x200b)} `))).toBe(true);
    });
  });
});

describe("PreventeEnvoiSchema : schéma strict de l'envoi", () => {
  const valide = { src: "forum", parcours: "precommande", destination: "Lisbonne", periode: "paques", preparation: ["assistant", "agence"], motifs: ["prix", "demonstration"], decouverte: "ami" };

  it("un envoi valide passe, pour chaque parcours avec ses motifs", () => {
    expect(PreventeEnvoiSchema.parse(valide)).toEqual(valide);
    expect(PreventeEnvoiSchema.safeParse({ ...valide, parcours: "visite", motifs: ["pas-de-voyage", "prix"] }).success).toBe(true);
  });

  it("interne est admis ici, et refusé par le schéma de la réponse stockée ; chaque provenance stockée est admise par les deux", () => {
    expect(PreventeEnvoiSchema.safeParse({ ...valide, src: "interne" }).success).toBe(true);
    expect(PreventeReponseSchema.safeParse({ ...valide, src: "interne" }).success).toBe(false);
    for (const src of PREVENTE_PROVENANCES) {
      expect(PreventeEnvoiSchema.safeParse({ ...valide, src }).success, src).toBe(true);
      expect(PreventeReponseSchema.safeParse({ ...valide, src }).success, src).toBe(true);
    }
  });

  it.each([
    ["clé inconnue", { ...valide, email: "a@exemple.test" }],
    ["provenance hors liste (C11)", { ...valide, src: "inconnu-123" }],
    ["provenance vide", { ...valide, src: "" }],
    ["provenance absente", { ...valide, src: undefined }],
    ["parcours hors liste (C11)", { ...valide, parcours: "paiement" }],
    ["parcours absent", { ...valide, parcours: undefined }],
    ["motifs de l'autre parcours (C2)", { ...valide, motifs: ["pas-de-voyage"] }],
    ["motifs de l'autre parcours, parcours visite", { ...valide, parcours: "visite", motifs: ["demonstration"] }],
    ["code de période hors liste (C2)", { ...valide, periode: "noel" }],
    ["code de préparation hors liste", { ...valide, preparation: ["tarot"] }],
    ["code de découverte hors liste", { ...valide, decouverte: "tele" }],
    ["doublon dans les préparations", { ...valide, preparation: ["agence", "agence"] }],
    ["doublon dans les motifs", { ...valide, motifs: ["prix", "prix"] }],
    ["destination vide (non nettoyée)", { ...valide, destination: "" }],
    ["destination de 81 caractères (C2)", { ...valide, destination: "x".repeat(PREVENTE_DESTINATION_MAX + 1) }],
    ["destination qui n'est pas un texte", { ...valide, destination: 12 }],
    ["liste à la place d'un code", { ...valide, periode: ["paques"] }],
    ["champ absent", { src: "forum", parcours: "visite" }],
  ])("refusé : %s", (_nom, envoi) => {
    expect(PreventeEnvoiSchema.safeParse(envoi).success).toBe(false);
  });

  it("les motifs admis sont exactement ceux du parcours", () => {
    for (const parcours of ["precommande", "visite"] as const) {
      expect(PreventeEnvoiSchema.safeParse({ ...valide, parcours, motifs: [...PREVENTE_MOTIFS[parcours]] }).success, parcours).toBe(true);
    }
  });

  it("une réponse entièrement vide passe ce schéma (l'envoi la distingue par preventeReponseVide) et reste refusée à l'écriture", () => {
    const vide = { src: "forum", parcours: "visite", destination: null, periode: null, preparation: [], motifs: [], decouverte: null };
    expect(PreventeEnvoiSchema.safeParse(vide).success).toBe(true);
    expect(PreventeReponseSchema.safeParse(vide).success).toBe(false);
  });
});

describe("preventeReponseVide", () => {
  const vide = { destination: null, periode: null, preparation: [], motifs: [], decouverte: null };

  it("aucune réponse : vide", () => {
    expect(preventeReponseVide(vide)).toBe(true);
  });

  it.each([
    ["question 1", { ...vide, destination: "Lisbonne" }],
    ["question 2", { ...vide, periode: "paques" }],
    ["question 3", { ...vide, preparation: ["agence"] }],
    ["question 4", { ...vide, motifs: ["prix"] }],
    ["question 5", { ...vide, decouverte: "ami" }],
  ])("une seule réponse suffit : %s", (_nom, reponse) => {
    expect(preventeReponseVide(reponse)).toBe(false);
    expect(PreventeReponseSchema.safeParse({ src: "direct", parcours: "visite", ...reponse }).success).toBe(true);
  });
});

describe("statuts de l'état rendu au formulaire", () => {
  it("liste fermée (décision 0177 § 5) ; état initial : attente, sans saisie", () => {
    expect([...PREVENTE_STATUTS_ENVOI]).toEqual(["attente", "validation_failed", "reponse_vide", "rate_limited", "provider_error", "indisponible"]);
    expect(PREVENTE_ETAT_ENVOI_INITIAL).toEqual({ statut: "attente", saisie: null });
  });
});
