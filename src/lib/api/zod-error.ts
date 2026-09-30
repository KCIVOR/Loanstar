import type { z } from "zod";

/**
 * Turns a ZodError into a short, plain-language message for end users
 * (e.g. "Please check: Allottee email must be a valid email address.")
 * instead of Zod's raw JSON issue dump.
 */

// Zod's built-in messages start with these; anything else was written by us
// in a schema (e.g. `.min(1, "Name is required")`) and is shown as-is.
const DEFAULT_MESSAGE_PREFIXES = [
  "Invalid",
  "Too small",
  "Too big",
  "Expected",
  "Unrecognized",
];

function humanize(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function fieldLabel(path: readonly PropertyKey[]): string {
  const words = path
    .filter((p): p is string => typeof p === "string")
    .map(humanize)
    .filter(Boolean);
  // Numeric segments are list rows, e.g. references[1].name → "Reference #2 name".
  const index = path.find((p): p is number => typeof p === "number");
  let label = words.join(" ");
  if (index !== undefined && words.length > 0) {
    label = `${words[0].replace(/s$/, "")} #${index + 1} ${words.slice(1).join(" ")}`.trim();
  }
  if (!label) return "A field";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const label = fieldLabel(issue.path);
  const isDefault = DEFAULT_MESSAGE_PREFIXES.some((p) =>
    issue.message.startsWith(p),
  );
  if (!isDefault) return issue.message;

  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined || issue.input === null
        ? `${label} is required`
        : `${label} has an invalid value`;
    case "too_small":
      if (issue.origin === "string") {
        return Number(issue.minimum) <= 1
          ? `${label} is required`
          : `${label} must be at least ${issue.minimum} characters`;
      }
      if (issue.origin === "array") {
        return `${label} needs at least ${issue.minimum} item(s)`;
      }
      return `${label} must be at least ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "string") {
        return `${label} must be at most ${issue.maximum} characters`;
      }
      if (issue.origin === "array") {
        return `${label} can have at most ${issue.maximum} item(s)`;
      }
      return `${label} must be at most ${issue.maximum}`;
    case "invalid_format":
      if (issue.format === "email") return `${label} must be a valid email address`;
      return `${label} is not in the correct format`;
    case "invalid_value":
      return `Please choose a valid option for ${label.toLowerCase()}`;
    default:
      return `${label} is invalid`;
  }
}

export function formatZodError(error: z.ZodError): string {
  const messages = [...new Set(error.issues.map(describeIssue))];
  if (messages.length === 0) return "Some of the information entered is invalid.";
  if (messages.length === 1) return `Please check: ${messages[0]}.`;
  return `Please check the following: ${messages.join("; ")}.`;
}
