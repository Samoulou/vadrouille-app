// @vitest-environment node
import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { deriverClesScram, ErreurScram, verificateurScram } from "../../../scripts/db/scram";

/**
 * `scram: vérificateur conforme au vecteur de test` (décision 0046, S5) : échange SCRAM-SHA-256 de la RFC 7677, § 3
 * (utilisateur `user`, mot de passe `pencil`, sel `W22ZaJ0SNY7soEsUEjb6gQ==`, 4 096 itérations). Les clés dérivées
 * doivent reproduire la signature du serveur de cet échange et accepter la preuve du client.
 */

const SEL = Buffer.from("W22ZaJ0SNY7soEsUEjb6gQ==", "base64");
const AUTH_MESSAGE = [
  "n=user,r=rOprNGfwEbeRWgbNEkqO",
  "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096",
  "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0",
].join(",");
const PREUVE_CLIENT = Buffer.from("dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=", "base64");
const SIGNATURE_SERVEUR = "6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=";

describe("scram: vérificateur conforme au vecteur de test", () => {
  it("RFC 7677 : la ServerKey reproduit la signature du serveur, la StoredKey accepte la preuve du client", () => {
    const { storedKey, serverKey } = deriverClesScram("pencil", SEL, 4096);
    expect(createHmac("sha256", serverKey).update(AUTH_MESSAGE).digest("base64")).toBe(SIGNATURE_SERVEUR);
    const signatureClient = createHmac("sha256", storedKey).update(AUTH_MESSAGE).digest();
    const clientKey = Buffer.from(PREUVE_CLIENT.map((octet, i) => octet ^ (signatureClient[i] ?? 0)));
    expect(createHash("sha256").update(clientKey).digest().equals(storedKey)).toBe(true);
  });

  it("format de Postgres : SCRAM-SHA-256$4096:<sel>$<StoredKey>:<ServerKey>, sans le mot de passe", () => {
    const motDePasse = "0123456789abcdef0123456789abcdef";
    const verificateur = verificateurScram(motDePasse, SEL);
    const { storedKey, serverKey } = deriverClesScram(motDePasse, SEL, 4096);
    expect(verificateur).toBe(`SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$${storedKey.toString("base64")}:${serverKey.toString("base64")}`);
    expect(verificateur).not.toContain(motDePasse);
  });

  it("refus : mot de passe court, non ASCII ou avec espace ; sel court ; itérations en dessous de 4 096", () => {
    expect(() => verificateurScram("pencil", SEL)).toThrow(ErreurScram);
    expect(() => verificateurScram("é".repeat(20), SEL)).toThrow(ErreurScram);
    expect(() => verificateurScram("a b".repeat(10), SEL)).toThrow(ErreurScram);
    expect(() => verificateurScram("a".repeat(32), SEL.subarray(0, 8))).toThrow(ErreurScram);
    expect(() => verificateurScram("a".repeat(32), SEL, 1000)).toThrow(ErreurScram);
  });
});
