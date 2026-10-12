import { NextResponse } from "next/server";
import { authenticatedUser, errorResponse, unauthorizedResponse } from "@/lib/api";
import { createNote, getDashboard } from "@/lib/notes";

export async function GET(request: Request) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    return NextResponse.json(
      await getDashboard(user.id, new URL(request.url).searchParams),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser(request.headers);
  if (!user) return unauthorizedResponse();
  try {
    return NextResponse.json(await createNote(user.id, await request.json()), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
