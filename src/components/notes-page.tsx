"use client";

import { FolderIcon, PinIcon } from "@/components/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { NoteSummary } from "@/lib/client-types";

interface NotesPageProps {
  view: "all" | "pinned" | "archived";
  folderId: string | null;
  tag: string | null;
}

const headings = {
  all: ["All notes", "Everything you have collected, in one place."],
  pinned: ["Pinned notes", "The notes you want close at hand."],
  archived: ["Archived", "Notes set aside, still here when you need them."],
};

export function NotesPage({ view, folderId, tag }: NotesPageProps) {
  const [result, setResult] = useState<{
    key: string;
    notes: NoteSummary[];
    error: string;
    nextCursor: string | null;
  }>({
    key: "",
    notes: [],
    error: "",
    nextCursor: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const requestKey = `${view}:${folderId ?? ""}:${tag ?? ""}`;
  const loading = result.key !== requestKey;
  const notes = loading ? [] : result.notes;
  const error = loading ? "" : result.error;

  useEffect(() => {
    const params = new URLSearchParams({ view });
    if (folderId) params.set("folderId", folderId);
    if (tag) params.set("tag", tag);
    let live = true;
    fetch(`/api/notes?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          const result: unknown = await response.json().catch(() => null);
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Notes could not be loaded.";
          throw new Error(message);
        }
        return response.json() as Promise<{ notes: NoteSummary[]; nextCursor: string | null }>;
      })
      .then((page) => {
        if (live) setResult({ key: requestKey, notes: page.notes, nextCursor: page.nextCursor, error: "" });
      })
      .catch((cause: unknown) => {
        if (live) setResult({
          key: requestKey,
          notes: [],
          nextCursor: null,
          error: cause instanceof Error ? cause.message : "Notes could not be loaded.",
        });
      });
    return () => { live = false; };
  }, [view, folderId, tag, requestKey]);

  async function loadMore() {
    if (!result.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ view, cursor: result.nextCursor });
    if (folderId) params.set("folderId", folderId);
    if (tag) params.set("tag", tag);
    try {
      const response = await fetch(`/api/notes?${params}`);
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "More notes could not be loaded.";
        throw new Error(message);
      }
      const page = await response.json() as { notes: NoteSummary[]; nextCursor: string | null };
      setResult((current) => current.key === requestKey
        ? {
            ...current,
            notes: [...current.notes, ...page.notes],
            nextCursor: page.nextCursor,
            error: "",
          }
        : current);
    } catch (cause) {
      setResult((current) => current.key === requestKey
        ? { ...current, error: cause instanceof Error ? cause.message : "More notes could not be loaded." }
        : current);
    } finally {
      setLoadingMore(false);
    }
  }

  const [title, subtitle] = headings[view];
  return (
    <div className="content-wrap">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Your workspace{tag ? ` · #${tag}` : ""}</div>
          <h1 className="page-title">{tag ? `# ${tag}` : title}</h1>
          <p className="page-subtitle">{tag ? `Notes tagged “${tag}”.` : subtitle}</p>
        </div>
        <span className="count-label">{!loading && `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}</span>
      </div>

      {error && <div className="message-error" role="alert">{error}</div>}
      {loading ? (
        <div className="note-list" aria-label="Loading notes"><div className="skeleton" /><div className="skeleton" /></div>
      ) : notes.length ? (
        <div className="note-list">
          {notes.map((note) => (
            <Link className="note-card" href={`/notes/${note.id}`} key={note.id}>
              <div className="note-card-head">
                <h2 className="note-card-title">{note.title}</h2>
                {note.isPinned && <span className="pin-mark" title="Pinned"><PinIcon size={13} filled /></span>}
              </div>
              <p className="note-preview">{note.preview || "No content yet. Open this note to add your thoughts."}</p>
              <div className="note-card-foot">
                <span className="folder-label"><FolderIcon size={12} />{note.folder?.name ?? "No folder"}</span>
                <div className="card-tags">{note.tags.slice(0, 2).map((item) => <span className="card-tag" key={item.id}>{item.name}</span>)}</div>
                <span className="updated-label">{formatDate(note.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : !error ? (
        <div className="empty-state">
          <div className="empty-icon">✧</div>
          <h2>{view === "archived" ? "Nothing archived" : view === "pinned" ? "No pinned notes yet" : tag ? "No notes with this tag" : "A little room for a new thought"}</h2>
          <p>{view === "archived" ? "When you archive a note, it will be tucked away here." : tag ? "Add this tag to a note and it will show up here." : "Capture an idea, a reminder, or anything you want to remember."}</p>
          {view !== "archived" && <button className="primary-button" onClick={() => window.dispatchEvent(new CustomEvent("palace:new-note"))}>＋ Create a note</button>}
        </div>
      ) : null}
      {!loading && notes.length > 0 && result.nextCursor && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button className="text-button" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more notes"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}
