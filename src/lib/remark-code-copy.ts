import type { Nodes, Root } from "mdast";

/** Markdown permits unfinished fences, but their copy control should wait for a closer. */
export function hasClosingFence(source: string): boolean {
	const lines = source.split(/\r?\n/);
	const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0]);
	if (!opening || lines.length < 2) return false;
	const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(lines[lines.length - 1]);
	return Boolean(closing && closing[1][0] === opening[1][0] && closing[1].length >= opening[1].length);
}

export function remarkCodeCopy() {
	return (tree: Root, file: { value: unknown }) => {
		const source = String(file.value);
		function visit(node: Nodes) {
			if (node.type === "code" || node.type === "inlineCode") {
				const start = node.position?.start.offset;
				const end = node.position?.end.offset;
				const copyable =
					node.type === "inlineCode" ||
					(start !== undefined && end !== undefined && hasClosingFence(source.slice(start, end)));
				node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-copyable": copyable } };
			}
			if ("children" in node) node.children.forEach(visit);
		}
		visit(tree);
	};
}
