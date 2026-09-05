"use client";

import type { ImportantReminder } from "@/components/crm/mobile/mobile-crm-utils";
import type { MobileDetailSection } from "@/components/crm/mobile/types";
import type { CrmReminder, CrmTab, CrmWorkspaceClient } from "@/lib/types";

type ActiveTab = "primary" | number;

export type MobileCrmWorkspaceProps = {
  activeTab: ActiveTab;
  clients: CrmWorkspaceClient[];
  initialDetailSection: MobileDetailSection;
  importantReminders: ImportantReminder[];
  isLoading: boolean;
  isLoadingReminders: boolean;
  isRefreshing: boolean;
  nearestReminderByClient: ReadonlyMap<number, CrmReminder>;
  reminderError: string | null;
  search: string;
  selectedClient: CrmWorkspaceClient | null;
  tabs: CrmTab[];
  workspaceError: string | null;
  onCloseClient: () => void;
  onDetailChanged: (ownerId: number, activeTab: ActiveTab) => void;
  onOpenClient: (client: CrmWorkspaceClient, initialSection?: MobileDetailSection) => void;
  onOpenReminder: (reminder: CrmReminder) => void;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: ActiveTab) => void;
};

export function MobileCrmWorkspace({
  activeTab,
  clients,
  initialDetailSection,
  importantReminders,
  isLoading,
  isLoadingReminders,
  reminderError,
  search,
  selectedClient,
  tabs,
  workspaceError,
  onCloseClient,
}: MobileCrmWorkspaceProps) {
  const error = workspaceError ?? reminderError;

  return (
    <div
      data-mobile-crm-workspace=""
      data-active-tab={activeTab}
      data-client-count={clients.length}
      data-reminder-count={importantReminders.length}
      data-search={search}
      data-tab-count={tabs.length}
      aria-busy={isLoading || isLoadingReminders}
    >
      {error ? <p role="alert" className="rounded-[10px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</p> : null}
      {selectedClient ? (
        <section data-mobile-crm-detail="" data-initial-section={initialDetailSection} aria-label="Карточка клиента">
          <button type="button" onClick={onCloseClient} className="sr-only">Назад к списку клиентов</button>
          <h2 className="sr-only">{selectedClient.documentName || selectedClient.fullName || selectedClient.name}</h2>
        </section>
      ) : <div data-mobile-crm-list="" />}
    </div>
  );
}
