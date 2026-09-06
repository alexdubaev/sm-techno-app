"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type SubmitEvent } from "react";

import {
  archiveLocalCrmClient,
  cancelCrmReminder,
  completeCrmReminder,
  confirmCrmExistingLink,
  createCrmContact,
  createCrmEvent,
  createCrmReminder,
  fetchCrmAudit,
  fetchCrmContacts,
  fetchCrmEvents,
  fetchCrmLinkCandidates,
  fetchCrmReminders,
  fetchCrmSyncConflicts,
  removeCrmAssignment,
  rescheduleCrmReminder as requestCrmReminderReschedule,
  resolveCrmSyncConflict,
  restoreLocalCrmClient,
  updateCrmClient,
} from "@/lib/api";
import type { CrmAuditAction, CrmContact, CrmEvent, CrmLinkCandidate, CrmReminder, CrmSyncConflict, CrmWorkspaceClient } from "@/lib/types";
import { moscowInputToUtc } from "@/components/crm/mobile/mobile-crm-utils";

type ActiveTab = "primary" | number;
type SavingAction = "contact" | "event" | "reminder" | "complete-reminder" | "cancel-reminder" | "requisites" | "archive" | "restore" | "remove" | "link" | "resolve";
type CompanyRequisitesForm = Pick<CrmWorkspaceClient, "documentName" | "fullName" | "inn" | "kpp" | "city" | "email" | "phone">;
type ContactForm = Pick<CrmContact, "name" | "phone" | "email" | "isPrimary">;
type EventForm = Pick<CrmEvent, "kind" | "body">;
type SyncConflictResolution = { conflict: CrmSyncConflict; choice: "local" | "remote" };

export type CrmClientDetailControllerOptions = {
  client: CrmWorkspaceClient;
  ownerId: number;
  activeTab: ActiveTab;
  ownerName: string;
  isAdmin: boolean;
  canEditWorkspace: boolean;
  canManageReminders: boolean;
  canResolveSyncConflicts: boolean;
  onChanged: (ownerId: number, activeTab: ActiveTab) => void;
};

export type DetailController = {
  currentClient: CrmWorkspaceClient;
  contacts: CrmContact[];
  events: CrmEvent[];
  reminders: CrmReminder[];
  audit: CrmAuditAction[];
  syncConflicts: CrmSyncConflict[];
  linkCandidates: CrmLinkCandidate[];
  linkCandidate: CrmLinkCandidate | null;
  isLoading: boolean;
  error: string | null;
  notice: string | null;
  isSaving: SavingAction | null;
  requisitesForm: CompanyRequisitesForm;
  contactForm: ContactForm;
  eventForm: EventForm;
  reminderDueAt: string;
  archiveReason: string;
  isArchiveConfirmationOpen: boolean;
  isRemoveAssignmentConfirmationOpen: boolean;
  syncConflictResolution: SyncConflictResolution | null;
  ownerName: string;
  canEditWorkspace: boolean;
  canManageReminders: boolean;
  canResolveSyncConflicts: boolean;
  canManageLocalClient: boolean;
  canRemoveAssignment: boolean;
  canConfirmExistingLink: boolean;
  setRequisitesForm: Dispatch<SetStateAction<CompanyRequisitesForm>>;
  setContactForm: Dispatch<SetStateAction<ContactForm>>;
  setEventForm: Dispatch<SetStateAction<EventForm>>;
  setReminderDueAt: Dispatch<SetStateAction<string>>;
  setArchiveReason: Dispatch<SetStateAction<string>>;
  setIsArchiveConfirmationOpen: Dispatch<SetStateAction<boolean>>;
  setIsRemoveAssignmentConfirmationOpen: Dispatch<SetStateAction<boolean>>;
  setLinkCandidate: Dispatch<SetStateAction<CrmLinkCandidate | null>>;
  setSyncConflictResolution: Dispatch<SetStateAction<SyncConflictResolution | null>>;
  saveContact: (event: SubmitEvent<HTMLFormElement>) => Promise<boolean | void>;
  saveEvent: (event: SubmitEvent<HTMLFormElement>) => Promise<boolean | void>;
  saveReminder: (event: SubmitEvent<HTMLFormElement>) => Promise<boolean | void>;
  transitionReminder: (reminder: CrmReminder, action: "complete" | "cancel") => Promise<void>;
  rescheduleReminder: (reminder: CrmReminder, dueAtLocal: string) => Promise<boolean | void>;
  saveCompanyRequisites: (event: SubmitEvent<HTMLFormElement>) => Promise<boolean | void>;
  archiveLocalClient: () => Promise<void>;
  restoreLocalClient: () => Promise<void>;
  removeAssignment: () => Promise<void>;
  confirmExistingLink: () => Promise<void>;
  resolveSyncConflict: () => Promise<void>;
};

