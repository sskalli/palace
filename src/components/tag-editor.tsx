"use client";

import { useState } from "react";
import { normalizeTagNames } from "@/lib/tags";

interface TagEditorProps {
	tags: string[];
	onChange: (tags: string[]) => void;
}

/** Chips plus a text field; a comma or Enter turns the typed text into a tag. */
export function TagEditor({ tags, onChange }: TagEditorProps) {
	const [draft, setDraft] = useState("");

	function add(names: string[]) {
		const next = normalizeTagNames([...tags, ...names]);
		if (next.length !== tags.length) onChange(next);
	}

	function commit() {
		add([draft]);
		setDraft("");
	}

	function onInput(value: string) {
		const parts = value.split(/[,，]/);
		add(parts.slice(0, -1));
		setDraft(parts.at(-1) ?? "");
	}

	return (
		<div className="tag-editor" aria-label="Note tags">
			<span aria-hidden="true" className="muted-text">
				#
			</span>
			{tags.map((tag) => (
				<button
					className="card-tag"
					type="button"
					key={tag}
					title={`Remove ${tag}`}
					onClick={() => onChange(tags.filter((value) => value.toLowerCase() !== tag.toLowerCase()))}
				>
					{tag} <span aria-hidden="true">×</span>
				</button>
			))}
			<input
				className="tag-input"
				value={draft}
				onChange={(event) => onInput(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === ",") {
						event.preventDefault();
						commit();
					} else if (event.key === "Backspace" && !draft && tags.length) {
						onChange(tags.slice(0, -1));
					}
				}}
				onBlur={commit}
				placeholder={tags.length ? "Add a tag…" : "Add tags, separated by commas"}
				aria-label="Add tags"
			/>
		</div>
	);
}
