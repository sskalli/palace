"use client";

import { FolderIcon, SearchIcon } from "@/components/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchResult } from "@/lib/client-types";

export function SearchPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<{
    query: string;
    results: SearchResult[];
    loading: boolean;
    error: string;
  }>({ query: "", results: [], loading: false, error: "" });
  const normalizedQuery = query.trim();
  const loading = normalizedQuery !== "" && (result.query !== normalizedQuery || result.loading);
  const results = result.query === normalizedQuery ? result.results : [];
  const error = result.query === normalizedQuery ? result.error : "";

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      setResult({ query: normalized, results: [], loading: true, error: "" });
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`);
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "Search could not be completed.";
          throw new Error(message);
        }
        if (live) setResult({ query: normalized, results: payload as SearchResult[], loading: false, error: "" });
      } catch (cause) {
        if (live) setResult({
          query: normalized,
          results: [],
          loading: false,
          error: cause instanceof Error ? cause.message : "Search could not be completed.",
        });
      }
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query]);

  return (
    <div className="content-wrap">
      <div className="search-page">
        <div className="eyebrow">Find your way back</div>
        <h1 className="page-title">Search notes</h1>
        <p className="page-subtitle">Search titles and the words inside your notes.</p>
        <div className="search-input-wrap">
          <SearchIcon size={19} />
          <input className="search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a phrase, a person, or an idea…" aria-label="Search notes" />
          {loading && <span className="save-status saving"><span className="save-dot" />Searching</span>}
        </div>
        {error && <div className="message-error" role="alert">{error}</div>}
        {!normalizedQuery ? (
          <div className="muted-text" style={{ padding: "14px 2px" }}>Start typing to search your notes.</div>
        ) : !loading && !error && results.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 240 }}>
            <div className="empty-icon">⌕</div><h2>No notes found</h2><p>Try a different phrase or check your spelling.</p>
          </div>
        ) : (
          <div className="search-results">
            {results.map((result) => (
              <Link className="search-result" href={`/notes/${result.id}`} key={result.id}>
                <h2>{result.title}</h2>
                <p>{result.preview || "No preview available."}</p>
                <div className="search-result-meta">
                  <span className="folder-label"><FolderIcon size={12} />{result.folder?.name ?? "No folder"}</span>
                  {result.tags.map((tag) => <span className="card-tag" key={tag.id}>{tag.name}</span>)}
                  <span style={{ marginLeft: "auto" }}>{formatSearchDate(result.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSearchDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
