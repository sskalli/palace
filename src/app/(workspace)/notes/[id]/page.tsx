import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NoteEditor } from "@/components/note-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
	const { id } = await params;
	const session = await auth();
	if (!session?.user?.id) return {};
	const note = await prisma.note.findFirst({ where: { id, userId: session.user.id }, select: { title: true } });
	return { title: note?.title.trim() || "Untitled note" };
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <NoteEditor noteId={id} />;
}
