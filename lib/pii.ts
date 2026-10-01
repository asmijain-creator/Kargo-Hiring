// Splits a CV into personal details (name, email, phone) and everything else.
// This runs in plain code at upload time: the personal details are stored on the candidate
// row and never sent to any AI step. Only the redacted CV content is.

export interface PersonalDetails {
  name: string;
  email: string;
  phone: string;
}

export interface SplitCv {
  personal: PersonalDetails;
  // CV with name, email, phone and profile links replaced by placeholders.
  content: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// An optional +CC, then 10+ digits with spaces, dots, dashes or brackets.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\d[\d\s().-]{8,}\d/g;
const URL_LIKE =
  /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|flowcv\.me|behance\.net|medium\.com|twitter\.com|x\.com|leetcode\.com)\/?\S*/gi;
const HEADING =
  /\b(summary|profile|experience|education|skills|competencies|synopsis|qualifications|objective|manager|product|engineer|curriculum|vitae|resume|contact|university|college|work|and)\b/i;

export function splitPersonalDetails(text: string, fileName: string): SplitCv {
  const emails = text.match(EMAIL) ?? [];
  const phone = findPhone(text);
  const name = findName(text.split(/\r?\n/), fileName);

  let content = text.replace(URL_LIKE, "[LINK]").replace(EMAIL, "[EMAIL]");
  content = content.replace(PHONE, (m) => (isPhone(m) ? "[PHONE]" : m));

  // PDF layers often glue words together ("MEHTARohan"), so match each name part in its
  // lower, Title and UPPER forms wherever it isn't part of a longer lowercase word.
  // Two passes: replacing "Patel" in "PatelKAVYA" is what exposes "KAVYA" to the next match.
  for (let pass = 0; pass < 2; pass++) {
    for (const t of nameTokens(name)) {
      const forms = [t, titleCase(t), t.toUpperCase()].map(escapeRe).join("|");
      content = content.replace(new RegExp(`(?<![a-z])(?:${forms})(?![a-z])`, "g"), "[NAME]");
    }
  }

  return {
    personal: { name, email: cleanEmail(emails[0] ?? ""), phone },
    content: content.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function isPhone(m: string) {
  return (m.match(/\d/g) ?? []).length >= 10 && !/^(?:\s*(?:19|20)\d\d\s*[-–.]?\s*)+$/.test(m);
}

// Keeps the country code and the first 10 digits: designed PDFs sometimes repeat a number in an overlay.
function findPhone(text: string) {
  for (const m of text.match(PHONE) ?? []) {
    if (!isPhone(m)) continue;
    const t = m.trim();
    const cc = t.match(/^\+\d{1,3}/)?.[0] ?? "";
    const digits = t.slice(cc.length).replace(/\D/g, "").slice(0, 10);
    return cc ? `${cc} ${digits}` : digits;
  }
  return "";
}

// "REDDYsquad_5@..." - a surname from a PDF overlay glued to the front of the address.
function cleanEmail(e: string) {
  return e.replace(/^[A-Z]{2,}(?=[a-z0-9])/, "");
}

// The file name when it holds one ("07_aditya_nair.pdf" -> "Aditya Nair"); otherwise an early
// line that reads as a person's name and isn't a section heading.
function findName(lines: string[], fileName: string) {
  const fromFile = nameFromFile(fileName);
  if (fromFile.split(" ").length >= 2 && !HEADING.test(fromFile)) return fromFile;
  for (const raw of lines.slice(0, 5)) {
    const line = raw.trim();
    const words = line.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 4 &&
      words.every((w) => /^[A-Z][a-z]+\.?$/.test(w) || /^[A-Z]{2,}$/.test(w)) &&
      !HEADING.test(line)
    ) {
      return words.map(titleCase).join(" ");
    }
  }
  return fromFile;
}

export function nameFromFile(fileName: string) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^(?:s?pm[_-])?\d+[_-]/i, "")
    .replace(/\b(cv|resume|final|updated)\b/gi, "")
    .replace(/[_\-.\d]+/g, " ")
    .trim();
  return base ? base.split(/\s+/).map(titleCase).join(" ") : "Unnamed candidate";
}

function titleCase(w: string) {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter((t) => t.length >= 3);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The AI writes "[NAME]" where the candidate's name goes; the real first name is put back here, in code.
export function fillName(text: string, fullName: string) {
  const first = fullName.trim().split(/\s+/)[0] || "there";
  return text.replace(/\[NAME\]/g, first);
}
