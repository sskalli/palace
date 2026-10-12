import { auth } from "@/lib/auth";
import type { User } from "better-auth";
import { NextResponse } from "next/server";

export async function authenticatedUser(headers: Headers): Promise<User | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (error instanceof Error && "code" in error && error.code === "P2002") {
    return NextResponse.json(
      { error: "That name is already in use." },
      { status: 409 },
    );
  }
  if (error instanceof Error && "status" in error) {
    const status = Number(error.status);
    if (status >= 400 && status < 500) {
      return NextResponse.json({ error: error.message }, { status });
    }
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }
  console.error("Palace API error:", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}
