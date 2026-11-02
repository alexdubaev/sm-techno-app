/** Shared look of the document flow: one yellow main action per step, light secondary actions. */
export const primaryAction='app-action-button app-action-button--touch app-action-button--wrap';
export const secondaryAction=`${primaryAction} app-action-button--secondary`;
export const dangerAction=`${primaryAction} app-action-button--danger`;
export const compactSecondaryAction='app-action-button app-action-button--secondary app-action-button--compact app-action-button--wrap';
export const control='min-h-10 w-full min-w-0 rounded-[10px] border border-[var(--border-color)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] transition-[border-color,box-shadow] duration-200 hover:border-[#c9d3e1] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.2)] focus:outline-none disabled:bg-[#f7f9fc] disabled:text-[var(--text-secondary)]';
export const fieldLabel='grid min-w-0 gap-1 text-sm font-medium text-[var(--text-primary)]';
export const card='grid min-w-0 gap-3 rounded-xl border border-[var(--border-color)] bg-white p-3 sm:p-4';
export const cardTitle='text-base font-bold text-[var(--text-primary)] outline-none';
export const muted='text-xs text-[var(--text-secondary)]';
export const busyProps=(busy: boolean) => ({'aria-busy':busy || undefined});
