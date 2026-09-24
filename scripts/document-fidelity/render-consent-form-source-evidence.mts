/** Render source evidence for both LSLGC consent-form variants, with env loaded first. */
import { resolve } from "node:path";

import { loadRuntimeEnvironment } from "./render-generated-evidence.mts";
import { renderSourceEvidence } from "./render-source-evidence.mts";

const envFile = resolve("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local");
await loadRuntimeEnvironment(envFile);

const base = "tmp/document-fidelity";

await renderSourceEvidence({
  id: "lslgc-consent-form-corporate",
  outdir: resolve(base, "consent-corp-source"),
});
console.log("corp source evidence rendered");

await renderSourceEvidence({
  id: "lslgc-consent-form-individual",
  outdir: resolve(base, "consent-individual-source"),
});
console.log("individual source evidence rendered");
