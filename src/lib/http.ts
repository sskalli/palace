import { cache } from "react";
import { auth } from "@/auth";

/** The session, decoded once per server render (layout, page and metadata share it). */
export const getSession = cache(() => auth());

export async function getAuthenticatedUserId(): Promise<string | null> {
	const session = await getSession();
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
