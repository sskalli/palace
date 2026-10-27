"use client";

import { createContext, useContext } from "react";
import { NoteStore } from "@/lib/note-store";

export const NoteStoreContext = createContext<NoteStore | null>(null);
export function useNoteStore() {
 const store = useContext(NoteStoreContext);
 if (!store) throw new Error("Note store requires an authenticated workspace.");
 return store;
}
