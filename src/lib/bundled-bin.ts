// Resolves a runnable `lilac` binary from an asset embedded inside this
// executable. When `bun build --compile` packages the TUI, the asset is read
// out of the bundle at runtime and written to a per-user cache directory with
// the executable bit set, so it can be spawned like any normal binary.
//
// In dev mode (`bun run`) the import resolves to the on-disk path of
// `assets/lilac`, which is normally a 4-byte stub committed to the repo —
// detected here so we transparently fall back to PATH/LILAC_BIN.

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// @ts-expect-error — Bun's `with { type: "file" }` import attribute resolves
// to a string path at build time but lacks an upstream TS declaration.
import lilacAsset from "../../assets/lilac" with { type: "file" };

// Sentinel committed at `assets/lilac` so the import resolves cleanly in dev
// mode. Real builds overwrite it with the actual binary before
// `bun build --compile` runs.
const STUB_MAGIC = Buffer.from("STUB");

let cached: string | null | undefined;

export function getBundledLilacBin(): string | null {
  if (cached !== undefined) return cached;
  cached = extract();
  return cached;
}

function extract(): string | null {
  let buf: Buffer;
  try {
    buf = readFileSync(lilacAsset);
  } catch {
    return null;
  }
  // Anything at or below the stub size is treated as "no real binary".
  if (buf.length <= STUB_MAGIC.length) return null;
  if (buf.subarray(0, STUB_MAGIC.length).equals(STUB_MAGIC)) return null;

  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const cacheDir = join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "lilac-tui",
    "bin"
  );
  const target = join(cacheDir, `lilac-${hash}`);

  // Reuse a previously extracted copy when sizes match — saves a write on
  // every launch and lets multiple TUI processes share the same exec.
  try {
    if (existsSync(target) && statSync(target).size === buf.length) {
      return target;
    }
  } catch {
    // fall through and re-extract
  }

  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(target, buf);
    chmodSync(target, 0o755);
    return target;
  } catch {
    return null;
  }
}
