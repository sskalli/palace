import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_LIMITS, MarkdownImportError } from "@/lib/markdown-import";
const mocks = vi.hoisted(() => ({ userId: vi.fn(), import: vi.fn() }));
vi.mock("@/lib/http", () => ({
	getAuthenticatedUserId: mocks.userId,
	jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/import-markdown-server", () => ({ importMarkdown: mocks.import }));
import { POST } from "./route";
const body = { folderId: "destination", files: [{ path: ["Work", "Note.md"], content: "# hello" }] };
const request = (data: unknown = body, headers = {}) =>
	new Request("https://palace.test/api/import/markdown", {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: "https://palace.test", ...headers },
		body: JSON.stringify(data),
	});
beforeEach(() => {
	vi.resetAllMocks();
	mocks.userId.mockResolvedValue("owner");
	mocks.import.mockResolvedValue({ notes: 1, folders: 1, skipped: 0 });
});
describe("Markdown import endpoint", () => {
	it("requires authentication before importing", async () => {
		mocks.userId.mockResolvedValue(null);
		expect((await POST(request())).status).toBe(401);
		expect(mocks.import).not.toHaveBeenCalled();
	});
	it("rejects cross-origin and non-JSON requests", async () => {
		expect((await POST(request(body, { Origin: "https://evil.test" }))).status).toBe(403);
		expect((await POST(request(body, { "Sec-Fetch-Site": "cross-site" }))).status).toBe(403);
		expect((await POST(request(body, { "Content-Type": "text/plain" }))).status).toBe(415);
		expect(mocks.import).not.toHaveBeenCalled();
	});
	it("rejects invalid paths before writes and maps forbidden destinations", async () => {
		expect((await POST(request({ ...body, files: [{ path: ["..", "Note.md"], content: "" }] }))).status).toBe(400);
		expect(mocks.import).not.toHaveBeenCalled();
		mocks.import.mockRejectedValue(new MarkdownImportError("Choose an owned folder.", 404));
		expect((await POST(request())).status).toBe(404);
	});
	it("bounds declared and actual body size, even without Content-Length", async () => {
		expect((await POST(request(body, { "Content-Length": String(IMPORT_LIMITS.requestBytes + 1) }))).status).toBe(
			413,
		);
		const large = new Request("https://palace.test/api/import/markdown", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "x".repeat(IMPORT_LIMITS.requestBytes + 1),
		});
		expect((await POST(large)).status).toBe(413);
		expect(mocks.import).not.toHaveBeenCalled();
	});
	it("returns an import summary and uses only the authenticated owner", async () => {
		const response = await POST(request());
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ notes: 1, folders: 1, skipped: 0 });
		expect(mocks.import).toHaveBeenCalledWith("owner", expect.objectContaining(body));
	});
});
