import { exportAccount } from "@/server/actions/compte";

/**
 * Côté navigateur de « Exporter mes données » (M9c, ticket 1122 ; spécification M9 § 6.4, critères 3 et 10).
 *
 * Le fichier vient de l'action `exportAccount` : sur `api`, mêmes contrôles que la route de M9a ; sur `mock`, le fichier
 * du jeu simulé (même schéma). Un refus porte un code `ApiError`, qui choisit la suite (code à demander, connexion,
 * limite, erreur). Aucun appel réseau n'est écrit ici (régime de confinement de `src/features`).
 *
 * Le contenu du fichier ne reste qu'en mémoire, le temps de l'enregistrement : ni stockage du navigateur, ni journal, ni
 * mesure.
 */

export type IssueExport =
  | { readonly kind: "fichier"; readonly nom: string; readonly contenu: Blob }
  /** Connexion de plus de 10 minutes : le code est demandé, puis l'export repart (§ 1.3). */
  | { readonly kind: "reauthentification" }
  /** Plus de session : page de connexion. */
  | { readonly kind: "session" }
  /** Limite atteinte (`rate_limited`). */
  | { readonly kind: "limite" }
  | { readonly kind: "erreur" };

/** Nom rendu par le serveur (`nomFichierExport`) : aucun autre n'est admis pour l'enregistrement. */
const NOM_ATTENDU = /^vadrouille-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/;
/** Nom de repli, sans date, si le nom rendu n'a pas la forme attendue. */
export const NOM_DE_REPLI = "vadrouille-mes-donnees.json";

function nomAdmis(nom: string): string {
  return NOM_ATTENDU.test(nom) ? nom : NOM_DE_REPLI;
}

function issueDuRefus(code: unknown): IssueExport {
  if (code === "reauthentication_required") return { kind: "reauthentification" };
  if (code === "unauthenticated") return { kind: "session" };
  if (code === "rate_limited") return { kind: "limite" };
  return { kind: "erreur" };
}

/** Demande le fichier ; ne lève jamais (erreur de réseau ou du serveur : `erreur`). */
export async function demanderExport(): Promise<IssueExport> {
  try {
    const resultat = await exportAccount();
    if (!resultat.ok) return issueDuRefus(resultat.error.code);
    return { kind: "fichier", nom: nomAdmis(resultat.value.fileName), contenu: new Blob([resultat.value.content], { type: "application/json" }) };
  } catch {
    return { kind: "erreur" };
  }
}

/** Délai avant de libérer l'adresse du fichier en mémoire : le navigateur a commencé l'enregistrement. */
const LIBERATION_MS = 10_000;

/** Fait enregistrer le fichier par le navigateur (lien `download` sur une adresse en mémoire, libérée ensuite). */
export function enregistrerFichier(nom: string, contenu: Blob): void {
  const adresse = URL.createObjectURL(contenu);
  const lien = document.createElement("a");
  lien.href = adresse;
  lien.download = nom;
  lien.hidden = true;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), LIBERATION_MS);
}

/** Quitte l'écran par un chargement complet de `adresse` (déconnexion, compte supprimé : voir `AccountScreen`). */
export function quitterVers(adresse: string): void {
  window.location.replace(adresse);
}
