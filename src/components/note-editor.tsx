"use client";

import { PinIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import type { FolderSummary, NoteDetail } from "@/lib/client-types";
import { MarkdownPreview } from "@/components/markdown-preview";

type SaveState = "saved" | "saving" | "failed";

interface EditorSnapshot {
  title: string;
  contentMarkdown: string;
  folderId: string | null;
  tags: string[];
  isPinned: boolean;
  archived: boolean;
}

async function errorMessage(response: Response): Promise<string> {
  const result: unknown = await response.json().catch(() => null);
  return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
    ? result.error
    : "Your changes could not be saved.";
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const latest = useRef<EditorSnapshot>({
    title: "",
    contentMarkdown: "",
    folderId: null,
    tags: [],
    isPinned: false,
    archived: false,
  });
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saving = useRef(false);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNow = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    saveNow.current = async () => {
      if (!ready.current || saving.current || revision.current === savedRevision.current) return;
      saving.current = true;
      const sentRevision = revision.current;
      const snapshot = { ...latest.current, tags: [...latest.current.tags] };
      setSaveState("saving");
      setSaveError("");
      try {
        const response = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        if (!response.ok) throw new Error(await errorMessage(response));
        const result = (await response.json()) as NoteDetail;
        setNote(result);
        savedRevision.current = sentRevision;
        window.dispatchEvent(new CustomEvent("palace:navigation-changed"));
        if (snapshot.archived !== Boolean(result.archivedAt) || snapshot.archived) {
          router.push("/?view=archived");
        }
        if (revision.current === sentRevision) setSaveState("saved");
      } catch (cause) {
        setSaveState("failed");
        setSaveError(cause instanceof Error ? cause.message : "Your changes could not be saved.");
      } finally {
        saving.current = false;
        if (revision.current > sentRevision) {
          setSaveState("saving");
          timer.current = setTimeout(() => void saveNow.current(), 0);
        }
      }
    };
  }, [noteId, router]);

  useEffect(() => {
    let live = true;
    Promise.all([fetch(`/api/notes/${noteId}`), fetch("/api/folders")])
      .then(async ([noteResponse, folderResponse]) => {
        if (!noteResponse.ok) throw new Error(await errorMessage(noteResponse));
        if (!folderResponse.ok) throw new Error(await errorMessage(folderResponse));
        const [loadedNote, loadedFolders] = await Promise.all([
          noteResponse.json() as Promise<NoteDetail>,
          folderResponse.json() as Promise<FolderSummary[]>,
        ]);
        if (!live) return;
        setNote(loadedNote);
        setFolders(loadedFolders);
        setTitle(loadedNote.title);
        setContentMarkdown(loadedNote.contentMarkdown);
        setFolderId(loadedNote.folderId);
        setTags(loadedNote.tags.map(({ name }) => name));
        setIsPinned(loadedNote.isPinned);
        setArchived(Boolean(loadedNote.archivedAt));
        latest.current = {
          title: loadedNote.title,
          contentMarkdown: loadedNote.contentMarkdown,
          folderId: loadedNote.folderId,
          tags: loadedNote.tags.map(({ name }) => name),
          isPinned: loadedNote.isPinned,
          archived: Boolean(loadedNote.archivedAt),
        };
        ready.current = true;
      })
      .catch((cause: unknown) => {
        if (live) setLoadError(cause instanceof Error ? cause.message : "The note could not be loaded.");
      })
      .finally(() => { if (live) setLoading(false); });
    return () => {
      live = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [noteId]);

  useEffect(() => {
    if (!ready.current) return;
    const unchanged =
      title === latest.current.title &&
      contentMarkdown === latest.current.contentMarkdown &&
      folderId === latest.current.folderId &&
      isPinned === latest.current.isPinned &&
      archived === latest.current.archived &&
      tags.length === latest.current.tags.length &&
      tags.every((tag, index) => tag === latest.current.tags[index]);
    if (unchanged) return;
    latest.current = { title, contentMarkdown, folderId, tags, isPinned, archived };
    revision.current += 1;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow.current(), 800);
  }, [title, contentMarkdown, folderId, tags, isPinned, archived]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (revision.current !== savedRevision.current) {
        void saveNow.current();
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (event.relatedTarget instanceof HTMLElement && event.currentTarget.contains(event.relatedTarget)) return;
    if (revision.current !== savedRevision.current) {
      if (timer.current) clearTimeout(timer.current);
      void saveNow.current();
    }
  }

  function updateTagDraft(value: string) {
    const split = value.split(/[,，]/);
    if (split.length > 1) {
      const added = split.slice(0, -1).map((item) => item.trim()).filter(Boolean);
      if (added.length) setTags((current) => uniqueTags([...current, ...added]));
    }
    setTagDraft(split.at(-1) ?? "");
  }

  function commitTag() {
    if (tagDraft.trim()) setTags((current) => uniqueTags([...current, tagDraft.trim()]));
    setTagDraft("");
  }

  if (loading) return <div className="content-wrap"><div className="loading-state">Opening your note…</div></div>;
  if (loadError || !note) {
    return <div className="content-wrap"><div className="message-error" role="alert">{loadError || "Note not found."}</div><p><Link className="text-button" href="/">← Back to notes</Link></p></div>;
  }

  return (
    <div className="content-wrap" onBlur={onBlur}>
      <div className="editor-wrap">
        <div className="editor-toolbar">
          <div className="editor-toolbar-left">
            <Link className="text-button" href={archived ? "/?view=archived" : "/"}>← Notes</Link>
            <span className={`save-status ${saveState === "saving" ? "saving" : saveState === "failed" ? "failed" : ""}`} aria-live="polite">
              <span className="save-dot" />
              {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "Saved"}
            </span>
            {saveState === "failed" && <button className="text-button" onClick={() => void saveNow.current()}>Retry</button>}
          </div>
          <div className="editor-toolbar-right">
            <select className="editor-select" aria-label="Move note to folder" value={folderId ?? ""} onChange={(event) => setFolderId(event.target.value || null)}>
              <option value="">No folder</option>
              {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
            </select>
            <button className="icon-button" title={isPinned ? "Unpin note" : "Pin note"} aria-label={isPinned ? "Unpin note" : "Pin note"} onClick={() => setIsPinned((value) => !value)}><PinIcon filled={isPinned} /></button>
            <button className="text-button" onClick={() => setArchived((value) => !value)}>{archived ? "Unarchive" : "Archive"}</button>
          </div>
        </div>
        {saveError && saveState === "failed" && <div className="message-error" role="alert" style={{ marginBottom: 14 }}>{saveError}</div>}

        <article className="editor-paper">
          <input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" aria-label="Note title" maxLength={200} />
          <div className="editor-meta">
            <div className="tag-editor" aria-label="Note tags">
              <span aria-hidden="true" className="muted-text">#</span>
              {tags.map((tag) => (
                <button className="card-tag" type="button" key={tag} title={`Remove ${tag}`} onClick={() => setTags((current) => current.filter((value) => value.toLowerCase() !== tag.toLowerCase()))}>
                  {tag} <span aria-hidden="true">×</span>
                </button>
              ))}
              <input className="tag-input" value={tagDraft} onChange={(event) => updateTagDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") { event.preventDefault(); commitTag(); }
                if (event.key === "Backspace" && !tagDraft && tags.length) setTags((current) => current.slice(0, -1));
              }} onBlur={commitTag} placeholder={tags.length ? "Add a tag…" : "Add tags, separated by commas"} aria-label="Add tags" />
            </div>
            <button className={`text-button${preview ? " selected" : ""}`} onClick={() => setPreview((value) => !value)}>{preview ? "Write" : "Preview"}</button>
          </div>
          {preview ? (
            <MarkdownPreview content={contentMarkdown} wikilinks={note.wikilinks} />
          ) : (
            <textarea className="markdown-textarea" value={contentMarkdown} onChange={(event) => setContentMarkdown(event.target.value)} placeholder="Start with a thought…&#10;&#10;Write in Markdown. Link a note with [[its title]]." aria-label="Markdown note content" maxLength={100_000} />
          )}
        </article>

        <section className="backlinks">
          <h2>Linked mentions · {note.backlinks.length}</h2>
          {note.backlinks.length ? (
            <div className="backlink-list">{note.backlinks.map((backlink) => <Link className="backlink" href={`/notes/${backlink.id}`} key={backlink.id}>{backlink.title.trim() || "Untitled note"}</Link>)}</div>
          ) : (
            <span className="muted-text">Notes that link here will appear in this space.</span>
          )}
        </section>
      </div>
    </div>
  );
}

function uniqueTags(values: string[]): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const cleaned = value.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();
    if (cleaned && !names.has(key)) names.set(key, cleaned);
  }
  return [...names.values()];
}
