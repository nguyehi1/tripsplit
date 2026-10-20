#!/usr/bin/env node
// Fails when a relative markdown link, or a #anchor into a markdown file, does not resolve.
// Scope: docs/, the root README/AGENTS/CLAUDE/CHANGELOG, and .claude/ agents and skills.
// External links (http, mailto) are not checked. Line anchors such as #L12 are skipped.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Released entries in CHANGELOG.md and applied migrations cite historical paths on purpose.
const SKIP_FILES = new Set(["CHANGELOG.md"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const files = [
  ...walk(join(root, "docs")),
  ...walk(join(root, ".claude")),
  ...["README.md", "AGENTS.md", "CLAUDE.md"].map((f) => join(root, f)).filter(existsSync),
].filter((f) => !SKIP_FILES.has(relative(root, f)));

const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
const stripCode = (text) => stripFences(text).replace(/`[^`\n]*`/g, "");

const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[`*~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const set = new Set();
    const seen = new Map();
    for (const m of stripFences(readFileSync(file, "utf8")).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
      const base = slug(m[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      set.add(n === 0 ? base : `${base}-${n}`);
    }
    anchorCache.set(file, set);
  }
  return anchorCache.get(file);
}

const problems = [];
for (const file of files) {
  const text = stripCode(readFileSync(file, "utf8"));
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(raw)) continue;
    const [pathPart, anchor] = raw.split("#");
    let target;
    try {
      target = pathPart === "" ? file : resolve(dirname(file), decodeURIComponent(pathPart));
    } catch {
      problems.push(`${relative(root, file)}: malformed link ${raw}`);
      continue;
    }
    if (!existsSync(target)) {
      problems.push(`${relative(root, file)}: missing file ${raw}`);
      continue;
    }
    if (anchor && !/^L\d+/.test(anchor) && target.endsWith(".md") && statSync(target).isFile()) {
      if (!anchorsOf(target).has(decodeURIComponent(anchor).toLowerCase())) {
        problems.push(`${relative(root, file)}: missing anchor ${raw}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} broken doc link(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`docs:check ok (${files.length} files)`);
