import mammoth from "mammoth";

export interface ParsedResume {
  fileName: string;
  text: string | null;
  pdf: Buffer | null;
}

// Vercel caps a request at 4.5 MB, and uploads are batched to stay under it.
const MAX_BYTES = 4 * 1024 * 1024;

// CVs arrive in mixed formats. PDFs are kept as-is and sent to Gemini as documents;
// Word and text files are converted to plain text.
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const name = file.name || "resume";
  if (file.size > MAX_BYTES) throw new Error(`${name} is larger than 4 MB. Compress it or save a smaller PDF.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = name.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf" || file.type === "application/pdf") {
    return { fileName: name, text: null, pdf: buf };
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

export function nameFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").replace(/\b(cv|resume)\b/gi, "").trim();
  return base ? `Unnamed (${base})` : "Unnamed candidate";
}
