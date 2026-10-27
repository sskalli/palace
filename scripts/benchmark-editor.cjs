/* eslint-disable @typescript-eslint/no-require-imports -- This benchmark loads CommonJS-transpiled TypeScript without a build step. */
// Synthetic state/decorations benchmark; excludes browser DOM and layout work.
const fs = require("fs");
const ts = require("typescript");
const Module = require("module");
const path = require("path");
function loadTs(file, overrides = {}) {
	const filename = path.resolve(file);
	const mod = new Module(filename, module);
	mod.filename = filename;
	mod.paths = Module._nodeModulePaths(path.dirname(filename));
	const originalRequire = mod.require.bind(mod);
	mod.require = (id) => overrides[id] || originalRequire(id);
	mod._compile(
		ts.transpileModule(fs.readFileSync(file, "utf8"), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		}).outputText,
		filename,
	);
	return mod.exports;
}
const blocks = loadTs("src/lib/live-preview/blocks.ts");
const extension = loadTs("src/lib/live-preview/extension.ts", { "./blocks": blocks });
const { EditorState, EditorSelection } = require("@codemirror/state");
const { markdown, markdownLanguage } = require("@codemirror/lang-markdown");
for (const size of [1000, 20000, 100000]) {
	const unit =
		"# Heading\n\nText with **bold**, *emphasis*, `code`, [[Heading]], and [link](https://example.com).\n\n";
	const doc = unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
	let state = EditorState.create({
		doc,
		extensions: [markdown({ base: markdownLanguage }), extension.livePreviewField],
	});
	const samples = [];
	for (let i = 0; i < 30; i++) {
		const start = performance.now();
		state = state.update({ selection: EditorSelection.cursor((i * 73) % size) }).state;
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	console.log(
		JSON.stringify({
			characters: size,
			selectionMedianMs: +samples[15].toFixed(2),
			selectionP95Ms: +samples[28].toFixed(2),
		}),
	);
}
