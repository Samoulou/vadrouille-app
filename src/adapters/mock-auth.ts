import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { fail, ok, type CodeRequest, type CodeVerification, type Result, type Session } from "@/contracts";
import { MOCK_AUTH_CODE, MOCK_KNOWN_EMAIL } from "@/mocks/auth-simule";
import { MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import type { AuthAddressRecord, AuthStore } from "./simulation";
import type { AuthAdapter, AuthConfig } from "./types";

/** Limites de la simulation (spécification F8, écran 4 ; F8-PO-9) : elles ne fixent pas les seuils réels de B3 (Q86). */
export const MOCK_AUTH_CONFIG: AuthConfig = {
  codeTtlMs: 600_000,
  maxAttempts: 3,
  maxCodeRequests: 3,
  codeRequestWindowMs: 900_000,
};

export interface MockAuthOptions {
  /** Horloge de la portée (0017 § 10.1) : jamais l'horloge système dans ce module. */
  now: () => number;
  store: AuthStore;
  /** Clé HMAC du processus (0017 § 3.5). */
  key: Buffer;
  config?: AuthConfig;
  /** Plafond d'adresses gardées par la portée (0017 § 10.4). */
  maxAddresses: number;
}

/** Adresse normalisée : minuscules, espaces retirés (même limite pour toutes les variantes d'écriture). */
function normalize(email: string): string {
  return email.replace(/\s/g, "").toLowerCase();
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Connexion simulée (décision 0017 § 3.2 et § 3.5 ; F8-PO-9) : sans réseau, sans écriture disque, sans journal,
 * sans cookie. L'état vit dans le magasin de la portée de simulation, **minimisé** : l'adresse n'y est jamais en
 * clair (clé HMAC-SHA-256 de l'adresse normalisée), le code n'y est pas recopié (comparé à la constante du jeu
 * simulé). **Même machine d'états pour une adresse connue ou inconnue** : même chemin de calcul, mêmes compteurs,
 * mêmes réponses ; seul l'identifiant de personne de la session diffère. Toute session porte l'organisation simulée.
 */
export function createMockAuthAdapter({ now, store, key, config = MOCK_AUTH_CONFIG, maxAddresses }: MockAuthOptions): AuthAdapter {
  const hmac = (email: string) => createHmac("sha256", key).update(normalize(email), "utf8").digest("hex");
  const knownKey = hmac(MOCK_KNOWN_EMAIL);

  /** Enregistrement de l'adresse, replacé en fin d'ordre d'usage ; le plus ancien est retiré au-delà du plafond. */
  function touch(addressKey: string, create: boolean): AuthAddressRecord | null {
    const existing = store.addresses.get(addressKey);
    if (!existing && !create) return null;
    const record = existing ?? { requests: [], code: null };
    store.addresses.delete(addressKey);
    store.addresses.set(addressKey, record);
    while (store.addresses.size > maxAddresses) {
      const oldest = store.addresses.keys().next().value;
      if (oldest === undefined) break;
      store.addresses.delete(oldest);
    }
    return record;
  }

  return {
    config,
    mode: "simulated",

    async requestCode({ email }: CodeRequest): Promise<Result<{ sent: true }>> {
      const at = now();
      const record = touch(hmac(email), true) as AuthAddressRecord;
      // Fenêtre glissante : seules les demandes plus récentes que `codeRequestWindowMs` comptent.
      record.requests = record.requests.filter((instant) => at - instant < config.codeRequestWindowMs);
      if (record.requests.length >= config.maxCodeRequests) return fail("rate_limited");
      record.requests.push(at);
      // Nouvelle demande : l'ancien code est invalidé, les essais repartent de zéro, la durée redémarre.
      record.code = { expiresAt: at + config.codeTtlMs, attempts: 0, locked: false };
      return ok({ sent: true });
    },

    async verifyCode({ email, code }: CodeVerification): Promise<Result<Session>> {
      const at = now();
      const addressKey = hmac(email);
      const record = touch(addressKey, false);
      const active = record?.code ?? null;
      // Aucun code actif (jamais demandé, ou remplacé et consommé) : comme un code expiré.
      if (!record || !active) return fail("code_expired");
      if (active.locked) return fail("too_many_attempts");
      if (at > active.expiresAt) return fail("code_expired");
      if (!sameCode(code, MOCK_AUTH_CODE)) {
        active.attempts += 1;
        if (active.attempts >= config.maxAttempts) {
          active.locked = true;
          return fail("too_many_attempts");
        }
        return fail("invalid_code");
      }
      record.code = null;
      const session: Session = {
        sessionId: randomUUID(),
        userId: addressKey === knownKey ? MOCK_USER_ID : `mock_user_${addressKey.slice(0, 16)}`,
        organizationId: MOCK_ORGANIZATION_ID,
      };
      store.session = session;
      return ok(session);
    },

    async getSession(): Promise<Session | null> {
      return store.session;
    },

    async signOut(): Promise<void> {
      store.session = null;
    },
  };
}
