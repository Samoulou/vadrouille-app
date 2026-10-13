import { createServer } from "node:http";

/**
 * Serveur local de test (spécification P0c, section 4, « Serveur local de test »). Seul utilitaire admis pour un
 * test qui a besoin d'un vrai serveur ; ligne nominative du régime lui-même : `node:http`, `createServer` seulement,
 * écoute sur `127.0.0.1` et le port `0` (choisi par le système) seulement. Les tests qui l'importent n'ont pas de
 * ligne propre. Préférer `avecServeurLocal`, qui garantit la fermeture en fin de travail.
 */

export type GestionnaireRequete = NonNullable<Parameters<typeof createServer>[1]>;

export type ServeurLocal = {
  /** `http://127.0.0.1:<port>`. */
  readonly origine: string;
  readonly hote: "127.0.0.1";
  readonly port: number;
  /** Ferme les connexions ouvertes puis le serveur. */
  fermer(): Promise<void>;
};

export async function demarrerServeurLocal(gestionnaire: GestionnaireRequete): Promise<ServeurLocal> {
  const serveur = createServer(gestionnaire);
  await new Promise<void>((resoudre, rejeter) => {
    serveur.once("error", rejeter);
    serveur.listen(0, "127.0.0.1", () => {
      serveur.off("error", rejeter);
      resoudre();
    });
  });
  const adresse = serveur.address();
  if (adresse === null || typeof adresse === "string" || adresse.address !== "127.0.0.1") {
    serveur.close();
    throw new Error("serveur local : adresse d'écoute inattendue");
  }
  const port = adresse.port;
  return {
    origine: `http://127.0.0.1:${port}`,
    hote: "127.0.0.1",
    port,
    fermer: () =>
      new Promise<void>((resoudre, rejeter) => {
        serveur.closeAllConnections();
        serveur.close((erreur) => (erreur ? rejeter(erreur) : resoudre()));
      }),
  };
}

/** Démarre un serveur local, exécute `travail`, puis ferme le serveur, même en cas d'échec. */
export async function avecServeurLocal<T>(gestionnaire: GestionnaireRequete, travail: (serveur: ServeurLocal) => Promise<T>): Promise<T> {
  const serveur = await demarrerServeurLocal(gestionnaire);
  try {
    return await travail(serveur);
  } finally {
    await serveur.fermer();
  }
}
