import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export interface ParsedResume {
  fileName: string;
  text: string;
  // The original PDF, kept so Arjun can open it. Never sent to the AI (it contains personal details).
  pdf: Buffer | null;
}

// Vercel caps a request at 4.5 MB, and uploads are batched to stay under it.
const MAX_BYTES = 4 * 1024 * 1024;

// CVs arrive in mixed formats. Everything is turned into plain text here, so personal details
// can be split out in code before any AI step sees the CV.
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const name = file.name || "resume";
  if (file.size > MAX_BYTES) throw new Error(`${name} is larger than 4 MB. Compress it or save a smaller PDF.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = name.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf" || file.type === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    if (!text.trim()) throw new Error(`${name} has no readable text (it may be a scanned image). Upload a text PDF or DOCX.`);
    return { fileName: name, text: text.trim(), pdf: buf };
  }
  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    if (!value.trim()) throw new Error(`${name} has no readable text.`);
    return { fileName: name, text: value.trim(), pdf: null };
  }
  if (["txt", "md", "text", "rtf"].includes(ext) || file.type.startsWith("text/")) {
    const text = buf.toString("utf8").trim();
    if (!text) throw new Error(`${name} is empty.`);
    return { fileName: name, text, pdf: null };
  }
  if (ext === "doc") throw new Error(`${name} is an old .doc file. Save it as .docx or PDF and upload again.`);
  throw new Error(`${name}: unsupported file type. Use PDF, DOCX or TXT.`);
}
