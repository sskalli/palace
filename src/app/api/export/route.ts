import JSZip from "jszip";
import { authenticatedUser, errorResponse, unauthorizedResponse } from "@/lib/api";
import { getExportNotes } from "@/lib/notes";
import { makeMarkdownExport } from "@/lib/markdown-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    const archive = new JSZip();
    for (const entry of makeMarkdownExport(await getExportNotes(user.id))) {
      archive.file(entry.path, entry.content);
    }
    const bytes = await archive.generateAsync({ type: "uint8array" });
    return new Response(new Blob([new Uint8Array(bytes)]), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="palace-export.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
