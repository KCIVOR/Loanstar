export type NavChildMatch = {
  href: string;
  /** Match only this path plus any `matchPrefixes`. */
  exact?: boolean;
  /** Extra path prefixes that count as active for this child. */
  matchPrefixes?: string[];
};

function isWithinPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Length of the prefix a child matched, or -1 when it does not match. Longer
 * means more specific, which is how nested siblings such as `/collector/dcr`
 * and `/collector/dcr/history` are told apart.
 */
function matchLength(pathname: string, child: NavChildMatch) {
  const prefixes = child.matchPrefixes ?? [];
  if (child.exact) {
    if (pathname === child.href) return child.href.length;
  } else if (isWithinPath(pathname, child.href)) {
    return child.href.length;
  }

  let best = -1;
  for (const prefix of prefixes) {
    if (isWithinPath(pathname, prefix) && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}

/** Href of the single child that should be highlighted, or null when none. */
export function resolveActiveChildHref(
  pathname: string,
  children: NavChildMatch[],
): string | null {
  let activeHref: string | null = null;
  let best = -1;

  for (const child of children) {
    const length = matchLength(pathname, child);
    if (length > best) {
      best = length;
      activeHref = child.href;
    }
  }

  return best >= 0 ? activeHref : null;
}
