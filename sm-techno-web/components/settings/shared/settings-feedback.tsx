import type { ReactNode } from 'react';

export type SettingsFeedbackProps = {
  message?: ReactNode;
  tone?: 'info' | 'success' | 'error';
};

const toneStyles = {
  info: 'border-[#cbd5e1] bg-[#f7f9fc] text-[#33435c]',
  success: 'border-[#a7d7b3] bg-[#f1faf3] text-[#185c2a]',
  error: 'border-[#efb0b0] bg-[#fff5f5] text-[#9f2525]',
} as const;

export function SettingsFeedback({
  message,
  tone = 'info',
}: SettingsFeedbackProps) {
  if (!message) return null;

  return (
    <div
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`rounded-xl border px-4 py-3 text-sm leading-5 ${toneStyles[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {message}
    </div>
  );
}
