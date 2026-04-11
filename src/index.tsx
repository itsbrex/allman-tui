#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { render } from "ink";
import { App } from "./app.tsx";
import { findAccounts, getLilacBin, getStorePath } from "./lib/lilac.ts";

function runLogin(binPath: string, storePath: string): boolean {
  // Hand stdio to the lilac CLI so its native login flow (browser auth,
  // prompts, etc.) can run unmodified. Ink hasn't been mounted yet so the
  // terminal is in cooked mode and the CLI gets a clean tty.
  process.stdout.write(
    `\n` +
      `  Welcome to lilac-tui.\n` +
      `  No accounts in ${storePath} yet — running first-time login.\n` +
      `  (Press Ctrl-C to cancel.)\n` +
      `\n`
  );
  const result = spawnSync(binPath, ["--store", storePath, "login"], {
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`\nlilac-tui: failed to start login: ${result.error.message}\n`);
    return false;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.stderr.write(`\nlilac-tui: login exited with code ${result.status}\n`);
    return false;
  }
  if (result.signal) {
    process.stderr.write(`\nlilac-tui: login terminated by ${result.signal}\n`);
    return false;
  }
  process.stdout.write("\n  Login complete. Loading inbox…\n\n");
  return true;
}

function main() {
  let storePath: string;
  let binPath: string;
  try {
    storePath = getStorePath();
    binPath = getLilacBin();
  } catch (err) {
    process.stderr.write(
      `lilac-tui: ${err instanceof Error ? err.message : String(err)}\n` +
        `\n` +
        `  LILAC_STORE  absolute path to your .lilac directory\n` +
        `  LILAC_BIN    absolute path to the standalone lilac binary\n`
    );
    process.exit(1);
  }

  // The login flow needs a real TTY (it may prompt or open a browser), and
  // so does Ink, so check up front before either path is taken.
  if (!process.stdin.isTTY) {
    process.stderr.write("lilac-tui: must be run in a TTY\n");
    process.exit(1);
  }

  let accounts = findAccounts(storePath);
  if (accounts.length === 0) {
    if (!runLogin(binPath, storePath)) {
      process.exit(1);
    }
    accounts = findAccounts(storePath);
    if (accounts.length === 0) {
      process.stderr.write(
        `lilac-tui: still no accounts in ${storePath} after login. ` +
          `Try running \`${binPath} --store ${storePath} login\` directly.\n`
      );
      process.exit(1);
    }
  }

  // Pick the first account, or honor LILAC_ACCOUNT.
  const wanted = process.env.LILAC_ACCOUNT;
  const account =
    (wanted && accounts.find((a) => a.slug === wanted || a.profileId === wanted)) || accounts[0];

  if (!account) {
    process.stderr.write("lilac-tui: account not found\n");
    process.exit(1);
  }

  const { waitUntilExit } = render(<App account={account} />, {
    exitOnCtrlC: true,
  });
  waitUntilExit().then(() => process.exit(0));
}

main();
