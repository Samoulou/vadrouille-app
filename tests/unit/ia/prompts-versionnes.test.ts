// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_PROGRAMME, PROMPT_PROGRAMME_V5 } from "@/ai/prompts/programme";
import { PROMPT_QUARTIER } from "@/ai/prompts/quartier";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { PROMPT_RECHERCHE_WEB } from "@/ai/prompts/recherche-web";
import { PROMPT_REVISION } from "@/ai/prompts/revision";
import { PROMPT_STRUCTURATION } from "@/ai/prompts/structuration";

/**
 * Spécification B7a, critère `prompts: versionnés` : une empreinte SHA-256 du texte de chaque prompt est comparée à
 * cette table commitée `id → version → empreinte`. Un texte changé sans nouvelle version fait échouer le test ; une
 * nouvelle version ajoute sa ligne (l'ancienne reste, pour l'historique des mesures de P0).
 */
const EMPREINTES: Record<string, Record<number, string>> = {
  plan: {
    1: "cc60044c386a445d8a09f21383982f550a35a8dac592cc9a320b3b594da289ef",
    2: "f0c2d970b2baa4244bf956dff1d5c3b1ff9d468c2426e5ae53aaa9303af7758a",
  },
  recherche: {
    2: "5b48d1a6aa37b9e25b96737e918c9f6ab2ecc4f175d510d343bbe70a8a36b4ad",
    3: "57abff2e2bd2ce12f94d145a274c988474436ee4e88736928166a4f268654b18",
    4: "235ff9bc1a4b7ef8f59a3a680be791b8bc0d637639c2a950f47895840075d6a6",
  },
  notation: { 1: "3d65949a6a1720d74bb4173abc46346b945a1bce0b7dbc2d001689fc6716ed1b" },
  raisons: {
    1: "14d91f523c80e186228f52ab3604fb4b2490f8a8d1db0ef3b3ab90d069fe08d6",
    2: "1d40a5dcaa2e347c5f61b3e3debc479b1704a6c3ba79c6387735c1fd0a170c6e",
  },
  structuration: { 1: "e9d62fe8ce071a2c0a3f3b97dd595408eca3f62dd288e84fbcdc76aee13433be" },
  quartier: { 1: "a7d2edb04621223aa702be9058f92cadbd509aa4b3eb99e7f5bea9db7e25355b" },
  "recherche-web": { 2: "5d9657a1e8e78be1e3cfac7dacc9ce26f3667225f3ff5188158a3fe94f7fff49" },
  // Décision 0121 § 4.3 : v1 (lot 1, historique des mesures) et v2 (lot 2a, champ `site`) ; v3 (E2E-essai, lot 5, « à éviter ») ; v4 (#800).
  programme: {
    1: "7f3ac2bcbebf9331d2038fd558d4b8b2b5649fb978b5ca27c82e8b2fd0feea76",
    2: "236e304ba393a2d4504310f1898eadedda0487e638d558a0ee115d4526c30b80",
    3: "413eb5e8aacf8c0b3408e2549c7c83668aeaa337548663903c60431143579b59",
    // Ticket #800 (amendement 4) : site pour chaque lieu dès qu'un site officiel existe, journées sans allers-retours.
    4: "851f7045685335f9269630cb8e959d3ec5b12c392e8e0385af5b61c1cfa7831d",
    // M4a (ticket #920, décision 0148) : plusieurs villes, cadre des journées de changement de ville, durée estimée ;
    // coexiste avec la v4 (site d'essai et `p0Run`).
    5: "6414d3cbb7d647386426f4d24d1dca0eae35778bd28985426d56a0855d7eafd9",
  },
  // E2E-essai, lot 4 (décision 0126) : révision du programme après le tri « J'aime / Pas pour moi ».
  // v2 (ticket #800, amendement 4 de P0-programme-par-ia) : mêmes règles de site et de parcours que `programme` v4.
  revision: {
    1: "bf5355ef97edba46b6961a113476e73ae232c22399c1eed0a54501345b071fc1",
    2: "674314914e797f7e2f937b01e00fbfa1db26cf2dbb59bef09b13b371549b2254",
  },
};

const PROMPTS = [PROMPT_PLAN, PROMPT_RECHERCHE, PROMPT_NOTATION, PROMPT_RAISONS, PROMPT_STRUCTURATION, PROMPT_QUARTIER, PROMPT_RECHERCHE_WEB, PROMPT_PROGRAMME, PROMPT_REVISION];
const empreinte = (texte: string) => createHash("sha256").update(texte, "utf8").digest("hex");

