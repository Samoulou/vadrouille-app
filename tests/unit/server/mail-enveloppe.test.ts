// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SENDER_ADDRESS } from "@/server/config/email";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { checkEnvelope, compiledEnvelope, type DonneesMessage, type EnveloppeAttendue } from "@/server/mail/enveloppe";

/**
 * Contrôle de l'enveloppe avant l'envoi (spécification B3b-envoi, point 4.3, critère E4) : `checkEnvelope` seule, avec
 * la vraie compilation de `nodemailer` 10.0.16 (aucun espion sur `MailComposer`). Adresses en `exemple.test`.
 */

const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};

/**
 * Valeur forcée dans le type de marque, **sans** `parseEmailAddress` : la spécification (critères E4 et E5) demande que
 * le test contourne la liste blanche pour montrer que le contrôle refuse seul. Réservé à ce test.
 */
const forcee = (valeur: string) => valeur as unknown as EnveloppeAttendue["to"];

const A = canonique("a@exemple.test");
const attenduA: EnveloppeAttendue = { from: SENDER_ADDRESS, to: A };

const message = (to: unknown, autres: Record<string, unknown> = {}): DonneesMessage => ({
  from: SENDER_ADDRESS,
  to,
  subject: "Ton code de connexion",
  text: "Code : 123456",
  ...autres,
});

/** Copie des données sans la clé nommée. */
const sans = (donnees: DonneesMessage, cle: string): DonneesMessage => Object.fromEntries(Object.entries(donnees).filter(([k]) => k !== cle));

