import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { imageBuildNeeded } from "./conventional-commit.mjs";

const subjects = [];
if (process.env.PR_TITLE) subjects.push(process.env.PR_TITLE);
const range = process.env.COMMIT_RANGE ?? "";
if (range && !range.startsWith("0000000")) {
  const log = execFileSync("git", ["log", "--format=%s", range], { encoding: "utf8" });
  subjects.push(...log.split("\n").filter(Boolean));
}
const image = imageBuildNeeded(subjects) ? "true" : "false";
const line = `image=${image}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
console.log(line.trim());
