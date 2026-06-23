import { AppShell } from "@/components/app-shell";

export default function ReferencesPage() {
  return (
    <AppShell>
      <div className="rounded-[28px] bg-white p-8 shadow-[0_12px_30px_rgba(7,22,46,0.06)]">
        <h1 className="text-[40px] font-bold text-[var(--text-primary)]">Справочники</h1>
        <p className="mt-4 text-[var(--text-secondary)]">
          Справочники контрагентов, организаций и договоров оставим на текущем backend и перенесем следующим блоком.
        </p>
      </div>
    </AppShell>
  );
}
