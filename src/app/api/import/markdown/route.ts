import { getAuthenticatedUserId, jsonError } from "@/lib/http";
import { IMPORT_LIMITS, MarkdownImportError, validateMarkdownImport } from "@/lib/markdown-import";
import { importMarkdown } from "@/lib/import-markdown-server";

export async function POST(request: Request) {
	const userId = await getAuthenticatedUserId();
	if (!userId) return jsonError("Sign in to import notes.", 401);
	// JSON + same-origin checks prevent a third-party site from issuing cookie-authenticated imports.
	const origin = request.headers.get("origin");
	if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
		return jsonError("Import from your Palace workspace.", 403);
	if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
		return jsonError("Send a JSON import.", 415);
	if (Number(request.headers.get("content-length")) > IMPORT_LIMITS.requestBytes)
		return jsonError("The import is too large. Import at most 2 MB of Markdown at a time.", 413);
	try {
		// Bound streamed bodies too: Content-Length is optional and cannot be trusted.
		const reader = request.body?.getReader();
		if (!reader) throw new MarkdownImportError("The import is empty.");
		const chunks: Uint8Array[] = [];
		let size = 0;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > IMPORT_LIMITS.requestBytes) {
					await reader.cancel();
					throw new MarkdownImportError(
						"The import is too large. Import at most 2 MB of Markdown at a time.",
						413,
					);
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		let payload: unknown;
		try {
			payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		} catch {
			throw new MarkdownImportError("The import must contain valid JSON and UTF-8 text.");
		}
		const input = validateMarkdownImport(payload);
		const result = await importMarkdown(userId, input);
		return Response.json({ ...result, skipped: input.skipped }, { status: 201 });
	} catch (error) {
		if (error instanceof MarkdownImportError) return jsonError(error.message, error.status);
		console.error("Markdown import failed", error);
		return jsonError("Nothing was imported. The import could not be completed.", 500);
	}
}
