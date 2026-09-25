import { NextResponse } from "next/server";

import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  toJsonError,
} from "@/lib/permissions/server";

export { ValidationError } from "./errors";
import { ValidationError } from "./errors";

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) return toJsonError(error, 401);
  if (error instanceof ForbiddenError) return toJsonError(error, 403);
  if (error instanceof NotFoundError) return toJsonError(error, 404);
  if (error instanceof ValidationError) return toJsonError(error, 400);
  // Unexpected (500) errors were previously swallowed into a generic JSON
  // response with no server-side trace — log the real error/stack here so
  // it actually shows up in the dev server terminal.
  console.error(error);
  return toJsonError(error, 500);
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
