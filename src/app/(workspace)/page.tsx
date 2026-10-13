import { NotesPage } from "@/components/notes-page";

interface PageProps {
	searchParams: Promise<{ view?: string; folder?: string; tag?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
	const params = await searchParams;
	const view = ["all", "pinned", "archived"].includes(params.view ?? "")
		? (params.view as "all" | "pinned" | "archived")
		: "all";
	return <NotesPage view={view} folderId={params.folder ?? null} tag={params.tag ?? null} />;
}
