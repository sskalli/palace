"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArchiveIcon, DownloadIcon, FolderIcon, NotesIcon, PinIcon, PlusIcon, SearchIcon, SignOutIcon } from "@/components/icons";
import { ContextMenu } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import type { FolderSummary, TagSummary } from "@/lib/client-types";

interface AppShellProps {
  children: React.ReactNode;
  email: string;
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return "The request could not be completed.";
}

export function AppShell({ children, email }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<{ folder: FolderSummary; anchor: DOMRect } | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "create" } | { kind: "rename"; folder: FolderSummary } | { kind: "delete"; folder: FolderSummary } | null
  >(null);
  const activeView = searchParams.get("view") ?? "all";
  const activeFolderId = searchParams.get("folder");

  const createNote = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await readError(response));
      const note = await response.json();
      router.push(`/notes/${note.id}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The note could not be created.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadNavigation = useCallback(async () => {
    try {
      const [folderResponse, tagResponse] = await Promise.all([
        fetch("/api/folders"),
        fetch("/api/tags"),
      ]);
      if (!folderResponse.ok) throw new Error(await readError(folderResponse));
      if (!tagResponse.ok) throw new Error(await readError(tagResponse));
      const [nextFolders, nextTags] = await Promise.all([
        folderResponse.json() as Promise<FolderSummary[]>,
        tagResponse.json() as Promise<TagSummary[]>,
      ]);
      setFolders(nextFolders);
      setTags(nextTags);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Navigation could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadNavigation);
  }, [loadNavigation, pathname]);

  useEffect(() => {
    const refresh = () => void loadNavigation();
    window.addEventListener("palace:navigation-changed", refresh);
    return () => window.removeEventListener("palace:navigation-changed", refresh);
  }, [loadNavigation]);

  useEffect(() => {
    const handler = () => void createNote();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "n") {
        const target = event.target;
        if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("palace:new-note", handler);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("palace:new-note", handler);
      window.removeEventListener("keydown", shortcut);
    };
  }, [createNote, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function createFolder(name: string) {
    const response = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setToast(await readError(response));
      return;
    }
    setDialog(null);
    await loadNavigation();
  }

  async function renameFolder(folder: FolderSummary, name: string) {
    if (name !== folder.name) {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setToast(await readError(response));
        return;
      }
    }
    setDialog(null);
    await loadNavigation();
  }

  async function deleteFolder(folder: FolderSummary) {
    const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!response.ok) {
      setToast(await readError(response));
      return;
    }
    setDialog(null);
    if (activeFolderId === folder.id) router.push("/");
    await loadNavigation();
  }

  const activeFolder = folders.find((folder) => folder.id === activeFolderId);
  const currentLabel = pathname.startsWith("/notes/")
    ? "Note"
    : pathname === "/search"
      ? "Search"
      : activeFolder?.name ?? "Your notes";

  return (
    <div className="app-frame">
      {drawerOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />}
      <aside
        className={`sidebar${drawerOpen ? " open" : ""}${menu ? " expanded" : ""}`}
        aria-label="Main navigation"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) setDrawerOpen(false);
        }}
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🏰</span>
          <span className="brand-name">palace</span>
          <button className="mobile-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <button className="primary-button new-note-button" onClick={createNote} disabled={loading}>
          <PlusIcon /><span className="nav-label">New note</span>
        </button>
        <div className="nav-section"><span className="nav-label">Workspace</span></div>
        <nav className="nav-list">
          <Link className={`nav-link${pathname === "/" && activeView === "all" && !activeFolderId && !searchParams.get("tag") ? " active" : ""}`} href="/">
            <span className="nav-icon"><NotesIcon /></span><span className="nav-label">All notes</span>
          </Link>
          <Link className={`nav-link${pathname === "/" && activeView === "pinned" ? " active" : ""}`} href="/?view=pinned">
            <span className="nav-icon"><PinIcon /></span><span className="nav-label">Pinned</span>
          </Link>
          <Link className={`nav-link${pathname === "/" && activeView === "archived" ? " active" : ""}`} href="/?view=archived">
            <span className="nav-icon"><ArchiveIcon /></span><span className="nav-label">Archived</span>
          </Link>
        </nav>
        <div className="nav-section nav-section-folders">
          <span className="nav-label">Folders</span>
          <button className="tiny-action" title="Create folder" aria-label="Create folder" onClick={() => setDialog({ kind: "create" })}><PlusIcon size={14} /></button>
        </div>
        <nav className="nav-list">
          {folders.map((folder) => (
            <div className={`folder-row${menu?.folder.id === folder.id ? " menu-open" : ""}`} key={folder.id}>
              <Link className={`nav-link${activeFolderId === folder.id ? " active" : ""}`} href={`/?view=all&folder=${encodeURIComponent(folder.id)}`}>
                <span className="nav-icon"><FolderIcon /></span><span className="nav-label">{folder.name}</span>
              </Link>
              <div className="folder-tools">
                <button className="tiny-action" aria-label={`Folder options for ${folder.name}`} aria-haspopup="menu" title="Folder options" onClick={(event) => setMenu({ folder, anchor: event.currentTarget.getBoundingClientRect() })}>···</button>
              </div>
            </div>
          ))}
          {folders.length === 0 && (
            <span className="muted-text" style={{ padding: "4px 10px" }}>No folders yet</span>
          )}
        </nav>
        <div className="nav-section nav-section-tags"><span className="nav-label">Tags</span></div>
        <div className="tag-list">
          {tags.map((tag) => (
            <Link key={tag.id} className={`tag-chip${searchParams.get("tag") === tag.normalizedName ? " active" : ""}`} href={`/?view=all&tag=${encodeURIComponent(tag.normalizedName)}`}>{tag.name}</Link>
          ))}
          {tags.length === 0 && <span className="muted-text">Add tags from a note</span>}
        </div>
        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <a className="nav-link" href="/api/export/markdown">
            <span className="nav-icon"><DownloadIcon /></span><span className="nav-label">Export Markdown</span>
          </a>
          <button className="nav-action" onClick={() => void signOut({ redirectTo: "/login" })}>
            <span className="nav-icon"><SignOutIcon /></span><span className="nav-label">Sign out</span>
          </button>
          <div className="user-panel">
            <span className="avatar">{email.slice(0, 1).toLocaleUpperCase() || "P"}</span>
            <span className="user-copy"><span className="user-email">{email}</span></span>
          </div>
        </div>
      </aside>
      {menu && (
        <ContextMenu
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            { label: "Rename", onSelect: () => setDialog({ kind: "rename", folder: menu.folder }) },
            { label: "Delete", danger: true, onSelect: () => setDialog({ kind: "delete", folder: menu.folder }) },
          ]}
        />
      )}
      {dialog?.kind === "create" && (
        <Modal title="New folder" confirmLabel="Create" input={{ label: "Folder name", placeholder: "e.g. Projects" }} onConfirm={createFolder} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "rename" && (
        <Modal title="Rename folder" confirmLabel="Rename" input={{ label: "Folder name", initialValue: dialog.folder.name }} onConfirm={(name) => renameFolder(dialog.folder, name)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "delete" && (
        <Modal title="Delete folder?" description={`“${dialog.folder.name}” will be deleted. Its notes are kept and stay in All notes.`} confirmLabel="Delete" danger onConfirm={() => deleteFolder(dialog.folder)} onClose={() => setDialog(null)} />
      )}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>☰</button>
          <div className="breadcrumbs">
            <span>Palace</span><span aria-hidden="true">/</span><span className="crumb-current">{currentLabel}</span>
          </div>
          <div className="top-actions">
            <form
              className="search-shortcut"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
                router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
              }}
            >
              <SearchIcon size={15} />
              <input ref={searchInputRef} name="q" className="topbar-search-input" placeholder="Search your notes" aria-label="Search your notes" autoComplete="off" />
              <span className="keyboard-hint">⌘ K</span>
            </form>
          </div>
        </header>
        {children}
        {toast && <div role="alert" className="toast-error">{toast}</div>}
      </main>
    </div>
  );
}
