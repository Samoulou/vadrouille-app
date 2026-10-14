import { createHash, createHmac, pbkdf2Sync } from "node:crypto";

/**
 * Vérificateur SCRAM-SHA-256 d'un mot de passe, au format que Postgres stocke et accepte dans `ALTER ROLE … PASSWORD`
 * (`SCRAM-SHA-256$<itérations>:<sel>$<StoredKey>:<ServerKey>`, Base64) : RFC 5802 et RFC 7677. Décision 0046, S5 :
 * le vérificateur est calculé côté client, jamais le mot de passe en clair dans une requête (journaux Neon,
 * `pg_stat_statements`). Module pur : `node:crypto` seulement, aucune lecture d'environnement ni de fichier.
 *
 * Postgres applique SASLprep au mot de passe ; pour qu'aucune normalisation ne sépare le calcul du client de celui du
 * serveur, seuls les caractères ASCII imprimables sont admis (le mot de passe de S5 est hexadécimal, `openssl rand -hex 32`).
 */

export const ITERATIONS_SCRAM = 4096;

export class ErreurScram extends Error {
  override name = "ErreurScram";
}

/** Clés dérivées (RFC 5802, § 3) : SaltedPassword, puis ClientKey, StoredKey et ServerKey. Dérivation seule, sans règle. */
export function deriverClesScram(motDePasse: string, sel: Uint8Array, iterations: number): { readonly storedKey: Buffer; readonly serverKey: Buffer } {
  const salted = pbkdf2Sync(motDePasse, sel, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return { storedKey, serverKey };
}

/** Vérificateur au format de Postgres, après les règles du mot de passe, du sel et des itérations. */
export function verificateurScram(motDePasse: string, sel: Uint8Array, iterations = ITERATIONS_SCRAM): string {
  if (!/^[\x21-\x7e]{16,1024}$/.test(motDePasse)) throw new ErreurScram("mot de passe refusé : 16 à 1 024 caractères ASCII imprimables, sans espace");
  if (sel.length < 16) throw new ErreurScram("sel trop court : 16 octets au moins");
  if (!Number.isInteger(iterations) || iterations < ITERATIONS_SCRAM) throw new ErreurScram("itérations : 4 096 au moins");
  const { storedKey, serverKey } = deriverClesScram(motDePasse, sel, iterations);
  return `SCRAM-SHA-256$${iterations}:${Buffer.from(sel).toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
