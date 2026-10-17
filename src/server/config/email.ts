import "server-only";

/**
 * Adresse d'expédition des e-mails du code de connexion (spécification B3b-envoi, point 4.6). Constante de phase 0, en
 * `exemple.test` : aucun domaine d'envoi réel. L'adresse réelle suit le fournisseur d'envoi (Q25, Samuel) et sa tâche
 * (décision 0077 § 5.1). Nom du fichier et de la constante : proposition, à confirmer par le Tech Lead.
 */
export const SENDER_ADDRESS = "connexion@exemple.test";
