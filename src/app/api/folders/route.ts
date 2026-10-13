import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserId, jsonError, parseJson } from "@/lib/http";
import { folderCreateSchema } from "@/lib/validation";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return jsonError("Sign in to view folders.", 401);

  try {
    const folders = await prisma.folder.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { notes: true } } },
    });
    return Response.json(folders);
  } catch (error) {
    console.error("Folder list failed", error);
    return jsonError("Folders could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return jsonError("Sign in to create folders.", 401);
  const data = await parseJson(request, folderCreateSchema);
  if (!data) return jsonError("Enter a folder name up to 80 characters.", 400);

  try {
    const folder = await prisma.folder.create({
      data: { userId, name: data.name },
      select: { id: true, name: true },
    });
    return Response.json(folder, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return jsonError("A folder with this name already exists.", 409);
    }
    console.error("Folder creation failed", error);
    return jsonError("The folder could not be created.", 500);
  }
}
