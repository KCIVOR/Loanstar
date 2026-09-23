import type { ModuleSlug } from "./types";

type PageAccessRule = {
  prefix: string;
  modules: readonly ModuleSlug[];
};

const PAGE_ACCESS_RULES: readonly PageAccessRule[] = [
  { prefix: "/admin/audit", modules: ["audit_log"] },
  { prefix: "/admin/roles", modules: ["auth_admin"] },
  { prefix: "/admin/users", modules: ["auth_admin"] },
  { prefix: "/admin/config", modules: ["system_config"] },
  { prefix: "/admin/loan-types", modules: ["system_config"] },
  { prefix: "/admin/checklists", modules: ["system_config"] },
  { prefix: "/admin/document-templates", modules: ["system_config"] },
  { prefix: "/admin/checks", modules: ["system_config"] },
  { prefix: "/admin/email-test", modules: ["system_config"] },
  { prefix: "/admin/email-templates", modules: ["system_config"] },
  { prefix: "/borrower", modules: ["borrower_portal"] },
  { prefix: "/agent", modules: ["leads"] },
  { prefix: "/csa", modules: ["intake"] },
  { prefix: "/cig", modules: ["verification"] },
  { prefix: "/committee", modules: ["committee"] },
  { prefix: "/lra", modules: ["release_lra"] },
  { prefix: "/ar", modules: ["accounting_ar"] },
  { prefix: "/collector/briefings", modules: ["briefings"] },
  { prefix: "/collector", modules: ["collection"] },
  { prefix: "/remedial", modules: ["remedial"] },
  { prefix: "/reports", modules: ["reports"] },
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns the module permissions required to render a staff portal route.
 * More specific paths must appear before their parent portal rule.
 */
export function getRequiredPageModules(
  pathname: string,
): readonly ModuleSlug[] | null {
  return (
    PAGE_ACCESS_RULES.find((rule) => matchesPrefix(pathname, rule.prefix))
      ?.modules ?? null
  );
}
