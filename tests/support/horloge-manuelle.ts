/**
 * Horloge manuelle des tests du port de consommation et des clients réels (P0r1 ; décision 0046, D13 : « les tests
 * utilisent une horloge injectée »). Même forme que `Horloge` de `@/server/usage/port` : `avancer` déclenche les
 * minuteries échues, dans l'ordre.
 */

export type HorlogeManuelle = {
  maintenant(): number;
  minuterie(ms: number, rappel: () => void): () => void;
  /** Avance le temps et déclenche les minuteries échues ; laisse ensuite les promesses en attente progresser. */
  avancer(ms: number): Promise<void>;
  /** Minuteries en attente (non échues, non annulées). */
  enAttente(): number;
};

export function creerHorlogeManuelle(depart = Date.UTC(2026, 9, 13, 12, 0, 0)): HorlogeManuelle {
  let instant = depart;
  const minuteries: { echeance: number; rappel: () => void; active: boolean }[] = [];
  const laisserProgresser = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };
  return {
    maintenant: () => instant,
    minuterie(ms, rappel) {
      const entree = { echeance: instant + ms, rappel, active: true };
      minuteries.push(entree);
      return () => {
        entree.active = false;
      };
    },
    async avancer(ms) {
      await laisserProgresser();
      instant += ms;
      for (const entree of [...minuteries].sort((a, b) => a.echeance - b.echeance)) {
        if (entree.active && entree.echeance <= instant) {
          entree.active = false;
          entree.rappel();
        }
      }
      await laisserProgresser();
    },
    enAttente: () => minuteries.filter((entree) => entree.active).length,
  };
}