function companyRequisitesForm(client: CrmWorkspaceClient): CompanyRequisitesForm {
  return {
    documentName: client.documentName,
    fullName: client.fullName,
    inn: client.inn,
    kpp: client.kpp,
    city: client.city,
    email: client.email,
    phone: client.phone,
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim() ? cause.message : fallback;
}

async function rescheduleCrmReminder(
  _clientId: number,
  reminderId: number,
  payload: { dueAt: string; expectedUpdatedAt: string },
  ownerId: number,
): Promise<CrmReminder> {
  return requestCrmReminderReschedule(reminderId, payload, ownerId);
}

export function useCrmClientDetailController(options: CrmClientDetailControllerOptions): DetailController {
  const { client, ownerId, activeTab, ownerName, isAdmin, canEditWorkspace, canManageReminders, canResolveSyncConflicts, onChanged } = options;
  const [currentClient, setCurrentClient] = useState(client);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [reminders, setReminders] = useState<CrmReminder[]>([]);
  const [audit, setAudit] = useState<CrmAuditAction[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<CrmSyncConflict[]>([]);
  const [linkCandidates, setLinkCandidates] = useState<CrmLinkCandidate[]>([]);
  const [linkCandidate, setLinkCandidate] = useState<CrmLinkCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<SavingAction | null>(null);
  const [requisitesForm, setRequisitesForm] = useState(() => companyRequisitesForm(client));
  const [contactForm, setContactForm] = useState<ContactForm>({ name: "", phone: "", email: "", isPrimary: false });
  const [eventForm, setEventForm] = useState<EventForm>({ kind: "comment", body: "" });
  const [reminderDueAt, setReminderDueAt] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [isArchiveConfirmationOpen, setIsArchiveConfirmationOpen] = useState(false);
  const [isRemoveAssignmentConfirmationOpen, setIsRemoveAssignmentConfirmationOpen] = useState(false);
  const [syncConflictResolution, setSyncConflictResolution] = useState<SyncConflictResolution | null>(null);
  const isResolvingSyncConflict = useRef(false);
  const notifyChanged = () => onChanged(ownerId, activeTab);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Preserve the extracted dialog's prop-driven reset behavior.
    setCurrentClient(client);
    setRequisitesForm(companyRequisitesForm(client));
    setIsArchiveConfirmationOpen(false);
    setIsRemoveAssignmentConfirmationOpen(false);
    setLinkCandidate(null);
    setSyncConflictResolution(null);
    setNotice(null);
  }, [client]);

  const refreshAudit = useCallback(async () => {
    setAudit(await fetchCrmAudit(currentClient.id, ownerId));
  }, [currentClient.id, ownerId]);

  const refreshSyncConflicts = useCallback(async () => {
    setSyncConflicts(await fetchCrmSyncConflicts(currentClient.id, ownerId));
  }, [currentClient.id, ownerId]);

  const refreshReminders = useCallback(async () => {
    const items = await fetchCrmReminders(ownerId);
    setReminders(items.filter((reminder) => reminder.clientId === currentClient.id && reminder.status === "active"));
  }, [currentClient.id, ownerId]);

  useEffect(() => {
    let active = true;
    // oxlint-disable-next-line react/react-compiler -- Loading must replace stale detail state before this request starts.
    setIsLoading(true);
    setError(null);
    void Promise.all([
      fetchCrmContacts(currentClient.id, ownerId),
      fetchCrmEvents(currentClient.id, ownerId),
      fetchCrmReminders(ownerId),
      fetchCrmAudit(currentClient.id, ownerId),
      fetchCrmLinkCandidates(currentClient.id, ownerId),
      fetchCrmSyncConflicts(currentClient.id, ownerId),
    ])
      .then(([nextContacts, nextEvents, nextReminders, nextAudit, nextCandidates, nextConflicts]) => {
        if (!active) return;
        setContacts(nextContacts);
        setEvents(nextEvents);
        setReminders(nextReminders.filter((reminder) => reminder.clientId === currentClient.id && reminder.status === "active"));
        setAudit(nextAudit);
        setLinkCandidates(nextCandidates);
        setSyncConflicts(nextConflicts);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, "Не удалось загрузить карточку клиента."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentClient.id, ownerId]);

  const saveContact = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditWorkspace) return;
    if (!contactForm.name.trim()) {
      setError("Укажите имя контакта.");
      return;
    }
    const temporary: CrmContact = {
      id: -Date.now(),
      name: contactForm.name.trim(),
      phone: contactForm.phone.trim(),
      email: contactForm.email.trim(),
      isPrimary: contactForm.isPrimary,
      createdAt: "",
      updatedAt: "",
    };
    setContacts((current) => [...current, temporary]);
    setIsSaving("contact");
    setError(null);
    try {
      const saved = await createCrmContact(currentClient.id, temporary, ownerId);
      setContacts((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setContactForm({ name: "", phone: "", email: "", isPrimary: false });
      notifyChanged();
      return true;
    } catch (cause) {
      setContacts((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить контакт. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const saveEvent = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditWorkspace) return;
    if (!eventForm.body.trim()) {
      setError("Введите описание события.");
      return;
    }
    const temporary: CrmEvent = {
      id: -Date.now(),
      kind: eventForm.kind,
      body: eventForm.body.trim(),
      authorUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: "",
    };
    setEvents((current) => [...current, temporary]);
    setIsSaving("event");
    setError(null);
    try {
      const saved = await createCrmEvent(currentClient.id, { kind: temporary.kind, body: temporary.body }, ownerId);
      setEvents((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setEventForm({ kind: "comment", body: "" });
      notifyChanged();
      return true;
    } catch (cause) {
      setEvents((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить событие. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const saveReminder = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageReminders) return;
    if (!canEditWorkspace) return;
    if (!reminderDueAt) {
      setError("Укажите дату и время напоминания.");
      return;
    }
    const temporary: CrmReminder = {
      id: -Date.now(),
      clientId: currentClient.id,
      dueAt: reminderDueAt,
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: "",
      cancelledAt: "",
      updatedAt: "",
    };
    setReminders((current) => [...current, temporary]);
    setIsSaving("reminder");
    setError(null);
    try {
      const saved = await createCrmReminder(currentClient.id, { dueAt: moscowInputToUtc(reminderDueAt) }, ownerId);
      setReminders((current) => current.map((item) => item.id === temporary.id ? saved : item));
      setReminderDueAt("");
      notifyChanged();
      return true;
    } catch (cause) {
      setReminders((current) => current.filter((item) => item.id !== temporary.id));
      setError(errorMessage(cause, "Не удалось добавить напоминание. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const transitionReminder = async (reminder: CrmReminder, action: "complete" | "cancel") => {
    if (!canManageReminders || reminder.status !== "active") return;
    const previousIndex = reminders.findIndex((item) => item.id === reminder.id);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));
    setIsSaving(action === "complete" ? "complete-reminder" : "cancel-reminder");
    setError(null);
    let transitionSucceeded = false;
    try {
      if (action === "complete") await completeCrmReminder(reminder.id, reminder.updatedAt, ownerId);
      else await cancelCrmReminder(reminder.id, reminder.updatedAt, ownerId);
      transitionSucceeded = true;
      notifyChanged();
      await Promise.all([refreshReminders(), refreshAudit()]);
      setNotice(action === "complete" ? "Напоминание отмечено выполненным." : "Напоминание отменено.");
    } catch (cause) {
      if (!transitionSucceeded) {
        setReminders((current) => current.some((item) => item.id === reminder.id) ? current : [...current.slice(0, previousIndex), reminder, ...current.slice(previousIndex)]);
        setError(errorMessage(cause, action === "complete" ? "Не удалось отметить напоминание выполненным. Изменение отменено." : "Не удалось отменить напоминание. Изменение отменено."));
      } else {
        setError(errorMessage(cause, "Напоминание изменено, но не удалось обновить карточку. Обновите её позже."));
      }
    } finally {
      setIsSaving(null);
    }
  };

  const rescheduleReminder = async (reminder: CrmReminder, dueAtLocal: string) => {
    if (!dueAtLocal || !canManageReminders) return;
    setIsSaving("reminder");
    setError(null);
    try {
      await rescheduleCrmReminder(currentClient.id, reminder.id, { dueAt: moscowInputToUtc(dueAtLocal), expectedUpdatedAt: reminder.updatedAt }, ownerId);
      notifyChanged();
      await refreshReminders();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось перенести напоминание.");
    } finally {
      setIsSaving(null);
    }
  };

  const saveCompanyRequisites = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditWorkspace) return;
    if (!requisitesForm.documentName.trim()) {
      setError("Укажите наименование компании.");
      return;
    }
    setIsSaving("requisites");
    setError(null);
    try {
      const saved = await updateCrmClient(currentClient.id, {
        documentName: requisitesForm.documentName.trim(),
        fullName: requisitesForm.fullName.trim(),
        inn: requisitesForm.inn.trim(),
        kpp: requisitesForm.kpp.trim(),
        city: requisitesForm.city.trim(),
        email: requisitesForm.email.trim(),
        phone: requisitesForm.phone.trim(),
        expectedVersion: currentClient.version,
      }, ownerId);
      setCurrentClient(saved);
      setRequisitesForm(companyRequisitesForm(saved));
      setNotice("Реквизиты компании сохранены.");
      notifyChanged();
      return true;
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось сохранить реквизиты компании. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const archiveLocalClient = async () => {
    setIsSaving("archive");
    setError(null);
    try {
      const result = await archiveLocalCrmClient(currentClient.id, { reason: archiveReason.trim(), expectedVersion: currentClient.version }, ownerId);
      setCurrentClient((item) => ({ ...item, syncStatus: "archived", syncError: archiveReason.trim(), version: result.version }));
      setIsArchiveConfirmationOpen(false);
      await refreshAudit();
      notifyChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось архивировать локального клиента. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const restoreLocalClient = async () => {
    setIsSaving("restore");
    setError(null);
    try {
      const result = await restoreLocalCrmClient(currentClient.id, { expectedVersion: currentClient.version }, ownerId);
      setCurrentClient((item) => ({ ...item, syncStatus: "local", syncError: "", version: result.version }));
      await refreshAudit();
      notifyChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось восстановить локального клиента. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const removeAssignment = async () => {
    setIsSaving("remove");
    setError(null);
    try {
      await removeCrmAssignment(currentClient.id, ownerId);
      setCurrentClient((item) => ({ ...item, assignment: null, rowPreference: null }));
      setIsRemoveAssignmentConfirmationOpen(false);
      await refreshAudit();
      notifyChanged();
      setNotice("Клиент оставлен только в основной вкладке «Клиенты 1С».");
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось оставить клиента только в основной вкладке. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const confirmExistingLink = async () => {
    if (!canEditWorkspace || !linkCandidate) return;
    setIsSaving("link");
    setError(null);
    try {
      const linked = await confirmCrmExistingLink(currentClient.id, linkCandidate.id, currentClient.version, ownerId);
      setCurrentClient(linked);
      setLinkCandidates([]);
      setLinkCandidate(null);
      await refreshAudit();
      notifyChanged();
    } catch (cause) {
      setError(errorMessage(cause, "Не удалось подтвердить связь с 1С. Изменение отменено."));
    } finally {
      setIsSaving(null);
    }
  };

  const resolveSyncConflict = async () => {
    if (!syncConflictResolution || isResolvingSyncConflict.current) return;
    const { conflict, choice } = syncConflictResolution;
    isResolvingSyncConflict.current = true;
    setIsSaving("resolve");
    setError(null);
    try {
      const resolved = await resolveCrmSyncConflict(currentClient.id, conflict.id, { choice, expectedUpdatedAt: conflict.updatedAt }, ownerId);
      setCurrentClient(resolved);
      setSyncConflictResolution(null);
      setSyncConflicts((current) => current.filter((item) => item.id !== conflict.id));
      notifyChanged();
      try {
        await refreshSyncConflicts();
        await refreshAudit();
        setNotice(choice === "local" ? "Локальное значение сохранено для конфликта синхронизации." : "Значение из 1С принято для конфликта синхронизации.");
      } catch (cause) {
        setError(errorMessage(cause, "Конфликт разрешён, но не удалось обновить данные карточки. Обновите страницу."));
      }
    } catch (cause) {
      setSyncConflictResolution(null);
      setError(errorMessage(cause, "Не удалось разрешить конфликт синхронизации."));
    } finally {
      isResolvingSyncConflict.current = false;
      setIsSaving(null);
    }
  };

  const canManageLocalClient = isAdmin && currentClient.linkedCounterpartyId === null;
  const canRemoveAssignment = isAdmin && currentClient.linkedCounterpartyId !== null && currentClient.assignment !== null && currentClient.assignment.archivedAt === null;
  const canConfirmExistingLink = canEditWorkspace && currentClient.linkedCounterpartyId === null && currentClient.syncStatus !== "archived";

  return {
    currentClient,
    contacts,
    events,
    reminders,
    audit,
    syncConflicts,
    linkCandidates,
    linkCandidate,
    isLoading,
    error,
    notice,
    isSaving,
    requisitesForm,
    contactForm,
    eventForm,
    reminderDueAt,
    archiveReason,
    isArchiveConfirmationOpen,
    isRemoveAssignmentConfirmationOpen,
    syncConflictResolution,
    ownerName,
    canEditWorkspace,
    canManageReminders,
    canResolveSyncConflicts,
    canManageLocalClient,
    canRemoveAssignment,
    canConfirmExistingLink,
    setRequisitesForm,
    setContactForm,
    setEventForm,
    setReminderDueAt,
    setArchiveReason,
    setIsArchiveConfirmationOpen,
    setIsRemoveAssignmentConfirmationOpen,
    setLinkCandidate,
    setSyncConflictResolution,
    saveContact,
    saveEvent,
    saveReminder,
    transitionReminder,
    rescheduleReminder,
    saveCompanyRequisites,
    archiveLocalClient,
    restoreLocalClient,
    removeAssignment,
    confirmExistingLink,
    resolveSyncConflict,
  };
}
