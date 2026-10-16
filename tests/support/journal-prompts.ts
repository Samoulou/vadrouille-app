import type { ClientModeles, RequeteModele } from "@/ai/client";

/**
 * Journal de prompts de test (spécification B7a, point 4 ; décision 0011) : décorateur de `ClientModeles` qui garde en
 * mémoire une copie de **chaque** requête envoyée (messages système et données), puis la transmet au client décoré.
 * Réutilisable par B8 et B9 (canari du test `prompts: aucun prompt journalisé ne contient de donnée Google`).
 * Mémoire du test seulement : rien n'est écrit ailleurs.
 */
export type JournalPrompts = {
  /** Client à passer à la couche IA, à l'agent ou à l'orchestrateur : chaque requête y est journalisée. */
  readonly client: ClientModeles;
  /** Requêtes envoyées, dans l'ordre, copiées au moment de l'envoi. */
  readonly requetes: readonly RequeteModele[];
  /** Texte complet du journal (requêtes sérialisées), pour la recherche de sentinelles. */
  texte(): string;
};

export function journalDePrompts(client: ClientModeles): JournalPrompts {
  const requetes: RequeteModele[] = [];
  return {
    client: {
      async envoyer(requete) {
        requetes.push(structuredClone(requete));
        return client.envoyer(requete);
      },
    },
    requetes,
    texte: () => JSON.stringify(requetes),
  };
}
