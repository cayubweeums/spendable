import { execFileSync } from "node:child_process";

const types = "build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test";
const header = new RegExp(`^(?:${types})(?:\\([a-z0-9._/-]+\\))?!?: \\S(?:.*\\S)?$`);

/** @param {string} subject */
export function commitSubjectOk(subject) {
  return subject.length <= 100 && subject === subject.trim() && header.test(subject);
}

const imageTypes = new Set(["feat", "fix", "perf", "refactor", "revert", "style", "build"]);
const typeOf = new RegExp(`^(${types})(?:\\([a-z0-9._/-]+\\))?!?: `);

/** @param {string} subject */
export function commitType(subject) {
  return typeOf.exec(subject)?.[1] ?? "";
}

// shortcut: the commit type decides, not the paths. Upgrade when a docs commit can change the image.
/** @param {string[]} subjects */
export function imageBuildNeeded(subjects) {
  if (subjects.length === 0) return true;
  return subjects.some((subject) => {
    const type = commitType(subject);
    return type === "" || imageTypes.has(type);
  });
}

function fail(lines) {
  console.error("Use a semantic commit: type: subject");
  console.error("Types: feat, fix, perf, revert, docs, style, refactor, test, build, ci, chore.");
  console.error("A scope is optional: feat(sync): subject. A breaking change is feat!: subject.");
  for (const line of lines) console.error(line);
  process.exit(1);
}

if (process.argv[1]?.endsWith("conventional-commit.mjs")) {
  const title = process.env.PR_TITLE ?? "";
  const subjects = execFileSync("git", ["log", "--format=%s", "origin/main..HEAD"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const bad = [];
  if (!commitSubjectOk(title)) bad.push(`pull request title: ${title}`);
  for (const subject of subjects) {
    if (!commitSubjectOk(subject)) bad.push(`commit: ${subject}`);
  }
  if (subjects.length === 0) bad.push("commit: no commits found against main");
  if (bad.length > 0) fail(bad);
}