describe("prompts: versionnés", () => {
  it.each(PROMPTS.map((p) => [p.id, p] as const))("%s : empreinte de la version courante égale à la table", (_id, prompt) => {
    const versions = new Map(Object.entries(Object.entries(EMPREINTES).find(([id]) => id === prompt.id)?.[1] ?? {}));
    expect(versions.get(String(prompt.version)), `${prompt.id} v${prompt.version} absent de la table`).toBeDefined();
    expect(empreinte(prompt.texte)).toBe(versions.get(String(prompt.version)));
  });

  it("chaque prompt de src/ai/prompts a sa ligne, identifiants uniques ; structuration et quartier en version 1", () => {
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
    expect(Object.keys(EMPREINTES).sort()).toEqual(PROMPTS.map((p) => p.id).sort());
    expect(PROMPT_STRUCTURATION.version).toBe(1);
    expect(PROMPT_QUARTIER.version).toBe(1);
  });

  it("programme: prompt v4 demande le site officiel, sans donnée Google (A13)", () => {
    expect(PROMPT_PROGRAMME.version).toBe(4);
    const texte = PROMPT_PROGRAMME.texte;
    // Le champ `site` est demandé, facultatif, pour le site officiel, en https sans paramètres.
    expect(texte).toContain('"site" (facultatif)');
    expect(texte).toMatch(/site officiel/);
    expect(texte).toMatch(/https complète, sans paramètres/);
    expect(texte).toMatch(/Jamais un moteur de recherche, une carte, un réseau social, un site d'avis ou de réservation tiers/);
    expect(texte).toMatch(/site 300/);
    // Seule adresse admise : `site` ; aucune adresse d'exemple réelle ni aucune donnée Google dans le texte.
    expect(texte).toMatch(/la seule adresse admise est le champ/);
    expect(texte).not.toMatch(/https?:\/\//);
    expect(texte).not.toMatch(/google|placeId|place_id/i);
  });

  it("programme: prompt v4 demande qu'aucun créneau ne relève d'une catégorie « à éviter » (E2E-essai, lot 5)", () => {
    const texte = PROMPT_PROGRAMME.texte;
    expect(texte).toContain('Si le brief porte "aEviter"');
    expect(texte).toMatch(/aucun créneau n'en relève, même un incontournable/);
    // Chaque code de catégorie est nommé, avec le libellé que la personne a coché.
    for (const code of ["museum", "walk", "nature", "tasting", "restaurant", "heritage", "market", "nightlife"]) expect(texte).toContain(`${code} = `);
  });

  it("revision: prompt v2 retire les étapes écartées, garde les aimées, sans donnée Google (E2E-essai, lot 4)", () => {
    expect(PROMPT_REVISION.version).toBe(2);
    const texte = PROMPT_REVISION.texte;
    expect(texte).toContain('"pasPourMoi"');
    expect(texte).toContain('"jAime"');
    expect(texte).toMatch(/Retire chaque étape écartée : ni ce lieu ni un lieu équivalent/);
    expect(texte).toMatch(/Garde les étapes aimées/);
    // Même forme de sortie que `programme` (relue par `lireProgramme`) et même règle « à éviter ».
    expect(texte).toContain('"jours": [{"date" (AAAA-MM-JJ)');
    expect(texte).toContain('Si le brief porte "aEviter"');
    expect(texte).not.toMatch(/https?:\/\//);
    expect(texte).not.toMatch(/google|placeId|place_id/i);
  });

  // Ticket #800 (amendement 4 de `specs/P0-programme-par-ia.md`) : mêmes règles dans les deux prompts.
  it.each([
    ["programme", PROMPT_PROGRAMME],
    ["revision", PROMPT_REVISION],
  ] as const)("%s : site demandé pour chaque lieu dès qu'un site officiel existe, mêmes interdits", (_id, prompt) => {
    const texte = prompt.texte;
    expect(texte).toMatch(/pour chaque créneau avec un lieu, donne l'adresse du site officiel dès qu'il en existe un/);
    expect(texte).toMatch(/celui de l'institution qui le gère/);
    expect(texte).toMatch(/n'invente jamais une adresse/);
    expect(texte).toMatch(/Jamais un moteur de recherche, une carte, un réseau social, un site d'avis ou de réservation tiers/);
    expect(texte).toMatch(/https complète, sans paramètres/);
    expect(texte).toContain('"quartier" (pour chaque lieu)');
    expect(texte).not.toMatch(/https?:\/\//);
  });

  it.each([
    ["programme", PROMPT_PROGRAMME],
    ["revision", PROMPT_REVISION],
  ] as const)("%s : journées sans allers-retours, sans coordonnée ni temps de trajet", (_id, prompt) => {
    const texte = prompt.texte;
    expect(texte).toMatch(/dans l'ordre d'une marche ou d'un trajet, sans revenir sur ses pas ni traverser la ville deux fois/);
    expect(texte).toMatch(/Les étapes d'un même quartier se suivent/);
    expect(texte).toMatch(/La première étape part du logement quand le brief le donne ; la dernière finit près de lui ou dans le quartier du dîner/);
    expect(texte).not.toMatch(/latitude|longitude|coordonn|\blat\b|\blng\b|minutes de trajet|google|placeId|place_id/i);
  });

  // M4a (ticket #920) : la v5 coexiste avec la v4 sous le même identifiant ; elle n'est pas dans `PROMPTS` (une ligne par
  // identifiant), son empreinte est tenue ici.
  it("programme v5 : empreinte égale à la table, même identifiant que la v4", () => {
    expect(PROMPT_PROGRAMME_V5.id).toBe(PROMPT_PROGRAMME.id);
    expect(PROMPT_PROGRAMME_V5.version).toBe(5);
    expect(empreinte(PROMPT_PROGRAMME_V5.texte)).toBe(EMPREINTES.programme?.[5]);
  });

  it("programme v5 : cadre des journées de changement de ville, durée estimée entière, aucune ville par créneau (0148, 0149)", () => {
    const texte = PROMPT_PROGRAMME_V5.texte;
    // Villes dans l'ordre et cadre de chaque changement de ville (0148 § 5.1 point 2).
    for (const champ of ['"villes"', '"changements"', '"de"', '"vers"', '"depart"', '"arrivee"', '"source"', '"saisi"', '"estime"', '"activitesMax"']) expect(texte).toContain(champ);
    expect(texte).toMatch(/Les journées d'une ville ne contiennent que des lieux de cette ville ou de ses environs/);
    expect(texte).toMatch(/toutes finies à l'heure de départ ; pendant le trajet, rien/);
    expect(texte).toMatch(/aucune étape à réserver/);
    expect(texte).toMatch(/N'écris ni le trajet, ni un créneau pour lui, ni le titre de ce jour/);
    // Durée estimée : au niveau du jour, entière, seulement pour un départ estimé (0148 § 2 ; 0149 S-M4-2).
    expect(texte).toContain('"dureeEstimeeMinutes" (nombre entier, seulement pour un changement "estime")');
    expect(texte).toMatch(/un nombre entier \(jamais un texte\)/);
    expect(texte).toMatch(/Omets ce champ si tu ne sais pas l'estimer, pour un changement "saisi" et pour toute autre journée/);
    // Aucun champ `ville` par créneau (0148 § 7.1 point 3) : ni dans la forme du créneau, ni dans les longueurs.
    const creneau = texte.split("\n").find((ligne) => ligne.startsWith("Chaque créneau"));
    expect(creneau).toBeDefined();
    expect(creneau).not.toContain('"ville"');
    expect(texte).not.toContain('"ville"');
    expect(texte).not.toMatch(/ville et quartier 60/);
    expect(texte).toMatch(/N'écris pas la ville d'un créneau/);
    // Mêmes règles que la v4 : site officiel, parcours, « à éviter » ; aucune donnée Google, aucune adresse.
    expect(texte).toMatch(/pour chaque créneau avec un lieu, donne l'adresse du site officiel dès qu'il en existe un/);
    expect(texte).toMatch(/Jamais un moteur de recherche, une carte, un réseau social, un site d'avis ou de réservation tiers/);
    expect(texte).toMatch(/Les étapes d'un même quartier se suivent/);
    expect(texte).toContain('Si le brief porte "aEviter"');
    expect(texte).toContain('"quartier" (pour chaque lieu)');
    expect(texte).not.toMatch(/https?:\/\//);
    expect(texte).not.toMatch(/google|placeId|place_id|latitude|longitude|coordonn|\blat\b|\blng\b/i);
    // Aucun libellé de billet n'est attendu dans l'entrée (0149 S-M4-1).
    expect(texte).not.toMatch(/libellé du billet|"libelle" du changement/);
  });

  it("un texte changé sans nouvelle version fait échouer la comparaison", () => {
    expect(empreinte(`${PROMPT_PLAN.texte} `)).not.toBe(EMPREINTES.plan?.[PROMPT_PLAN.version]);
  });
});
