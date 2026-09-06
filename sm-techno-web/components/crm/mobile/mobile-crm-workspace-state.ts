import type { MobileDetailSection } from "@/components/crm/mobile/types";
import type { CrmReminder, CrmWorkspaceClient } from "@/lib/types";

export type OwnerReminderState = { ownerId: number; items: CrmReminder[] } | null;
export type WorkspaceViewIdentity = { ownerId: number; activeTab: "primary" | number };
export type WorkspaceClientView = WorkspaceViewIdentity & { clients: CrmWorkspaceClient[] };

export type MobileListContext = {
  search: string;
  scrollTop: number;
};

export type MobileDetailSelection = {
  client: CrmWorkspaceClient;
  initialSection: MobileDetailSection;
  listContext: MobileListContext;
};

export function applyOwnerReminderLoad(
  current: OwnerReminderState,
  activeOwnerId: number,
  requestOwnerId: number,
  items: CrmReminder[] | undefined,
): OwnerReminderState {
  if (activeOwnerId !== requestOwnerId || items === undefined) return current;
  return { ownerId: requestOwnerId, items };
}

export function getOwnerReminders(state: OwnerReminderState, ownerId: number): CrmReminder[] {
  return state?.ownerId === ownerId ? state.items : [];
}

function isSameWorkspaceView(left: WorkspaceViewIdentity, right: WorkspaceViewIdentity) {
  return left.ownerId === right.ownerId && left.activeTab === right.activeTab;
}

export function transitionWorkspaceClientView(
  current: WorkspaceClientView,
  target: WorkspaceViewIdentity,
  cachedClients: CrmWorkspaceClient[] | null,
): WorkspaceClientView {
  if (isSameWorkspaceView(current, target)) return current;
  return { ...target, clients: cachedClients ?? [] };
}

export function getWorkspaceClientsForView(
  state: WorkspaceClientView,
  activeView: WorkspaceViewIdentity,
): CrmWorkspaceClient[] {
  return isSameWorkspaceView(state, activeView) ? state.clients : [];
}

export function createMobileDetailSelection(
  client: CrmWorkspaceClient,
  initialSection: MobileDetailSection,
  listContext: MobileListContext,
): MobileDetailSelection {
  return { client, initialSection, listContext };
}

export async function resolveReminderDetailSelection({
  reminder,
  clients,
  ownerId,
  listContext,
  fetchClient,
}: {
  reminder: CrmReminder;
  clients: CrmWorkspaceClient[];
  ownerId: number;
  listContext: MobileListContext;
  fetchClient: (clientId: number, ownerId: number) => Promise<CrmWorkspaceClient>;
}): Promise<MobileDetailSelection> {
  const client = clients.find((item) => item.id === reminder.clientId) ?? await fetchClient(reminder.clientId, ownerId);
  return createMobileDetailSelection(client, "reminders", listContext);
}

export function getMobileListContextOnClose(selection: MobileDetailSelection): MobileListContext {
  return selection.listContext;
}
