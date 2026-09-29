import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.candidate.findUnique({ where: { id }, select: { resumePdf: true, resumeFileName: true } });
  if (!c?.resumePdf) return new Response("Not found", { status: 404 });
  const name = (c.resumeFileName ?? "resume.pdf").replace(/[^\w.\- ]/g, "_");
  return new Response(Buffer.from(c.resumePdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` },
  });
}
