import { execSync } from "node:child_process";

export function openUrl(url: string): void {
  try {
    // macOS
    execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
  } catch {
    // Fallback: try xdg-open (Linux)
    try {
      execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
    } catch {
      /* silently fail */
    }
  }
}
