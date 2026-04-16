#!/usr/bin/env bun
// Build the lilac-tui standalone executable with the `lilac` binary embedded
// as a bundled asset.
//
//   1. Locate the standalone `lilac` binary (LILAC_BIN env or PATH).
//   2. Copy it into assets/lilac so `bun build --compile` embeds it.
//   3. Run `bun build --compile`.
//   4. Restore the placeholder stub so the source tree stays clean.

import { $ } from "bun";
import { copyFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ASSET = join(ROOT, "assets", "lilac");
const ENTRY = join(ROOT, "src", "index.tsx");
const OUT = join(ROOT, "dist", "lilac-tui");

const realBin = process.env.LILAC_BIN ?? Bun.which("lilac");
if (!realBin) {
  console.error(
    "build: could not find a `lilac` binary to bundle.\n" +
      "Set LILAC_BIN to an absolute path or install `lilac` on PATH."
  );
  process.exit(1);
}

let realBinSize: number;
try {
  realBinSize = statSync(realBin).size;
} catch (err) {
  console.error(`build: cannot stat ${realBin}: ${(err as Error).message}`);
  process.exit(1);
}
if (realBinSize < 1024) {
  console.error(
    `build: ${realBin} is only ${realBinSize} bytes — refusing to bundle a stub.`
  );
  process.exit(1);
}

console.log(`build: bundling ${realBin} (${(realBinSize / 1024 / 1024).toFixed(1)} MB)`);
copyFileSync(realBin, ASSET);

let exitCode = 0;
try {
  // ink lazily pulls in `react-devtools-core` when `process.env.DEV === 'true'`.
  // Defining DEV=false dead-code-eliminates that branch so the bundler never
  // tries to follow the import.
  const targetArgs = process.env.BUN_TARGET ? ["--target", process.env.BUN_TARGET] : [];
  await $`bun build --compile --minify ${targetArgs} --define process.env.DEV='"false"' ${ENTRY} --outfile ${OUT}`;
  console.log(`build: ${OUT} ready`);
} catch (err) {
  console.error("build: compile failed", err);
  exitCode = 1;
} finally {
  // Always restore the stub so a failed build doesn't leave a multi-MB
  // binary committed-but-untracked in the source tree.
  writeFileSync(ASSET, "STUB");
  console.log("build: restored assets/lilac stub");
}

process.exit(exitCode);
