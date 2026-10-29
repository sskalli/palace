import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_ICON_PATH, CLIPBOARD_ICON_PATH, copyCode, setCodeCopyState } from "./copy-code";

afterEach(() => vi.unstubAllGlobals());

function button() {
	return { innerHTML: "", title: "", setAttribute: vi.fn(), focus: vi.fn() };
}

describe("code clipboard icons", () => {
	it("shows clipboard initially and check only after a successful copy, without focusing", async () => {
		const control = button();
		setCodeCopyState(control as unknown as HTMLButtonElement, "ready");
		expect(control.innerHTML).toContain(CLIPBOARD_ICON_PATH);
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		await copyCode(control as unknown as HTMLButtonElement, "const x = 1;\n");
		expect(writeText).toHaveBeenCalledWith("const x = 1;\n");
		expect(control.innerHTML).toContain(CHECK_ICON_PATH);
		expect(control.setAttribute).toHaveBeenLastCalledWith("aria-label", "Code copied");
		expect(control.focus).not.toHaveBeenCalled();
	});

	it("keeps a clipboard icon and accessible retry label when copying fails", async () => {
		const control = button();
		vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
		await copyCode(control as unknown as HTMLButtonElement, "text");
		expect(control.innerHTML).toContain(CLIPBOARD_ICON_PATH);
		expect(control.innerHTML).not.toContain(CHECK_ICON_PATH);
		expect(control.title).toBe("Copy failed. Retry copying code");
		expect(control.focus).not.toHaveBeenCalled();
	});
});
