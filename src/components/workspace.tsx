"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authClient } from "@/lib/auth-client";

type Folder = { id: string; name: string; kind: "INBOX" | "NORMAL" };
type Tag = { id: string; name: string };
type ListNote = {
  id: string;
  title: string;
  preview: string;
  isPinned: boolean;
  updatedAt: string;
  folder: { id: string; name: string } | null;
  tags: Tag[];
};
type NoteDetails = {
  id: string;
  title: string;
  contentMarkdown: string;
  isPinned: boolean;
  archivedAt: string | null;
  updatedAt: string;
  folderId: string | null;
  folder: { id: string; name: string } | null;
  tags: Tag[];
  outgoingLinks: {
    rawTargetTitle: string;
    targetNote: { id: string; title: string } | null;
  }[];
  backlinks: { id: string; title: string; updatedAt: string }[];
};
type Dashboard = { notes: ListNote[]; folders: Folder[]; tags: Tag[] };
type View = "inbox" | "all" | "pinned" | "archived";
type Patch = {
  title?: string;
  contentMarkdown?: string;
  folderId?: string;
  isPinned?: boolean;
  archived?: boolean;
  tags?: string[];
};
type UserInfo = { name: string; email: string };

const headings: Record<View, string> = {
  inbox: "Inbox",
  all: "All notes",
  pinned: "Pinned",
  archived: "Archived",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function markdownWithLinks(note: NoteDetails) {
  return note.contentMarkdown.replace(/\[\[([^\]\n]+)\]\]/g, (match, raw) => {
    const target = raw.trim();
    const found = note.outgoingLinks.find(
      (link) =>
        link.rawTargetTitle.toLocaleLowerCase() === target.toLocaleLowerCase(),
    );
    return found?.targetNote
      ? `[${target}](palace-note:${found.targetNote.id})`
      : `\\[\\[${target.replace(/[\]\\]/g, "\\$&")}\\]\\]`;
  });
}

async function responseError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Something went wrong. Please try again.";
}

