import noHardcodedColors from "./no-hardcoded-colors.mjs";
import noP0ServerModules from "./no-p0-server-modules.mjs";
import requireServerOnly from "./require-server-only.mjs";
import serverEnvImports from "./server-env-imports.mjs";
import { noCacheStorageOpen, noServiceWorkerRegister } from "./service-worker.mjs";
import useServerOnlyInActions from "./use-server-only-in-actions.mjs";
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
  },
};

export default plugin;
