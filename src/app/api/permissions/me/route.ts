import { NextResponse } from "next/server";

import {
  AuthError,
  getUserPermissions,
  toJsonError,
} from "@/lib/permissions/server";

export async function GET() {
  try {
    const permissions = await getUserPermissions();
    return NextResponse.json(permissions);
  } catch (error) {
    if (error instanceof AuthError) {
      return toJsonError(error, 401);
    }
    return toJsonError(error, 500);
  }
}
