"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api-client";
import type { FolderSummary, NoteDetail, TagSummary, TreeNote } from "@/lib/client-types";
import type { NoteDraft } from "@/lib/note-store";

/** Merge local changes made while a navigation snapshot was loading. */
export function mergeNavigation<T extends { id: string }>(rows: T[], changes: Map<string, T | null>) {
 const merged = new Map(rows.map(row => [row.id, row]));
 for (const [id, row] of changes) { if (row) merged.set(id, row); else merged.delete(id); }
 return [...merged.values()];
}
export function useNavigation(onError: (message: string) => void) {
 const [folders, setFolders] = useState<FolderSummary[]>([]);
 const [tags, setTags] = useState<TagSummary[]>([]);
 const [treeNotes, setTreeNotes] = useState<TreeNote[]>([]);
 const latest = useRef({ folders: 0, notes: 0, tags: 0 });
 const noteChanges = useRef(new Map<string, TreeNote | null>());
 const folderChanges = useRef(new Map<string, FolderSummary | null>());
 const reloadFolders = useCallback(async () => {
  const ticket = ++latest.current.folders;
  for (const [id, folder] of folderChanges.current) if (!folder?.pending) folderChanges.current.delete(id);
  try {
   const rows = await api<FolderSummary[]>("/api/folders");
   if (ticket === latest.current.folders) setFolders(mergeNavigation(rows, folderChanges.current).sort((a,b) => a.name.localeCompare(b.name)));
  } catch (cause) { if (ticket === latest.current.folders) onError(errorText(cause, "Folders could not be loaded.")); }
 }, [onError]);
 const reloadTags = useCallback(async () => {
  const ticket = ++latest.current.tags;
  try { const rows = await api<TagSummary[]>("/api/tags"); if (ticket === latest.current.tags) setTags(rows); }
  catch (cause) { if (ticket === latest.current.tags) onError(errorText(cause, "Tags could not be loaded.")); }
 }, [onError]);
 const reloadTree = useCallback(async () => {
  const ticket = ++latest.current.notes;
  noteChanges.current.clear();
  try {
   const rows = await api<TreeNote[]>("/api/notes/tree");
   if (ticket === latest.current.notes) setTreeNotes(mergeNavigation(rows, noteChanges.current));
  } catch (cause) { if (ticket === latest.current.notes) onError(errorText(cause, "Notes could not be loaded.")); }
 }, [onError]);
 const reloadNotes = useCallback(async () => { await Promise.all([reloadTree(), reloadTags()]); }, [reloadTree, reloadTags]);
 const reload = useCallback(async () => { await Promise.all([reloadFolders(), reloadNotes()]); }, [reloadFolders, reloadNotes]);
 const patchTreeNote = useCallback((id: string, patch: Partial<TreeNote>) => {
  setTreeNotes(current => current.map(note => {
   if (note.id !== id) return note;
   const next = { ...note, ...patch }; noteChanges.current.set(id, next); return next;
  }));
 }, []);
 const addTreeNote = useCallback((note: TreeNote) => {
  noteChanges.current.set(note.id, note);
  setTreeNotes(current => [...current.filter(row => row.id !== note.id), note]);
 }, []);
 const upsertFolder = useCallback((folder: FolderSummary) => {
  folderChanges.current.set(folder.id, folder);
  setFolders(current => [...current.filter(row => row.id !== folder.id), folder].sort((a,b) => a.name.localeCompare(b.name)));
 }, []);
 const removeFolder = useCallback((id: string) => {
  folderChanges.current.set(id, null); setFolders(current => current.filter(row => row.id !== id));
 }, []);
 useEffect(() => { void reload(); }, [reload]);
 useEffect(() => {
  const refresh = () => void reloadNotes();
  const saved = (event: Event) => {
   const { note, fields } = (event as CustomEvent<{ note: NoteDetail; fields: Partial<NoteDraft> }>).detail;
   if (fields.archived !== undefined) { void reloadNotes(); void reloadFolders(); }
   else {
    if (fields.title !== undefined || fields.isPinned !== undefined) addTreeNote({ id: note.id, title: note.title.trim() || "Untitled note", folderId: note.folderId, isPinned: note.isPinned });
    if (fields.tags !== undefined) void reloadTags();
   }
  };
  window.addEventListener("palace:navigation-changed", refresh);
  window.addEventListener("palace:note-saved", saved);
  return () => { window.removeEventListener("palace:navigation-changed", refresh); window.removeEventListener("palace:note-saved", saved); };
 }, [reloadNotes, reloadFolders, reloadTags, addTreeNote]);
 return { folders, tags, treeNotes, reload, reloadFolders, reloadNotes, patchTreeNote, addTreeNote, upsertFolder, removeFolder };
}
