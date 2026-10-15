"use client";

import { createContext, useContext } from "react";
import type { FolderSummary } from "@/lib/client-types";

const FoldersContext = createContext<FolderSummary[]>([]);

export const FoldersProvider = FoldersContext.Provider;

/** All of the user's folders, kept up to date by the app shell. */
export function useFolders(): FolderSummary[] {
	return useContext(FoldersContext);
}
