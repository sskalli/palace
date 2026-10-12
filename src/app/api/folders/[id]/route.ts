import { NextResponse } from "next/server";
import { authenticatedUser, errorResponse, unauthorizedResponse } from "@/lib/api";
import { deleteFolder, renameFolder } from "@/lib/notes";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    const { id } = await context.params;
    return NextResponse.json(
      await renameFolder(user.id, id, await request.json()),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    const { id } = await context.params;
    return NextResponse.json(await deleteFolder(user.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
