import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.RUNTIME_NODE_MODULES = "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";

const skillDir = "C:/Users/Rovick/.codex/plugins/cache/openai-primary-runtime/presentations/26.915.20218/skills/presentations";
const workspaceDir = "C:/Users/Rovick/Desktop/Loanstar System/loanstar";
const candidatePath = path.join(workspaceDir, ".codex-finalizer", "loanstar-uat-progress-candidate.pptx");
const finalPath = path.join(workspaceDir, "output", "Loanstar_UAT_Progress_Presentation_updated.pptx");
const runtimePython = "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";

await fs.mkdir(path.dirname(finalPath), { recursive: true });
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry", "--validate-heading-fit",
    "--require-native-table-slide", "3",
    "--require-native-table-slide", "4",
    "--require-native-table-slide", "6",
    "--require-native-table-slide", "7",
    "--require-native-table-slide", "8",
    "--require-native-table-slide", "10",
    "--require-native-table-slide", "11",
    "--require-native-table-slide", "12",
    "--require-native-table-slide", "14",
    "--require-native-table-slide", "15",
    "--require-native-table-slide", "16",
    "--require-native-table-slide", "17",
  ],
  requiredNativeTableOwnerSlides: [3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17],
  verifyArtifactToolImport: true,
  receiptPath: path.join(workspaceDir, ".codex-finalizer", "loanstar-uat-progress-validation.json"),
});
console.log(JSON.stringify(result));
