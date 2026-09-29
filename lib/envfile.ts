import fs from "node:fs";
import path from "node:path";

// Keys the Settings page is allowed to write. Anything else in .env is left alone.
export const EDITABLE_KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_TEST_REDIRECT",
  "EMAIL_REPLY_TO",
  "EMAIL_AUTO_SEND",
  "SCREENER_NAME",
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];

function envPath() {
  return path.join(process.cwd(), ".env");
}

// Updates the given keys in .env in place (keeping comments and other lines), and applies
// them to the running server so no restart is needed.
export function writeEnv(values: Partial<Record<EditableKey, string>>) {
  const file = envPath();
  const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = original.split(/\r?\n/);
  for (const [key, raw] of Object.entries(values)) {
    if (raw === undefined) continue;
    const value = raw.replace(/[\r\n"]/g, "").trim();
    const line = `${key}="${value}"`;
    const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    if (i >= 0) {
      // Keep any trailing comment on the line.
      const comment = lines[i].match(/"\s+(#.*)$/)?.[1];
      lines[i] = comment ? `${line}   ${comment}` : line;
    } else {
      lines.push(line);
    }
    process.env[key] = value;
  }
  fs.writeFileSync(file, lines.join("\n"));
}
