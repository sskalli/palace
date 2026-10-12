import { NextResponse } from "next/server";
import { authenticatedUser, errorResponse, unauthorizedResponse } from "@/lib/api";
import { getNoteDetails, updateNote } from "@/lib/notes";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    const { id } = await context.params;
    return NextResponse.json(await getNoteDetails(user.id, id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    const { id } = await context.params;
    return NextResponse.json(
      await updateNote(user.id, id, await request.json()),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
