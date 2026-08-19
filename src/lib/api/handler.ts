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
  return toJsonError(error, 500);
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