export function Workspace({ user }: { user: UserInfo }) {
  const [dashboard, setDashboard] = useState<Dashboard>({
    notes: [],
    folders: [],
    tags: [],
  });
  const [view, setView] = useState<View>("inbox");
  const [activeTag, setActiveTag] = useState("");
  const [query, setQuery] = useState("");
  const [activeNote, setActiveNote] = useState<NoteDetails | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [noteLoading, setNoteLoading] = useState(false);
  const [saving, setSaving] = useState<"saved" | "saving" | "failed">("saved");
  const [error, setError] = useState("");
  const [tagText, setTagText] = useState("");
  const [preview, setPreview] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const pendingPatches = useRef(new Map<string, Patch>());
  const savingRequest = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAgain = useRef(false);
  const selectedId = useRef("");
  const queryRef = useRef(query);

  queryRef.current = query;
  const refreshDashboard = useCallback(async () => {
    const params = new URLSearchParams({ view });
    if (queryRef.current.trim()) {
      params.set("q", queryRef.current.trim());
      params.set("view", "all");
    }
    if (activeTag) params.set("tag", activeTag);
    const response = await fetch(`/api/notes?${params}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 401) window.location.reload();
      throw new Error(await responseError(response));
    }
    setDashboard((await response.json()) as Dashboard);
  }, [activeTag, view]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ view });
    if (query.trim()) {
      params.set("q", query.trim());
      params.set("view", "all");
    }
    if (activeTag) params.set("tag", activeTag);
    fetch(`/api/notes?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return (await response.json()) as Dashboard;
      })
      .then((data) => {
        if (alive) {
          setDashboard(data);
          setError("");
        }
      })
      .catch((reason: Error) => alive && setError(reason.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [view, activeTag, query]);

  const loadNote = useCallback(async (id: string) => {
    setNoteLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const note = (await response.json()) as NoteDetails;
      if (selectedId.current === id) {
        setActiveNote(note);
        setTagText(note.tags.map((tag) => tag.name).join(", "));
        setPreview(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load note.");
    } finally {
      setNoteLoading(false);
    }
  }, []);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (savingRequest.current) {
      saveAgain.current = true;
      return;
    }
    const next = pendingPatches.current.entries().next();
    if (next.done) return;
    const [id, changes] = next.value;
    pendingPatches.current.delete(id);
    savingRequest.current = true;
    saveAgain.current = false;
    let failed = false;
    setSaving("saving");
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const saved = (await response.json()) as NoteDetails;
      if (selectedId.current === id) {
        setActiveNote((current) => {
          if (!current) return current;
          return {
            ...current,
            folder: saved.folder,
            folderId: saved.folderId,
            tags: saved.tags,
            outgoingLinks: saved.outgoingLinks,
            backlinks: saved.backlinks,
            updatedAt: saved.updatedAt,
          };
        });
        setSaving("saved");
      }
      try {
        await refreshDashboard();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to refresh notes.");
      }
    } catch (reason) {
      failed = true;
      pendingPatches.current.set(id, {
        ...changes,
        ...pendingPatches.current.get(id),
      });
      setSaving("failed");
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      savingRequest.current = false;
      if (!failed && (pendingPatches.current.size || saveAgain.current)) {
        saveAgain.current = false;
        saveTimer.current = setTimeout(() => void flushSave(), 0);
      } else if (!failed) setSaving("saved");
    }
  }, [refreshDashboard]);

  const queueSave = useCallback(
    (patch: Patch, delay = 800) => {
      const id = selectedId.current;
      if (!id) return;
      pendingPatches.current.set(id, {
        ...pendingPatches.current.get(id),
        ...patch,
      });
      setSaving("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushSave(), delay);
    },
    [flushSave],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const selectNote = useCallback(
    (id: string) => {
      if (id === selectedId.current) return;
      void flushSave();
      setActiveNote(null);
      selectedId.current = id;
      setSelectedNoteId(id);
      setMobileMenuOpen(false);
      void loadNote(id);
    },
    [flushSave, loadNote],
  );

  async function createNote() {
    setError("");
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    const note = (await response.json()) as { id: string };
    setView("inbox");
    setActiveTag("");
    setQuery("");
    await refreshDashboard();
    selectNote(note.id);
  }

  async function createFolder() {
    const name = window.prompt("Name your folder");
    if (!name?.trim()) return;
    const response = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    await refreshDashboard();
  }

  async function manageFolder(folder: Folder) {
    if (folder.kind === "INBOX") return;
    const action = window.prompt(
      `Folder: ${folder.name}\nEnter a new name to rename, or type "delete" to move its notes to Inbox and remove it.`,
    );
    if (action === null) return;
    const response =
      action.trim().toLocaleLowerCase() === "delete"
        ? await fetch(`/api/folders/${folder.id}`, { method: "DELETE" })
        : await fetch(`/api/folders/${folder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: action }),
          });
    if (!response.ok) setError(await responseError(response));
    else await refreshDashboard();
  }

  function updateTitle(title: string) {
    setActiveNote((note) => (note ? { ...note, title } : note));
    queueSave({ title });
  }

  function updateBody(contentMarkdown: string) {
    setActiveNote((note) => (note ? { ...note, contentMarkdown } : note));
    queueSave({ contentMarkdown });
  }

  function updateFolder(folderId: string) {
    setActiveNote((note) => {
      if (!note) return note;
      const folder = dashboard.folders.find((item) => item.id === folderId);
      return { ...note, folderId, folder: folder ? { id: folder.id, name: folder.name } : null };
    });
    queueSave({ folderId });
  }

  function updateTags(value: string) {
    setTagText(value);
    const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
    queueSave({ tags });
  }

  const renderedMarkdown = useMemo(
    () => (activeNote ? markdownWithLinks(activeNote) : ""),
    [activeNote],
  );

  const listHeading = query.trim()
    ? `Search results`
    : activeTag
      ? dashboard.tags.find((tag) => tag.id === activeTag)?.name ?? "Tag"
      : folderFilter
        ? dashboard.folders.find((folder) => folder.id === folderFilter)?.name ?? "Folder"
        : headings[view];
  const visibleNotes = folderFilter
    ? dashboard.notes.filter((note) => note.folder?.id === folderFilter)
    : dashboard.notes;

  function chooseView(next: View) {
    void flushSave();
    setView(next);
    setActiveTag("");
    setFolderFilter("");
    setMobileMenuOpen(false);
  }

  function backToList() {
    void flushSave();
    setActiveNote(null);
    setSelectedNoteId("");
    selectedId.current = "";
  }

  function chooseTag(id: string) {
    void flushSave();
    setActiveTag(id === activeTag ? "" : id);
    setFolderFilter("");
    setMobileMenuOpen(false);
  }

  async function signOut() {
    await authClient.signOut();
    window.location.reload();
  }

  const sidebar = (
    <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-top">
        <a className="brand" href="/" aria-label="Palace home">
          <span className="brand-mark small">P</span>
          <span>palace</span>
        </a>
        <button
          className="icon-button mobile-close"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
        >
          ×
        </button>
      </div>
      <button className="primary-button new-note-button" onClick={() => void createNote()}>
        <span aria-hidden="true">＋</span> New note
        <span className="shortcut">⌘ N</span>
      </button>
      <nav className="nav-group" aria-label="Notes">
        {(["inbox", "all", "pinned", "archived"] as const).map((item) => (
          <button
            key={item}
            className={`nav-item ${!activeTag && !folderFilter && view === item ? "selected" : ""}`}
            onClick={() => chooseView(item)}
          >
            <span className="nav-icon">
              {item === "inbox" ? "▱" : item === "all" ? "▤" : item === "pinned" ? "⌑" : "▣"}
            </span>
            {headings[item]}
          </button>
        ))}
      </nav>
      <section className="sidebar-section">
        <div className="section-heading">
          <span>Folders</span>
          <button className="small-icon-button" onClick={() => void createFolder()} aria-label="Create folder">＋</button>
        </div>
        {dashboard.folders.map((folder) => (
          <div
            className={`nav-item-row ${folderFilter === folder.id ? "selected" : ""}`}
            key={folder.id}
          >
            <button
              className="nav-item folder-item"
              onClick={() => {
                setView("all");
                setActiveTag("");
                setFolderFilter(folder.id);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon">{folder.kind === "INBOX" ? "▱" : "▰"}</span>
              <span className="truncate">{folder.name}</span>
            </button>
            {folder.kind === "NORMAL" && (
              <button
                className="small-icon-button folder-more"
                aria-label={`Manage ${folder.name}`}
                onClick={() => void manageFolder(folder)}
              >
                ···
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="sidebar-section tag-section">
        <div className="section-heading"><span>Tags</span></div>
        {dashboard.tags.length ? dashboard.tags.map((tag) => (
          <button
            key={tag.id}
            className={`nav-item tag-item ${activeTag === tag.id ? "selected" : ""}`}
            onClick={() => chooseTag(tag.id)}
          >
            <span className="tag-dot">#</span>{tag.name}
          </button>
        )) : <p className="sidebar-hint">Add tags while editing a note.</p>}
      </section>
      <div className="sidebar-bottom">
        <a className="nav-item export-link" href="/api/export">
          <span className="nav-icon">⇩</span> Export Markdown
        </a>
        <div className="account-row">
          <div className="avatar">{(user.name || user.email).charAt(0).toUpperCase()}</div>
          <div className="account-copy">
            <strong>{user.name || "Your account"}</strong>
            <span>{user.email}</span>
          </div>
          <button className="small-icon-button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">↗</button>
        </div>
      </div>
    </aside>
  );

  return (
    <main className={`workspace ${selectedNoteId ? "note-open" : ""}`}>
      {sidebar}
      {mobileMenuOpen && <button className="mobile-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />}
      <section className="notes-column">
        <header className="list-header">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation">☰</button>
          <div>
            <p className="eyebrow">YOUR SPACE</p>
            <h1>{listHeading}</h1>
          </div>
          <button
            className={`icon-button search-toggle ${searchOpen ? "active" : ""}`}
            onClick={() => {
              setSearchOpen((open) => !open);
              setQuery("");
            }}
            aria-label="Search notes"
          >⌕</button>
        </header>
        {(searchOpen || query) && (
          <label className="search-box">
            <span>⌕</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setFolderFilter("");
                if (event.target.value) setActiveTag("");
              }}
              placeholder="Search your notes"
            />
            {query && <button className="small-icon-button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
          </label>
        )}
        <div className="notes-list">
          {error && <div className="inline-error" role="alert">{error}</div>}
          {loading ? (
            <div className="list-state">Gathering your notes…</div>
          ) : visibleNotes.length ? (
            visibleNotes.map((note) => (
              <button
                key={note.id}
                className={`note-card ${activeNote?.id === note.id ? "note-card-active" : ""}`}
                onClick={() => selectNote(note.id)}
              >
                <span className="note-card-heading">
                  <strong>{note.title}</strong>
                  {note.isPinned && <span className="pin-mark" aria-label="Pinned">⌑</span>}
                </span>
                <span className="note-preview">{note.preview || "A blank page, ready when you are."}</span>
                <span className="note-card-meta">
                  <span>{note.folder?.name ?? "No folder"}</span>
                  <span>{dateLabel(note.updatedAt)}</span>
                </span>
                {note.tags.length > 0 && <span className="note-card-tags">{note.tags.slice(0, 3).map((tag) => `#${tag.name}`).join("  ")}</span>}
              </button>
            ))
          ) : (
            <div className="empty-list">
              <span className="empty-icon">✳</span>
              <strong>{query ? "Nothing found" : "A little room to think"}</strong>
              <p>{query ? "Try another title or phrase." : "Create a note and let the ideas begin."}</p>
              {!query && <button className="text-button" onClick={() => void createNote()}>Write your first note →</button>}
            </div>
          )}
        </div>
        <div className="list-footer">{visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}</div>
      </section>
      <section className="editor-column">
        {activeNote ? (
          <>
            <header className="editor-toolbar">
              <div className="toolbar-left">
                <button className="icon-button editor-back-button" onClick={backToList} aria-label="Back to notes">←</button>
                <span className="save-indicator">
                  <span className={`save-dot ${saving}`} />
                  {saving === "saving" ? "Saving…" : saving === "failed" ? "Save failed" : "Saved"}
                </span>
                {saving === "failed" && <button className="text-button retry-button" onClick={() => void flushSave()}>Retry</button>}
              </div>
              <div className="toolbar-right">
                <button className="toolbar-button" onClick={() => void flushSave()} title="Save now">↥ <span>Save</span></button>
                <button
                  className={`toolbar-button ${activeNote.isPinned ? "toolbar-selected" : ""}`}
                  onClick={() => {
                    const isPinned = !activeNote.isPinned;
                    setActiveNote({ ...activeNote, isPinned });
                    queueSave({ isPinned }, 0);
                  }}
                  title={activeNote.isPinned ? "Unpin note" : "Pin note"}
                >⌑ <span>{activeNote.isPinned ? "Pinned" : "Pin"}</span></button>
                <button
                  className="toolbar-button"
                  onClick={() => {
                    const archived = !activeNote.archivedAt;
                    setActiveNote({ ...activeNote, archivedAt: archived ? new Date().toISOString() : null });
                    queueSave({ archived }, 0);
                  }}
                >{activeNote.archivedAt ? "↶" : "▣"} <span>{activeNote.archivedAt ? "Unarchive" : "Archive"}</span></button>
              </div>
            </header>
            {noteLoading ? <div className="editor-empty">Opening note…</div> : (
              <article className="note-editor">
                <div className="note-meta-line">
                  <span>{activeNote.folder?.name ?? "No folder"}</span>
                  <span>·</span>
                  <span>Edited {dateLabel(activeNote.updatedAt)}</span>
                </div>
                <input
                  className="title-input"
                  value={activeNote.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  onBlur={() => void flushSave()}
                  placeholder="Untitled"
                  maxLength={200}
                  aria-label="Note title"
                />
                <div className="editor-options">
                  <select
                    aria-label="Folder"
                    value={activeNote.folderId ?? ""}
                    onChange={(event) => updateFolder(event.target.value)}
                  >
                    {dashboard.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                  <label className="tag-input-wrap">
                    <span>#</span>
                    <input
                      value={tagText}
                      onChange={(event) => updateTags(event.target.value)}
                      onBlur={() => void flushSave()}
                      placeholder="Add tags, separated by commas"
                      aria-label="Tags"
                    />
                  </label>
                  <div className="preview-switch">
                    <button className={!preview ? "active" : ""} onClick={() => setPreview(false)}>Write</button>
                    <button className={preview ? "active" : ""} onClick={() => setPreview(true)}>Preview</button>
                  </div>
                </div>
                {preview ? (
                  <div className="markdown-preview">
                    {activeNote.contentMarkdown ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) =>
                            href?.startsWith("palace-note:") ? (
                              <button
                                className="wiki-link"
                                onClick={() => selectNote(href.slice("palace-note:".length))}
                              >{children}</button>
                            ) : (
                              <a href={href} target="_blank" rel="noreferrer">{children}</a>
                            ),
                        }}
                      >{renderedMarkdown}</ReactMarkdown>
                    ) : <p className="preview-placeholder">Your note is a blank page.</p>}
                  </div>
                ) : (
                  <textarea
                    className="markdown-editor"
                    value={activeNote.contentMarkdown}
                    onChange={(event) => updateBody(event.target.value)}
                    onBlur={() => void flushSave()}
                    placeholder={"Start writing…\n\nUse # for headings, - for lists, or [[Note title]] to link notes."}
                    aria-label="Markdown note content"
                  />
                )}
                {activeNote.backlinks.length > 0 && (
                  <section className="backlinks">
                    <div className="backlink-heading"><span>↗</span> Linked from {activeNote.backlinks.length}</div>
                    {activeNote.backlinks.map((link) => (
                      <button key={link.id} className="backlink-item" onClick={() => selectNote(link.id)}>
                        {link.title.trim() || "Untitled"} <span>↗</span>
                      </button>
                    ))}
                  </section>
                )}
              </article>
            )}
          </>
        ) : (
          <div className="editor-empty">
            <div className="editor-empty-mark">✳</div>
            <h2>A space for what matters</h2>
            <p>Select a note to keep going, or start something new.</p>
            <button className="primary-button" onClick={() => void createNote()}>＋ New note</button>
          </div>
        )}
      </section>
    </main>
  );
}
