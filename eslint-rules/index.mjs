import { betterAuthConfinement, noRawAuthSecret } from "./better-auth-confinement.mjs";
import { creationImports } from "./creation-imports.mjs";
import { listeBlancheGrounding, relectureImports } from "./grounding-imports.mjs";
import { complementP0, listeBlanche } from "./ia-recherche-imports.mjs";
import noHardcodedColors from "./no-hardcoded-colors.mjs";
import noP0ServerModules from "./no-p0-server-modules.mjs";
import requireServerOnly from "./require-server-only.mjs";
import { routeHandlers } from "./route-handlers.mjs";
import serverEnvImports from "./server-env-imports.mjs";
import { noCacheStorageOpen, noServiceWorkerRegister } from "./service-worker.mjs";
import useServerOnlyInActions from "./use-server-only-in-actions.mjs";
import { voyagesImports } from "./voyages-imports.mjs";
import workflowDirectives from "./workflow-directives.mjs";

/** Plugin ESLint local du projet. */
const plugin = {
  meta: { name: "ligne" },
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "require-server-only": requireServerOnly,
    "no-p0-server-modules": noP0ServerModules,
    "server-env-imports": serverEnvImports,
    "use-server-only-in-actions": useServerOnlyInActions,
    "no-service-worker-register": noServiceWorkerRegister,
    "no-cache-storage-open": noCacheStorageOpen,
    "workflow-directives": workflowDirectives,
    "ia-recherche-liste-blanche": listeBlanche,
    "complement-p0-imports": complementP0,
    "grounding-liste-blanche": listeBlancheGrounding,
    "relecture-imports": relectureImports,
    "voyages-imports": voyagesImports,
    "creation-imports": creationImports,
    "better-auth-confinement": betterAuthConfinement,
    "no-raw-auth-secret": noRawAuthSecret,
    "route-handlers": routeHandlers,
  },
};

export default plugin;
