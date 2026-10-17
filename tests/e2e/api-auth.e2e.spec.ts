import { expect, test } from "@playwright/test";

/**
 * Aucune route de Better Auth (spécification B3, B3b point 3 ; critère B2, partie « serveur construit ») : le
 * gestionnaire HTTP de la bibliothèque n'est pas monté, toute requête vers `/api/auth/*` reçoit 404, en `GET` comme en
 * `POST`. Échantillon de chemins de Better Auth 1.7.7 : connexion, envoi de code, suppression d'utilisateur,
 * changement d'e-mail, suppression d'organisation, changement de rôle, liste des sessions. La partie « sources » est
 * dans `tests/unit/auth/routes.test.ts`.
 */

const CHEMINS = [
  "/api/auth/sign-in/email-otp",
  "/api/auth/email-otp/send-verification-otp",
  "/api/auth/delete-user",
  "/api/auth/change-email",
  "/api/auth/organization/delete",
  "/api/auth/organization/update-member-role",
  "/api/auth/list-sessions",
  "/api/auth/get-session",
  "/api/auth/sign-out",
  "/api/auth/ok",
];

test.describe("serveur construit", () => {
  test("auth: aucune route /api/auth n'est exposée", async ({ request }) => {
    for (const chemin of CHEMINS) {
      const lecture = await request.get(chemin, { maxRedirects: 0 });
      expect(lecture.status(), `GET ${chemin}`).toBe(404);
      const ecriture = await request.post(chemin, { data: { email: "a@exemple.test", otp: "123456" }, maxRedirects: 0 });
      expect(ecriture.status(), `POST ${chemin}`).toBe(404);
    }
  });
});
