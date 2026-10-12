import { NextResponse } from "next/server";
import { authenticatedUser, errorResponse, unauthorizedResponse } from "@/lib/api";
import { createFolder } from "@/lib/notes";

export async function POST(request: Request) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    return NextResponse.json(await createFolder(user.id, await request.json()), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
