export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <div className={err ? "flash flash-err" : "flash"} role="status">{err ?? msg}</div>;
}
