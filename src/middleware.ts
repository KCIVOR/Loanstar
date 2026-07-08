import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const ADMIN_PREFIX = "/admin";
const BORROWER_PREFIX = "/borrower";
const AGENT_PREFIX = "/agent";
const CSA_PREFIX = "/csa";
const CIG_PREFIX = "/cig";
const COMMITTEE_PREFIX = "/committee";
const LRA_PREFIX = "/lra";
const AR_PREFIX = "/ar";
const COLLECTOR_PREFIX = "/collector";
const REMEDIAL_PREFIX = "/remedial";
const REPORTS_PREFIX = "/reports";
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

function resolveAuthedRedirect(request: NextRequest): string {
  const redirect = request.nextUrl.searchParams.get("redirect");
  if (redirect && redirect.startsWith("/")) {
    return redirect;
  }
  return ADMIN_PREFIX;
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (pathname === "/signup") {
    const registerUrl = request.nextUrl.clone();
    registerUrl.pathname = "/borrower/register";
    registerUrl.search = "";
    return NextResponse.redirect(registerUrl);
  }

  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isBorrowerRoute =
    pathname.startsWith(BORROWER_PREFIX) &&
    !pathname.startsWith("/borrower/register");
  const isAgentRoute = pathname.startsWith(AGENT_PREFIX);
  const isCsaRoute = pathname.startsWith(CSA_PREFIX);
  const isCigRoute = pathname.startsWith(CIG_PREFIX);
  const isCommitteeRoute = pathname.startsWith(COMMITTEE_PREFIX);
  const isLraRoute = pathname.startsWith(LRA_PREFIX);
  const isArRoute = pathname.startsWith(AR_PREFIX);
  const isCollectorRoute = pathname.startsWith(COLLECTOR_PREFIX);
  const isRemedialRoute = pathname.startsWith(REMEDIAL_PREFIX);
  const isReportsRoute = pathname.startsWith(REPORTS_PREFIX);
  const isProtectedPortal =
    isAdminRoute ||
    isBorrowerRoute ||
    isAgentRoute ||
    isCsaRoute ||
    isCigRoute ||
    isCommitteeRoute ||
    isLraRoute ||
    isArRoute ||
    isCollectorRoute ||
    isRemedialRoute ||
    isReportsRoute;

  if (isProtectedPortal && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute(pathname) && user) {
    const target = resolveAuthedRedirect(request);
    const destUrl = request.nextUrl.clone();
    destUrl.pathname = target;
    destUrl.search = "";
    return NextResponse.redirect(destUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
