export function SettingsAccessDenied() {
  return (
    <section className="rounded-[16px] border border-[#F9D4D4] bg-white p-5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
      <h1 className="text-[20px] font-[650] tracking-[-0.03em] text-[var(--text-primary)]">
        Настройки
      </h1>
      <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
        Этот раздел доступен только администратору приложения.
      </p>
    </section>
  );
}
