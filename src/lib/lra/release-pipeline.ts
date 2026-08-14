import type { StepperStep } from "@/components/ui/Stepper";
import type { ReleaseFileStatus, ReleasePath } from "@/lib/lra/constants";

const STATUS_RANK: Record<ReleaseFileStatus, number> = {
  awaiting_path: 0,
  pdc_encoding: 1,
  ready_generate: 2,
  awaiting_signatures: 3,
  awaiting_briefing: 4,
  ready_release: 5,
  released: 6,
  closed: 7,
};

type PipelineKey =
  | "path"
  | "encode"
  | "generate"
  | "sign"
  | "briefing"
  | "release"
  | "close";

const PIPELINE: Array<{ key: PipelineKey; label: string }> = [
  { key: "path", label: "Path" },
  { key: "encode", label: "Encode" },
  { key: "generate", label: "Generate" },
  { key: "sign", label: "Sign" },
  { key: "briefing", label: "Briefing" },
  { key: "release", label: "Release" },
  { key: "close", label: "Close" },
];

function stepState(
  current: number,
  doneAtOrAbove: number,
  currentAt: number,
): StepperStep["state"] {
  if (current >= doneAtOrAbove) return "done";
  if (current === currentAt) return "current";
  return "todo";
}

/**
 * Maps release_files.status (+ path) onto the Meridian stepper used on the
 * LRA application workspace.
 */
export function releasePipelineSteps(
  status: ReleaseFileStatus | string,
  path: ReleasePath | string[] | null,
): StepperStep[] {
  const rank = STATUS_RANK[status as ReleaseFileStatus] ?? 0;
  const skipEncode = !Array.isArray(path)
    ? path === "without_pdc"
    : !path.includes("with_pdc");

  return PIPELINE.map(({ key, label }) => {
    switch (key) {
      case "path":
        return {
          label,
          state: stepState(rank, 1, 0),
        };
      case "encode":
        if (skipEncode) {
          return {
            label,
            description: "ATM path",
            state: rank >= 1 ? "done" : "todo",
          };
        }
        return {
          label,
          state: stepState(rank, 2, 1),
        };
      case "generate":
        return {
          label,
          state: stepState(rank, 3, 2),
        };
      case "sign":
        return {
          label,
          state: stepState(rank, 4, 3),
        };
      case "briefing":
        return {
          label,
          state: stepState(rank, 5, 4),
        };
      case "release":
        return {
          label,
          state: stepState(rank, 6, 5),
        };
      case "close":
        return {
          label,
          state: rank >= 7 ? "done" : rank === 6 ? "current" : "todo",
        };
      default:
        return { label, state: "todo" };
    }
  });
}