describe("email: contrôle de l'enveloppe avant l'envoi", () => {
  it("adresse canonique seule → accepté, enveloppe compilée égale à l'attendu, copie contrôlée rendue", () => {
    const donnees = message("a@exemple.test");
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    const resultat = checkEnvelope(donnees, attenduA);
    expect(resultat).toEqual({ ok: true, message: { ...donnees } });
    if (!resultat.ok) throw new Error("accord attendu");
    expect("toString" in resultat.message).toBe(false);
    expect(Object.isFrozen(resultat.message)).toBe(true);
    expect(Object.keys(resultat.message).sort()).toEqual(["from", "subject", "text", "to"]);
  });

  it("objet à prototype nul de quatre chaînes → accepté", () => {
    const donnees = Object.assign(Object.create(null) as Record<string, unknown>, message("a@exemple.test"));
    expect(checkEnvelope(donnees, attenduA).ok).toBe(true);
  });

  it("a,b@exemple.test (liste blanche contournée) → refus : l'en-tête n'est pas lu comme cette adresse", () => {
    const donnees = message("a,b@exemple.test");
    const attendu = { from: SENDER_ADDRESS, to: forcee("a,b@exemple.test") };
    // Constaté sur 10.0.16 : `a` (sans @) est écarté, seul `b@exemple.test` reste ; la spécification attendait
    // `["a", "b@exemple.test"]` (formulation de E4 à corriger par le Product Owner, réponse du Tech Lead).
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["b@exemple.test"] });
    expect(compiledEnvelope(donnees)).not.toEqual({ from: SENDER_ADDRESS, to: [attendu.to] });
    expect(checkEnvelope(donnees, attendu)).toEqual({ ok: false });
  });

  it("x <a@exemple.test> → enveloppe [a@exemple.test], différente de l'attendu, refus", () => {
    const donnees = message("x <a@exemple.test>");
    const attendu = { from: SENDER_ADDRESS, to: forcee("x <a@exemple.test>") };
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(compiledEnvelope(donnees)).not.toEqual({ from: SENDER_ADDRESS, to: [attendu.to] });
    expect(checkEnvelope(donnees, attendu)).toEqual({ ok: false });
  });

  it("a;b@exemple.test → enveloppe [b@exemple.test], refus", () => {
    const donnees = message("a;b@exemple.test");
    const attendu = { from: SENDER_ADDRESS, to: forcee("a;b@exemple.test") };
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["b@exemple.test"] });
    expect(compiledEnvelope(donnees)).not.toEqual({ from: SENDER_ADDRESS, to: [attendu.to] });
    expect(checkEnvelope(donnees, attendu)).toEqual({ ok: false });
  });

  it.each(["bcc", "cc"])("données valides plus %s → refus (clé hors liste ; second destinataire compilé)", (cle) => {
    const donnees = message("a@exemple.test", { [cle]: "c@exemple.test" });
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test", "c@exemple.test"] });
    expect(checkEnvelope(donnees, attenduA)).toEqual({ ok: false });
  });

  it("to en tableau avec doublon → refus (getEnvelope le réduirait à un seul destinataire)", () => {
    const donnees = message(["a@exemple.test", "a@exemple.test"]);
    // Constaté sur 10.0.16 : les doublons sont retirés de l'enveloppe, alors que l'en-tête `To` en porte deux.
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(donnees, attenduA)).toEqual({ ok: false });
  });

  it("from différent de SENDER_ADDRESS → refus", () => {
    expect(checkEnvelope(message("a@exemple.test", { from: "autre@exemple.test" }), attenduA)).toEqual({ ok: false });
  });

  it("from absent, seul ou avec repli Reply-To ou Sender → refus", () => {
    const sansFrom = sans(message("a@exemple.test"), "from");
    expect(compiledEnvelope(sansFrom)).toEqual({ from: false, to: ["a@exemple.test"] });
    expect(checkEnvelope(sansFrom, attenduA)).toEqual({ ok: false });
    for (const repli of ["replyTo", "sender"]) {
      const donnees = { ...sansFrom, [repli]: SENDER_ADDRESS };
      // Constaté sur 10.0.16 : sans `From`, `getEnvelope()` prend l'expéditeur dans `Reply-To` ou `Sender`.
      expect(compiledEnvelope(donnees), repli).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
      expect(checkEnvelope(donnees, attenduA), repli).toEqual({ ok: false });
    }
  });

  it("clé envelope présente, même égale à l'attendu → refus (le contrôle ne peut pas être tautologique)", () => {
    const egale = message("a@exemple.test", { envelope: { from: SENDER_ADDRESS, to: ["a@exemple.test"] } });
    const masquante = message("z@exemple.test", { envelope: { from: SENDER_ADDRESS, to: ["a@exemple.test"] } });
    // Constaté sur 10.0.16 : avec une clé `envelope`, `getEnvelope()` rend cette valeur sans analyser les en-têtes.
    expect(compiledEnvelope(masquante)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(egale, attenduA)).toEqual({ ok: false });
    expect(checkEnvelope(masquante, attenduA)).toEqual({ ok: false });
  });

  it("clé envelope héritée du prototype → refus", () => {
    const prototype = { envelope: { from: SENDER_ADDRESS, to: ["a@exemple.test"] } };
    const donnees = Object.assign(Object.create(prototype) as Record<string, unknown>, message("z@exemple.test"));
    // Sans la liste blanche, `getEnvelope()` rendrait l'enveloppe héritée, égale à l'attendu.
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(donnees, attenduA)).toEqual({ ok: false });
    // Même avec un en-tête `to` égal à l'attendu : le prototype seul suffit au refus.
    const memeTo = Object.assign(Object.create(prototype) as Record<string, unknown>, message("a@exemple.test"));
    expect(checkEnvelope(memeTo, attenduA)).toEqual({ ok: false });
  });

  it("clé admise héritée (to sur le prototype) → refus", () => {
    const sansTo = sans(message("a@exemple.test"), "to");
    const donnees = Object.assign(Object.create({ to: "a@exemple.test" }) as Record<string, unknown>, sansTo);
    expect(checkEnvelope(donnees, attenduA)).toEqual({ ok: false });
  });

  it.each([
    ["raw", "From: connexion@exemple.test\r\nTo: a@exemple.test\r\nBcc: c@exemple.test\r\n\r\nx"],
    ["headers", { Bcc: "c@exemple.test" }],
    ["attachments", [{ filename: "a.txt", content: "x" }]],
    ["html", { path: "/etc/hostname" }],
    ["html", { href: "http://127.0.0.1/" }],
    ["list", { unsubscribe: "https://exemple.test/" }],
    ["replyTo", "c@exemple.test"],
    ["sender", "c@exemple.test"],
    ["icalEvent", "BEGIN:VCALENDAR"],
  ])("clé %s en plus des quatre clés admises → refus", (cle, valeur) => {
    expect(checkEnvelope(message("a@exemple.test", { [cle]: valeur }), attenduA)).toEqual({ ok: false });
  });

  it("valeur non textuelle d'une clé admise (text en objet path) → refus", () => {
    expect(checkEnvelope(message("a@exemple.test", { text: { path: "/etc/hostname" } }), attenduA)).toEqual({ ok: false });
  });

  it("clé manquante, clé envelope non énumérable, tableau → refus", () => {
    const sansTexte = sans(message("a@exemple.test"), "text");
    expect(checkEnvelope(sansTexte, attenduA)).toEqual({ ok: false });
    // `envelope` non énumérable (absente de `for…in`) : vue par `in`.
    const cachee = Object.create(
      Object.create(null, { envelope: { value: { from: SENDER_ADDRESS, to: ["a@exemple.test"] }, enumerable: false } }) as object,
    ) as Record<string, unknown>;
    Object.assign(cachee, message("z@exemple.test"));
    expect(checkEnvelope(cachee, attenduA)).toEqual({ ok: false });
    expect(checkEnvelope([] as unknown as DonneesMessage, attenduA)).toEqual({ ok: false });
  });

  it("accesseur : la valeur est lue une fois, dans la copie contrôlée et rendue", () => {
    let lectures = 0;
    const donnees = {
      from: SENDER_ADDRESS,
      subject: "s",
      text: "t",
      get to(): string {
        lectures += 1;
        return lectures === 1 ? "a@exemple.test" : "c@exemple.test";
      },
    };
    const resultat = checkEnvelope(donnees, attenduA);
    expect(resultat).toEqual({ ok: true, message: { from: SENDER_ADDRESS, to: "a@exemple.test", subject: "s", text: "t" } });
    expect(lectures).toBe(1);
  });

  it("compilation qui échoue → compiledEnvelope rend null", () => {
    const donnees = {
      from: SENDER_ADDRESS,
      subject: "s",
      text: "t",
      get to(): string {
        throw new Error("lecture refusée");
      },
    };
    expect(compiledEnvelope(donnees)).toBeNull();
    // Par checkEnvelope, l'accesseur est refusé avant toute compilation : la branche `null` y est une défense.
    expect(checkEnvelope(donnees, attenduA)).toEqual({ ok: false });
  });

  it("le refus ne porte aucune valeur", () => {
    const refus = checkEnvelope(message("a@exemple.test", { cc: "c@exemple.test" }), attenduA);
    expect(refus).toEqual({ ok: false });
    expect(JSON.stringify(refus)).not.toContain("exemple.test");
  });
});
