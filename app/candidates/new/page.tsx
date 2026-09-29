import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { Flash } from "@/components/Flash";
import { UploadForm } from "@/components/UploadForm";

export const dynamic = "force-dynamic";
// Server actions on this page may start scoring a CV.
export const maxDuration = 300;

export default async function NewCandidates({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; msg?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, title: true, team: true } });

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="page-head">
        <div>
          <h1>Add CVs</h1>
          <p className="muted">Drop in one CV or the whole folder. PDF, DOCX and TXT all work.</p>
        </div>
      </div>
      <UploadForm roles={roles} defaultRoleId={sp.role} ai={aiConfigured()} />
    </>
  );
}
