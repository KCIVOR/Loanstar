/** Recovery and verification must remain reachable even with an existing session. */
export function shouldRedirectAuthenticatedUser(pathname: string) {
  return ["/login", "/register", "/signup", "/forgot-password"].includes(pathname);
}
