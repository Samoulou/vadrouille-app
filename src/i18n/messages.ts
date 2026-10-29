/**
 * Toutes les chaînes d'interface (handover § 10), un fichier JSON par espace de noms dans `src/i18n/fr/`
 * (décision 0047). S'importe en espace de noms, `import * as messages from "@/i18n/messages"`, et se lit
 * toujours par un chemin statique (`messages.sejour.…`) : le bundler n'embarque alors dans une page que les
 * fichiers de textes qu'elle lit. Jamais `messages` passé ou parcouru en entier hors des tests.
 */
export { default as produit } from "./fr/produit.json";
export { default as accueil } from "./fr/accueil.json";
export { default as ligne } from "./fr/ligne.json";
export { default as carte } from "./fr/carte.json";
export { default as dev } from "./fr/dev.json";
export { default as presentation } from "./fr/presentation.json";
export { default as sejour } from "./fr/sejour.json";
export { default as voyage } from "./fr/voyage.json";
export { default as mesVoyages } from "./fr/mesVoyages.json";
export { default as debloquer } from "./fr/debloquer.json";
export { default as etats } from "./fr/etats.json";
export { default as creation } from "./fr/creation.json";
export { default as connexion } from "./fr/connexion.json";
export { default as emailCode } from "./fr/emailCode.json";
export { default as emailApercu } from "./fr/emailApercu.json";
export { default as revision } from "./fr/revision.json";
export { default as partage } from "./fr/partage.json";
export { default as prototype } from "./fr/prototype.json";
