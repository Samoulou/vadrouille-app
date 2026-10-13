import noHardcodedColors from "./no-hardcoded-colors.mjs";
import { noCacheStorageOpen, noServiceWorkerRegister } from "./service-worker.mjs";

/** Plugin ESLint local du projet. */
const plugin = {
  meta: { name: "ligne" },
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "no-service-worker-register": noServiceWorkerRegister,
    "no-cache-storage-open": noCacheStorageOpen,
  },
};

export default plugin;
