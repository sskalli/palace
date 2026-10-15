"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

interface ModalProps {
	title: string;
	description?: string;
	errorMessage?: string;
	confirmLabel: string;
	danger?: boolean;
	input?: { label: string; initialValue?: string; placeholder?: string; maxLength?: number };
	onConfirm: (value: string) => Promise<void> | void;
	onClose: () => void;
}

export function Modal({
	title,
	description,
	errorMessage,
	confirmLabel,
	danger,
	input,
	onConfirm,
	onClose,
}: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState(input?.initialValue ?? "");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog && !dialog.open) dialog.showModal();
		inputRef.current?.select();
	}, []);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (busy || (input && !value.trim())) return;
		setBusy(true);
		try {
			await onConfirm(value.trim());
		} finally {
			setBusy(false);
		}
	}

	return (
		<dialog
			ref={dialogRef}
			className="modal"
			aria-labelledby="modal-title"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onMouseDown={(event) => {
				if (event.target === dialogRef.current) onClose();
			}}
		>
			<form className="modal-body" onSubmit={submit}>
				<h2 id="modal-title" className="modal-title">
					{title}
				</h2>
				{description && <p className="modal-description">{description}</p>}
				{errorMessage && (
					<p className="message-error" role="alert">
						{errorMessage}
					</p>
				)}
				{input && (
					<label className="modal-field">
						<span>{input.label}</span>
						<input
							ref={inputRef}
							value={value}
							onChange={(event) => setValue(event.target.value)}
							placeholder={input.placeholder}
							maxLength={input.maxLength ?? 80}
							autoFocus
							autoComplete="off"
						/>
					</label>
				)}
				<div className="modal-actions">
					<button type="button" className="text-button" onClick={onClose}>
						Cancel
					</button>
					<button
						type="submit"
						className={danger ? "danger-button" : "primary-button"}
						disabled={busy || (Boolean(input) && !value.trim())}
						autoFocus={!input}
					>
						{confirmLabel}
					</button>
				</div>
			</form>
		</dialog>
	);
}
