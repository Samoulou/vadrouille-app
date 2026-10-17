/**
 * Adresses de la création du voyage (décision 0017 § 1, sur le modèle de `tripRoutes`) : seul endroit qui
 * connaît ces chemins. Aucune adresse de F8 n'est concaténée ailleurs (point de revue). Le brouillon ne passe
 * jamais dans l'adresse : ni ville courante, ni récit (seul paramètre de F8 : `suite`, sur `/connexion`).
 *
 * F8a livre `nouveau`, `brief` et `lancer` (valeur de `suite` du « Continuer » de l'écran 2), F8b `logement` ;
 * F8c ajoute `preparation(tripId)`.
 */
export const creationRoutes = {
  /** `R1`, écran 1 « Créer le voyage ». */
  nouveau: () => "/voyages/nouveau",
  /** `R2`, écran 2 « Brief raconté » puis vérifié (deux états sur la même adresse). */
  brief: () => "/voyages/nouveau/brief",
  /** `R3`, écran 3 « Où loger » (décision 0017 § 1, F8-TL-1) : la ville courante est l'état du brouillon, jamais l'adresse. */
  logement: () => "/voyages/nouveau/logement",
  /** `R-lancer`, étape sans écran qui crée le voyage après la connexion (F8c). */
  lancer: () => "/voyages/nouveau/lancer",
  /** `R5`, écran 5 « Propositions prêtes » du voyage créé (F8c), hors du groupe `(creation)` ; identifiant encodé. */
  preparation: (tripId: string) => `/voyages/${encodeURIComponent(tripId)}/preparation`,
  /** Niveau supérieur de l'écran 1 : « Mes voyages » (F11a, 404 d'ici là). */
  mesVoyages: () => "/voyages",
} as const;
