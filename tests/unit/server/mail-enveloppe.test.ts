// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SENDER_ADDRESS } from "@/server/config/email";
import { checkEnvelope, compiledEnvelope, type DonneesMessage } from "@/server/mail/enveloppe";

/**
 * Contrôle de l'enveloppe avant l'envoi (spécification B3b-envoi, point 4.3, critère E4) : `checkEnvelope` seule, avec
 * la vraie compilation de `nodemailer` 10.0.16 (aucun espion sur `MailComposer`). Adresses en `exemple.test`.
 */

const message = (to: string, autres: Record<string, unknown> = {}): DonneesMessage => ({
  from: SENDER_ADDRESS,
  to,
  subject: "Ton code de connexion",
  text: "Code : 123456",
  ...autres,
});

describe("email: contrôle de l'enveloppe avant l'envoi", () => {
  it("adresse canonique seule → accepté, enveloppe compilée égale à l'attendu", () => {
    const donnees = message("a@exemple.test");
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(donnees, { from: SENDER_ADDRESS, to: "a@exemple.test" })).toEqual({ ok: true });
  });

  it("a,b@exemple.test (liste blanche contournée) → refus : l'en-tête n'est pas lu comme cette adresse", () => {
    const donnees = message("a,b@exemple.test");
    // Constaté sur 10.0.16 : `a` (sans @) est écarté, seul `b@exemple.test` reste ; la spécification attendait
    // `["a", "b@exemple.test"]`. Dans les deux cas l'enveloppe diffère de l'attendu.
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["b@exemple.test"] });
    expect(checkEnvelope(donnees, { from: SENDER_ADDRESS, to: "a,b@exemple.test" })).toEqual({ ok: false });
  });

  it("x <a@exemple.test> → enveloppe [a@exemple.test], différente de l'attendu, refus", () => {
    const donnees = message("x <a@exemple.test>");
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(donnees, { from: SENDER_ADDRESS, to: "x <a@exemple.test>" })).toEqual({ ok: false });
  });

  it("a;b@exemple.test → refus", () => {
    expect(checkEnvelope(message("a;b@exemple.test"), { from: SENDER_ADDRESS, to: "a;b@exemple.test" })).toEqual({ ok: false });
  });

  it.each(["bcc", "cc"])("données valides plus %s → refus (second destinataire compilé)", (cle) => {
    const donnees = message("a@exemple.test", { [cle]: "c@exemple.test" });
    expect(compiledEnvelope(donnees)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test", "c@exemple.test"] });
    expect(checkEnvelope(donnees, { from: SENDER_ADDRESS, to: "a@exemple.test" })).toEqual({ ok: false });
  });

  it("from différent de SENDER_ADDRESS → refus", () => {
    const donnees = message("a@exemple.test", { from: "autre@exemple.test" });
    expect(checkEnvelope(donnees, { from: SENDER_ADDRESS, to: "a@exemple.test" })).toEqual({ ok: false });
  });

  it("clé envelope présente, même égale à l'attendu → refus (le contrôle ne peut pas être tautologique)", () => {
    const attendu = { from: SENDER_ADDRESS, to: "a@exemple.test" };
    const egale = message("a@exemple.test", { envelope: { from: SENDER_ADDRESS, to: ["a@exemple.test"] } });
    const masquante = message("z@exemple.test", { envelope: { from: SENDER_ADDRESS, to: ["a@exemple.test"] } });
    // Constaté sur 10.0.16 : avec une clé `envelope`, `getEnvelope()` rend cette valeur sans analyser les en-têtes.
    expect(compiledEnvelope(masquante)).toEqual({ from: SENDER_ADDRESS, to: ["a@exemple.test"] });
    expect(checkEnvelope(egale, attendu)).toEqual({ ok: false });
    expect(checkEnvelope(masquante, attendu)).toEqual({ ok: false });
  });

  it("le refus ne porte aucune valeur", () => {
    const refus = checkEnvelope(message("a@exemple.test", { cc: "c@exemple.test" }), { from: SENDER_ADDRESS, to: "a@exemple.test" });
    expect(refus).toEqual({ ok: false });
    expect(JSON.stringify(refus)).not.toContain("exemple.test");
  });
});
