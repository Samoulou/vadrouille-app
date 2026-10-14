import "server-only";

import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { uniqueKeyName } from "./naming.ts";

/**
 * Tables d'authentification, d'organisation et du limiteur (handover § 6 et § 7, décisions 0007 et 0008).
 * B1 les crée avec les colonnes du handover ; B3 relie Better Auth à ces tables et ajoute par migration ce que la
 * bibliothèque exige de plus, sans retirer de contrainte (décision B1-PO-4). RLS, droits et déclencheurs :
 * `db/migrations/0001_securite.sql`.
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Exception à `organization_id` : une personne peut appartenir à plusieurs organisations. */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(uniqueKeyName("users_email")),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Organisation (`personal` au MVP, `agency` plus tard) ; `deletion_requested_at` : suppression en cours (§ 12). */
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(uniqueKeyName("organizations_slug")),
    kind: text("kind").notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("organizations_kind_check", sql`${t.kind} IN ('personal', 'agency')`)],
);

/** Exception à `organization_id` : la session précède le choix d'organisation. IP et agent utilisateur : jamais. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull().unique(uniqueKeyName("sessions", "token")),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

/** Exception à `organization_id` : authentification (si Better Auth la crée pour la connexion par code). */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    providerId: text("provider_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

/** Exception à `organization_id` : avant toute session. `value` est le code haché. */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier), index("verifications_expires_at_idx").on(t.expiresAt)],
);

/** Adhésion `owner` (propriétaire) ou `member` (conseiller) ; une seule adhésion `owner` par organisation. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique(uniqueKeyName("memberships_organization_id_user_id")).on(t.organizationId, t.userId),
    uniqueIndex("memberships_one_owner_idx").on(t.organizationId).where(sql`${t.role} = 'owner'`),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_role_check", sql`${t.role} IN ('owner', 'member')`),
  ],
);

/**
 * Limiteur maison (décision 0007, handover § 7). Exception à `organization_id` : actions anonymes. `key` est un
 * HMAC à préfixe de domaine, jamais une adresse IP ni un email en clair.
 */
export const actionRateLimits = pgTable(
  "action_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    // B3a (amendement de 0007 par 0050) : échéance de la fenêtre, posée par la base (`now() + durée`), relisible
    // pour la purge à l'écriture.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    index("action_rate_limits_window_start_idx").on(t.windowStart),
    index("action_rate_limits_expires_at_idx").on(t.expiresAt),
    check("action_rate_limits_count_check", sql`${t.count} >= 0`),
  ],
);
