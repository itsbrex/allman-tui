#!/usr/bin/env bun
// Put this checkout's `allman-tui` on PATH.
//
//   bun run link            symlink ~/.local/bin/allman-tui -> ./bin/allman-tui
//   bun run link --force    ...displacing whatever is already there
//   bun run unlink          remove it and restore anything displaced
//
// The link points at `bin/allman-tui`, a shim that execs `bun src/index.tsx`,
// so the linked command always reflects the working tree — no `bun run build`
// between an edit and the next run. The shim also prefers a sibling
// `allman-cli` checkout's dev shim over a released `allman` on PATH, so the
// dev TUI drives the dev CLI.
//
// A globally installed `allman-tui` (install.sh writes ~/.local/bin/allman-tui
// too) is never silently overwritten: it is moved aside to
// `allman-tui.pre-dev-link` and put back by `unlink`. That backup is what makes
// the dev link reversible, which is the whole reason to prefer it over `cp`-ing
// a build into PATH.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const NAME = "allman-tui";
const ROOT = resolve(import.meta.dir, "..");
const SHIM = join(ROOT, "bin", NAME);

const remove = process.argv.includes("--remove");
const force = process.argv.includes("--force");
const binDir = argValue("dir") ?? process.env.ALLMAN_LINK_DIR ?? join(homedir(), ".local", "bin");
const linkPath = join(binDir, NAME);
const backupPath = `${linkPath}.pre-dev-link`;

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) die(`--${name} requires a value`);
  return val;
}

function die(msg: string): never {
  console.error(`link: ${msg}`);
  process.exit(1);
}

function log(msg: string) {
  console.log(`link: ${msg}`);
}

/** lstat that reports "nothing there" rather than throwing. */
function entryKind(path: string): "missing" | "symlink" | "file" {
  try {
    return lstatSync(path).isSymbolicLink() ? "symlink" : "file";
  } catch {
    return "missing";
  }
}

function pointsAtShim(path: string): boolean {
  try {
    return resolve(binDir, readlinkSync(path)) === SHIM;
  } catch {
    return false;
  }
}

function unlink() {
  const kind = entryKind(linkPath);
  if (kind === "missing") {
    log(`nothing linked at ${linkPath}`);
  } else if (kind === "symlink" && pointsAtShim(linkPath)) {
    rmSync(linkPath);
    log(`removed ${linkPath}`);
  } else {
    die(
      `${linkPath} is not a link to ${SHIM} — leaving it alone. ` +
        "Remove it yourself if that is what you want."
    );
  }

  if (existsSync(backupPath)) {
    renameSync(backupPath, linkPath);
    log(`restored the displaced ${NAME} from ${backupPath}`);
  }
}

function link() {
  if (!existsSync(SHIM)) die(`${SHIM} is missing — is this a full checkout?`);

  const kind = entryKind(linkPath);
  if (kind === "symlink" && pointsAtShim(linkPath)) {
    log(`already linked: ${linkPath} -> ${SHIM}`);
    return;
  }
  if (kind !== "missing") {
    if (!force) {
      die(
        `${linkPath} already exists and is not this repo's dev shim. ` +
          "Re-run with --force to move it aside (it is restored by `bun run unlink`)."
      );
    }
    if (existsSync(backupPath)) {
      die(`refusing to overwrite the existing backup at ${backupPath} — move it aside first`);
    }
    renameSync(linkPath, backupPath);
    log(`moved the existing ${NAME} to ${backupPath}`);
  }

  mkdirSync(binDir, { recursive: true });
  symlinkSync(SHIM, linkPath);
  log(`${linkPath} -> ${SHIM}`);
}

if (remove) unlink();
else link();

const onPath = (process.env.PATH ?? "").split(":").includes(binDir);
if (!onPath) {
  console.warn(`link: warning — ${binDir} is not on PATH, so \`${NAME}\` will not resolve there`);
}
