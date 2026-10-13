import { auth } from "@/auth";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function parseJson<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
): Promise<T | null> {
  try {
    const input: unknown = await request.json();
    const result = schema.safeParse(input);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
