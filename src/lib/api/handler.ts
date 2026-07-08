import { NextResponse } from "next/server";

import {
  AuthError,
  ForbiddenError,
  toJsonError,
} from "@/lib/permissions/server";

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) return toJsonError(error, 401);
  if (error instanceof ForbiddenError) return toJsonError(error, 403);
  return toJsonError(error, 500);
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
