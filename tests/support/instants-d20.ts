/**
 * Instants des tests de D20 (décision 0046) : minuit heure du Pacifique autour des changements d'heure du
 * 2026-11-01 (fin de l'heure d'été) et du 2027-03-14 (début), et minuit UTC du 1er janvier. Communs au test pur
 * (`src/server/usage/periodes.test.ts`) et au test de la base (`base: quota_day_at égal à periodes.ts`).
 */
export const INSTANTS_JOUR_GOOGLE: readonly { readonly iso: string; readonly jour: string }[] = [
  { iso: "2026-11-01T06:59:00Z", jour: "2026-10-31" }, // 23:59 PDT
  { iso: "2026-11-01T07:00:00Z", jour: "2026-11-01" }, // 00:00 PDT
  { iso: "2026-11-02T07:59:00Z", jour: "2026-11-01" }, // 23:59 PST
  { iso: "2026-11-02T08:00:00Z", jour: "2026-11-02" }, // 00:00 PST
  { iso: "2027-03-14T07:59:00Z", jour: "2027-03-13" }, // 23:59 PST
  { iso: "2027-03-14T08:00:00Z", jour: "2027-03-14" }, // 00:00 PST
  { iso: "2027-03-15T06:59:00Z", jour: "2027-03-14" }, // 23:59 PDT
  { iso: "2027-03-15T07:00:00Z", jour: "2027-03-15" }, // 00:00 PDT
  { iso: "2026-12-31T23:59:00Z", jour: "2026-12-31" },
  { iso: "2027-01-01T00:00:00Z", jour: "2026-12-31" },
  { iso: "2027-01-01T08:00:00Z", jour: "2027-01-01" },
];
