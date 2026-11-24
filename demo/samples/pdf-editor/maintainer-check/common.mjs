// Shared settings for the maintainer checks. Paths are relative to this sample folder.
// Needs Node 20+, Playwright, and Chrome or Chromium. Set CHROME to the browser path if Playwright cannot find one,
// and PLAYWRIGHT to the Playwright module path if it is not installed where Node looks.
import path from "node:path";
import { fileURLToPath } from "node:url";
export const here = path.dirname(fileURLToPath(import.meta.url));
export const sample = path.resolve(here, "..");
export const testpdfs = path.join(here, "testpdfs");
export const results = path.join(here, "results");
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
export const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
