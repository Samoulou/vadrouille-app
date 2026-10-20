// Commande de reprise d'un voyage complet par le studio (spécification B9, B9d point 7, B9-PO-17 point 4 ; décision 0087
// § 1.6). Lancée par Samuel seul, en local : `pnpm reprise-studio --organisation <uuid> --voyage <uuid>` (les deux
// identifiants internes de l'événement `generation.full_stuck`).
//
// Elle ne fait qu'**une** écriture conditionnelle `failed` → `queued` (module feuille `src/server/generation/reprise.ts`, auteur
// « studio » : compteur du studio incrémenté, compteur de la personne intact) dans le **contexte système** de l'organisation
// passée en argument (`src/server/with-system-org.ts` : `app.organization_id` seul, aucune lecture avant ; sous la sécurité par
// ligne forcée, un couple organisation et voyage qui ne correspond pas ne touche aucune ligne). Elle ne démarre rien : la
// réconciliation du déploiement démarre la ligne à la prochaine lecture d'état (derrière la barrière, sous le forfait et les
// plafonds de toute exécution). Aucun plafond n'est contourné ni relevé ici. Imports : ces deux modules seulement (et, par
// eux, l'accès à la base) ; aucun chemin vers la composition, `src/ai`, `src/research` ni `src/grounding` (0081 B9-TL-1
// point 2). Verdict de la Sécurité attendu (0087 § 1.6 point 4).
import { reprendreVoyageComplet, type ExecuteurReprise } from "../src/server/generation/reprise.ts";
import { executeurSql, withSystemOrg } from "../src/server/with-system-org.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IssueRepriseStudio = "repris" | "rien_a_reprendre" | "arguments_invalides";

/** Arguments `--organisation <uuid> --voyage <uuid>` ; `null` si l'un manque ou n'est pas un `uuid`. */
export function lireArguments(argv: readonly string[]): { readonly organizationId: string; readonly tripId: string } | null {
  const valeur = (nom: string): string | undefined => {
    const position = argv.indexOf(nom);
    return position < 0 ? undefined : argv.at(position + 1);
  };
  const organizationId = valeur("--organisation");
  const tripId = valeur("--voyage");
  if (organizationId === undefined || tripId === undefined || !UUID.test(organizationId) || !UUID.test(tripId)) return null;
  return { organizationId, tripId };
}

type TransactionSysteme = <T>(organizationId: string, travail: (executeur: ExecuteurReprise) => Promise<T>) => Promise<T>;

const transactionParDefaut: TransactionSysteme = (organizationId, travail) => withSystemOrg(organizationId, (tx) => travail(executeurSql(tx)));

/** Reprise par le studio ; dépendances remplaçables (tests de base). */
export async function reprendreParLeStudio(
  argv: readonly string[],
  dependances: { readonly transaction?: TransactionSysteme; readonly maintenant?: () => number } = {},
): Promise<IssueRepriseStudio> {
  const cible = lireArguments(argv);
  if (cible === null) return "arguments_invalides";
  const transaction = dependances.transaction ?? transactionParDefaut;
  const instant = new Date((dependances.maintenant ?? Date.now)());
  const reprise = await transaction(cible.organizationId, (x) => reprendreVoyageComplet(x, { ...cible, instant }, { type: "studio" }));
  return reprise === null ? "rien_a_reprendre" : "repris";
}

/** Message de chaque issue (aucun identifiant ni donnée de la base). */
function message(issue: IssueRepriseStudio): string {
  switch (issue) {
    case "repris":
      return "Reprise écrite : le voyage complet démarrera à la prochaine lecture de son état.";
    case "rien_a_reprendre":
      return "Rien à reprendre (aucune ligne du voyage complet en échec pour cette organisation et ce voyage).";
    case "arguments_invalides":
      return "Usage : pnpm reprise-studio --organisation <uuid> --voyage <uuid>";
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  reprendreParLeStudio(process.argv.slice(2))
    .then((issue) => {
      console.log(message(issue));
      process.exitCode = issue === "arguments_invalides" ? 2 : 0;
    })
    .catch((erreur: unknown) => {
      // Jamais le message (il peut porter une chaîne de connexion) : le nom de l'erreur seulement.
      console.error(`Reprise impossible (${erreur instanceof Error ? erreur.name : "erreur"}).`);
      process.exitCode = 1;
    });
}
