"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SearchIcon } from "@/components/icons";

interface TopbarProps {
	label: string;
	onOpenDrawer: () => void;
}

export function Topbar({ label, onOpenDrawer }: TopbarProps) {
	const router = useRouter();
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				searchRef.current?.focus();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<header className="topbar">
			<button className="mobile-menu" aria-label="Open navigation" onClick={onOpenDrawer}>
				☰
			</button>
			<div className="breadcrumbs">
				<span>Palace</span>
				<span aria-hidden="true">/</span>
				<span className="crumb-current">{label}</span>
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
					<input
						ref={searchRef}
						name="q"
						className="topbar-search-input"
						placeholder="Search your notes"
						aria-label="Search your notes"
						autoComplete="off"
					/>
					<span className="keyboard-hint">⌘ K</span>
				</form>
			</div>
		</header>
	);
}
