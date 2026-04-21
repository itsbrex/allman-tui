#!/usr/bin/env bun
// Cut a local allman-tui release: lint → test → download matching
// allman-cli release binaries → bundle both Linux arches → checksum →
// tag → push → `gh release create` with assets.
//
// Usage:
//   bun run release 2026-04-20.1-alpha
//   bun run release 2026-04-20.1-alpha --cli-version 2026-04-20.1-alpha
//   bun run release 2026-04-20.1-alpha --skip-tests
//   bun run release 2026-04-20.1-alpha --dry-run
//
// If --cli-version is omitted, the most recent allman-cli release (including
// prereleases) is embedded. Tags containing `-alpha` or `-beta` publish as a
// GitHub prerelease.

import { $ } from "bun";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const ASSET = join(ROOT, "assets", "allman");
const ENTRY = join(ROOT, "src", "index.tsx");
const REPO = "tarkaai/allman-tui";
const CLI_REPO = "tarkaai/allman-cli";
const BIN = "allman-tui";
const TAG_REGEX = /^20\d{2}-\d{2}-\d{2}\.\d+(?:-(?:alpha|beta))?$/;
const TARGETS = [
  { os: "linux", arch: "x64", bunTarget: "bun-linux-x64" },
  { os: "linux", arch: "arm64", bunTarget: "bun-linux-arm64" },
  { os: "darwin", arch: "x64", bunTarget: "bun-darwin-x64" },
  { os: "darwin", arch: "arm64", bunTarget: "bun-darwin-arm64" },
] as const;

function die(msg: string): never {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function log(msg: string) {
  console.log(`release: ${msg}`);
}

function argValue(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) die(`--${name} requires a value`);
  return val;
}

const positional = process.argv
  .slice(2)
  .filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--cli-version");
const tag = positional[0];
const skipTests = process.argv.includes("--skip-tests");
const dryRun = process.argv.includes("--dry-run");
const cliVersionArg = argValue("cli-version");

if (!tag)
  die(
    "usage: bun run release <tag> [--cli-version <tag>] [--skip-tests] [--dry-run]"
  );
if (!TAG_REGEX.test(tag))
  die(`tag ${tag} does not match YYYY-MM-DD.N[-alpha|-beta]`);

const isPrerelease = tag.includes("-alpha") || tag.includes("-beta");

async function sh(cmd: string): Promise<string> {
  const out = await $`sh -c ${cmd}`.quiet();
  return out.stdout.toString().trim();
}

async function assertCleanTree() {
  // Ignore untracked files — only fail when tracked files have uncommitted
  // changes. Release machines often have untracked local tooling (.claude,
  // .obsidian, etc.) that shouldn't block a release.
  const status = await sh("git status --porcelain -uno");
  if (status) die(`tracked files have uncommitted changes:\n${status}`);
}

async function assertOnMainPushed() {
  const branch = await sh("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") die(`not on main (on ${branch})`);
  await sh("git fetch origin main --quiet");
  const local = await sh("git rev-parse HEAD");
  const remote = await sh("git rev-parse origin/main");
  if (local !== remote) die("local main is not in sync with origin/main");
}

async function assertTagAvailable() {
  const existing = await sh(`git tag -l ${tag}`);
  if (existing) die(`tag ${tag} already exists locally`);
  const remote = await sh(
    `git ls-remote --tags origin refs/tags/${tag} | head -1`
  );
  if (remote) die(`tag ${tag} already exists on origin`);
}

async function resolveCliVersion(): Promise<string> {
  if (cliVersionArg) return cliVersionArg;
  const latest = await sh(
    `gh api repos/${CLI_REPO}/releases --jq '.[0].tag_name'`
  );
  if (!latest || latest === "null")
    die(`no releases found on ${CLI_REPO} — release the CLI first`);
  return latest;
}

async function downloadCli(
  version: string,
  os: string,
  arch: string
): Promise<string> {
  const tmpDir = join(ROOT, ".bin-release");
  mkdirSync(tmpDir, { recursive: true });
  const assetName = `allman-${os}-${arch}`;
  log(`downloading ${CLI_REPO} ${version} asset ${assetName}`);
  await $`gh release download ${version} --repo ${CLI_REPO} --pattern ${assetName} --dir ${tmpDir} --clobber`;
  const path = join(tmpDir, assetName);
  await $`chmod +x ${path}`;
  return path;
}

async function buildTui(cliBinary: string, bunTarget: string, outfile: string) {
  copyFileSync(cliBinary, ASSET);
  try {
    // Match scripts/build.ts: DEV=false dead-code-eliminates ink's
    // react-devtools-core branch so the bundler doesn't try to follow it.
    await $`bun build --compile --minify --target=${bunTarget} --define process.env.DEV='"false"' ${ENTRY} --outfile ${outfile}`;
  } finally {
    writeFileSync(ASSET, "STUB");
  }
}

function sha256(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

async function main() {
  log(`cutting ${tag} (${isPrerelease ? "prerelease" : "stable"})`);
  await assertCleanTree();
  await assertOnMainPushed();
  await assertTagAvailable();

  log("lint");
  await $`bun run lint`;

  if (!skipTests) {
    log("test");
    await $`bun test tests/unit/`;
  } else {
    log("skipping tests (--skip-tests)");
  }

  const cliVersion = await resolveCliVersion();
  log(`embedding allman-cli ${cliVersion}`);

  mkdirSync(DIST, { recursive: true });
  const assets: string[] = [];
  try {
    for (const { os, arch, bunTarget } of TARGETS) {
      const cliBinary = await downloadCli(cliVersion, os, arch);
      const outfile = join(DIST, `${BIN}-${os}-${arch}`);
      log(`building ${outfile}`);
      await buildTui(cliBinary, bunTarget, outfile);
      const sumPath = `${outfile}.sha256`;
      const sum = sha256(outfile);
      writeFileSync(sumPath, `${sum}  ${BIN}-${os}-${arch}\n`);
      log(`sha256 ${os}-${arch}: ${sum}`);
      assets.push(outfile, sumPath);
    }
  } finally {
    rmSync(join(ROOT, ".bin-release"), { recursive: true, force: true });
  }

  if (dryRun) {
    log(`dry-run: built ${assets.length} assets, stopping before tag/publish`);
    return;
  }

  log(`tagging ${tag}`);
  await $`git tag ${tag}`;
  await $`git push origin ${tag}`;

  const notes = `Built locally. Embeds allman-cli ${cliVersion}.`;
  log(`publishing release on ${REPO}`);
  const prereleaseFlag = isPrerelease ? ["--prerelease"] : [];
  await $`gh release create ${tag} --repo ${REPO} --title ${tag} --notes ${notes} ${prereleaseFlag} ${assets}`;

  const url = await sh(
    `gh release view ${tag} --repo ${REPO} --json url --jq .url`
  );
  log(`done: ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
