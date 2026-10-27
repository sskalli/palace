import type { Metadata } from "next";
import { getSession } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotesPage } from "@/components/notes-page";

interface PageProps {
	searchParams: Promise<{ view?: string; folder?: string; tag?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
	const { folder: id } = await searchParams;
	if (!id) return {};
	const session = await getSession();
	if (!session?.user?.id) return {};
	const folder = await prisma.folder.findFirst({
		where: { id, userId: session.user.id },
		select: { name: true },
	});
	return folder ? { title: folder.name } : {};
}

export default async function HomePage({ searchParams }: PageProps) {
	const params = await searchParams;
	const view = ["all", "pinned", "archived"].includes(params.view ?? "")
		? (params.view as "all" | "pinned" | "archived")
		: "all";
	return <NotesPage view={view} folderId={params.folder ?? null} tag={params.tag ?? null} />;
}
