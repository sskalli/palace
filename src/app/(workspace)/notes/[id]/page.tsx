import { NoteEditor } from "@/components/note-editor";

// The editor sets the document title once the note is loaded, so no server-side title lookup is needed.
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <NoteEditor key={id} noteId={id} />;
}
