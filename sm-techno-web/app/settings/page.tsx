"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { AppShell } from "@/components/app-shell";
import {
  createAppUser,
  deleteAppUser,
  fetchSystemSettings,
  fetchUsers,
  saveSystemSettings,
  updateAppUser,
} from "@/lib/api";
import type { AppUser, SystemSettings } from "@/lib/types";

const textFields: Array<{ key: keyof SystemSettings; label: string; placeholder?: string }> = [
  { key: "base_url", label: "URL базы 1С", placeholder: "https://.../odata/standard.odata" },
  { key: "default_organization_key", label: "Организация по умолчанию (Key)" },
  { key: "sale_operation", label: "Вид операции" },
  { key: "currency_key", label: "ВалютаДокумента_Key" },
  { key: "order_type_key", label: "ВидЗаказа" },
  { key: "order_type_type", label: "ВидЗаказа_Type" },
  { key: "price_type_key", label: "ВидЦен_Key" },
  { key: "order_state_key", label: "СостояниеЗаказа" },
  { key: "order_state_type", label: "СостояниеЗаказа_Type" },
  { key: "sale_unit_key", label: "СтруктурнаяЕдиницаПродажи_Key" },
  { key: "reserve_unit_key", label: "СтруктурнаяЕдиницаРезерв_Key" },
  { key: "business_operation_key", label: "ХозяйственнаяОперация_Key" },
  { key: "vat_rate_key", label: "СтавкаНДС_Key" },
  { key: "vat_percent", label: "Ставка НДС, %", placeholder: "22" },
  { key: "unit_type", label: "ЕдиницаИзмерения_Type" },
];

const ROLE_LABELS: Record<AppUser["role"], string> = {
  admin: "Администратор",
  user: "Пользователь",
};

export default function SettingsPage() {
  const { isAdmin, refreshUser, user } = useAuth();
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isOneCSettingsExpanded, setIsOneCSettingsExpanded] = useState(false);
  const [isCreateUserExpanded, setIsCreateUserExpanded] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    fullName: "",
    appPassword: "",
    role: "user" as AppUser["role"],
    onecUsername: "",
    onecPassword: "",
  });
  const [manageForm, setManageForm] = useState({
    fullName: "",
    appPassword: "",
    role: "user" as AppUser["role"],
    onecUsername: "",
    onecPassword: "",
    isActive: true,
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateOnecPassword, setShowCreateOnecPassword] = useState(false);
  const [showManagePassword, setShowManagePassword] = useState(false);
  const [showManageOnecPassword, setShowManageOnecPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void loadPageData();
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    setManageForm({
      fullName: selectedUser.fullName,
      appPassword: selectedUser.appPassword ?? "",
      role: selectedUser.role,
      onecUsername: selectedUser.onecUsername,
      onecPassword: selectedUser.onecPassword ?? "",
      isActive: selectedUser.isActive,
    });
  }, [selectedUser]);

  async function loadPageData() {
    setIsLoading(true);
    setError(null);

    try {
      const [settings, loadedUsers] = await Promise.all([fetchSystemSettings(), fetchUsers()]);
      setForm(settings);
      setUsers(loadedUsers);
      setSelectedUserId((current) => current ?? loadedUsers[0]?.id ?? null);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось загрузить настройки и пользователей."));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveSettings() {
    if (!form) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveSystemSettings(form);
      setMessage("Системные настройки сохранены.");
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось сохранить настройки."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateUser() {
    if (!createForm.username.trim() || !createForm.appPassword.trim()) {
      setError("Укажите логин и стартовый пароль нового пользователя.");
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const created = await createAppUser({
        username: createForm.username.trim(),
        password: createForm.appPassword,
        appPassword: createForm.appPassword,
        fullName: createForm.fullName.trim(),
        role: createForm.role,
        onecUsername: createForm.onecUsername.trim(),
        onecPassword: createForm.onecPassword,
      });
      const loadedUsers = await fetchUsers();
      setUsers(loadedUsers);
      setSelectedUserId(created.id);
      setCreateForm({
        username: "",
        fullName: "",
        appPassword: "",
        role: "user",
        onecUsername: "",
        onecPassword: "",
      });
      setMessage(`Пользователь "${created.username}" создан.`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось создать пользователя."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateUser() {
    if (!selectedUser) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updated = await updateAppUser(selectedUser.id, manageForm);
      const loadedUsers = await fetchUsers();
      setUsers(loadedUsers);
      setSelectedUserId(updated.id);
      if (updated.id === user.id) {
        await refreshUser();
      }
      setMessage(`Пользователь "${updated.username}" обновлен.`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось обновить пользователя."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUser() {
    if (!selectedUser) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить пользователя "${selectedUser.username}"? Действие необратимо.`,
    );
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await deleteAppUser(selectedUser.id);
      const deletedUsername = selectedUser.username;
      const loadedUsers = await fetchUsers();
      setUsers(loadedUsers);
      setSelectedUserId((current) => {
        if (current !== selectedUser.id) {
          return current ?? loadedUsers[0]?.id ?? null;
        }
        return loadedUsers[0]?.id ?? null;
      });
      setMessage(`Пользователь "${deletedUsername}" удален.`);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "Не удалось удалить пользователя."));
    } finally {
      setIsSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="rounded-[18px] border border-[#F9D4D4] bg-white p-5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
          <h1 className="text-[20px] font-[650] tracking-[-0.04em] text-[var(--text-primary)]">Настройки</h1>
          <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            Этот раздел доступен только администратору приложения.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2 rounded-[16px] bg-white p-2.5 shadow-[0_10px_24px_rgba(7,22,46,0.06)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-[650] leading-none tracking-[-0.04em] text-[var(--text-primary)]">
              Настройки и пользователи
            </h1>
            <p className="mt-1 max-w-[56rem] text-[11px] leading-4 text-[var(--text-secondary)]">
              Здесь администратор управляет системными параметрами 1С, создает учетные записи и назначает права доступа.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadPageData()}
              disabled={isLoading || isSaving}
              className="flex h-[36px] items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Загрузка..." : "Обновить"}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={!form || isSaving}
              className="flex h-[36px] items-center justify-center rounded-[12px] bg-[var(--brand-dark)] px-4 text-[12px] font-semibold text-white transition hover:bg-[#10264A] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
            >
              {isSaving ? "Сохранение..." : "Сохранить настройки"}
            </button>
          </div>
        </header>

        {message ? (
          <div className="rounded-[12px] border border-[#D8F0DE] bg-[#ECFDF3] px-3 py-2 text-[11px] text-[var(--stock-ok)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[12px] border border-[#F9D4D4] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[var(--stock-empty)]">
            {error}
          </div>
        ) : null}

        <section className="rounded-[16px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2.5">
          {!form ? (
            <div className="px-2 py-6 text-[12px] text-[var(--text-secondary)]">
              {isLoading ? "Загружаем системные настройки..." : "Настройки пока недоступны."}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsOneCSettingsExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[var(--border-color)] bg-white px-3 py-2 text-left transition hover:bg-[#F8FAFD]"
              >
                <div>
                  <h2 className="text-[15px] font-[650] text-[var(--text-primary)]">Настройки 1С</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                    URL базы, учетные параметры документа и НДС для отправки заказов в 1С.
                  </p>
                </div>
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border-color)] text-[var(--text-secondary)] transition-transform duration-200",
                    isOneCSettingsExpanded ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              </button>

              {isOneCSettingsExpanded ? (
                <>
                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {textFields.map((field) => (
                      <label key={field.key} className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                          {field.label}
                        </span>
                        <input
                          type="text"
                          value={form[field.key] ?? ""}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setForm((current) =>
                              current
                                ? {
                                    ...current,
                                    [field.key]: event.target.value,
                                  }
                                : current,
                            )
                          }
                          className="h-[36px] w-full rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 py-2 text-[12px] text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.vat_included === "1"}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  vat_included: event.target.checked ? "1" : "0",
                                }
                              : current,
                          )
                        }
                        className="h-4 w-4 accent-[var(--brand-yellow)]"
                      />
                      НДС включать в стоимость
                    </label>

                    <label className="flex items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 py-2 text-[12px] text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.sum_includes_vat === "1"}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? {
                                  ...current,
                                  sum_includes_vat: event.target.checked ? "1" : "0",
                                }
                              : current,
                          )
                        }
                        className="h-4 w-4 accent-[var(--brand-yellow)]"
                      />
                      Сумма документа включает НДС
                    </label>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>

        <div className="grid gap-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-[16px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-[650] text-[var(--text-primary)]">Пользователи</h2>
                <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                  Администратор может создавать учетные записи и менять права доступа.
                </p>
              </div>
              <div className="rounded-[10px] border border-[var(--border-color)] bg-white px-2.5 py-1 text-[10px] text-[var(--text-secondary)]">
                Всего: {users.length}
              </div>
            </div>

            <div className="mt-2 overflow-hidden rounded-[14px] border border-[var(--border-color)] bg-white">
              {users.length === 0 ? (
                <div className="px-3 py-6 text-[12px] text-[var(--text-secondary)]">Пока нет пользователей.</div>
              ) : (
                <table className="min-w-full table-fixed border-collapse text-[11px]">
                  <thead className="bg-[#FAFBFD] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Логин</th>
                      <th className="px-3 py-2 font-semibold">Имя</th>
                      <th className="px-3 py-2 font-semibold">Роль</th>
                      <th className="px-3 py-2 font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => {
                      const isSelected = item.id === selectedUserId;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedUserId(item.id)}
                          className={[
                            "cursor-pointer border-t border-[var(--border-color)] transition-colors",
                            isSelected ? "bg-[#FFF8D9]" : "hover:bg-[#F8FAFD]",
                          ].join(" ")}
                        >
                          <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{item.username}</td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">{item.fullName || "—"}</td>
                          <td className="px-3 py-2 text-[var(--text-primary)]">{ROLE_LABELS[item.role]}</td>
                          <td className="px-3 py-2">
                            <span className={item.isActive ? "text-[var(--stock-ok)]" : "text-[var(--stock-empty)]"}>
                              {item.isActive ? "Активен" : "Отключен"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-2">
            <section className="rounded-[16px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2.5">
              <h2 className="text-[15px] font-[650] text-[var(--text-primary)]">Управление доступом</h2>
              {!selectedUser ? (
                <div className="mt-2 text-[12px] text-[var(--text-secondary)]">Выберите пользователя слева.</div>
              ) : (
                <div className="mt-2 grid gap-2">
                  <div className="rounded-[12px] border border-[var(--border-color)] bg-white px-3 py-2 text-[12px] text-[var(--text-primary)]">
                    <div className="font-semibold">{selectedUser.username}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                      {selectedUser.fullName || "Без полного имени"}
                    </div>
                  </div>

                  <LabeledField label="Полное имя">
                    <input
                      type="text"
                      value={manageForm.fullName}
                      onChange={(event) =>
                        setManageForm((current) => ({ ...current, fullName: event.target.value }))
                      }
                      className={fieldClassName}
                    />
                  </LabeledField>

                  <div className="grid gap-2 md:grid-cols-2">
                    <LabeledField label="Роль">
                      <select
                        value={manageForm.role}
                        onChange={(event) =>
                          setManageForm((current) => ({ ...current, role: event.target.value as AppUser["role"] }))
                        }
                        className={fieldClassName}
                      >
                        <option value="user">Пользователь</option>
                        <option value="admin">Администратор</option>
                      </select>
                    </LabeledField>

                    <label className="flex items-end">
                      <span className="flex h-[36px] w-full items-center gap-2 rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={manageForm.isActive}
                          onChange={(event) =>
                            setManageForm((current) => ({ ...current, isActive: event.target.checked }))
                          }
                          className="h-4 w-4 accent-[var(--brand-yellow)]"
                        />
                        Активен
                      </span>
                    </label>
                  </div>

                  <LabeledField label="Пароль приложения">
                    <PasswordField
                      value={manageForm.appPassword}
                      onChange={(value) =>
                        setManageForm((current) => ({ ...current, appPassword: value }))
                      }
                      visible={showManagePassword}
                      onToggleVisibility={() => setShowManagePassword((current) => !current)}
                      placeholder="Если пусто, задайте новый пароль для входа"
                    />
                  </LabeledField>

                  <LabeledField label="Логин 1С">
                    <input
                      type="text"
                      value={manageForm.onecUsername}
                      onChange={(event) =>
                        setManageForm((current) => ({ ...current, onecUsername: event.target.value }))
                      }
                      className={fieldClassName}
                    />
                  </LabeledField>

                  <LabeledField label="Пароль 1С">
                    <PasswordField
                      value={manageForm.onecPassword}
                      onChange={(value) =>
                        setManageForm((current) => ({ ...current, onecPassword: value }))
                      }
                      visible={showManageOnecPassword}
                      onToggleVisibility={() =>
                        setShowManageOnecPassword((current) => !current)
                      }
                    />
                  </LabeledField>

                  <button
                    type="button"
                    onClick={() => void handleUpdateUser()}
                    disabled={isSaving}
                    className="flex h-[36px] items-center justify-center rounded-[12px] border border-[var(--border-color)] bg-white px-4 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Сохранить доступ
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteUser()}
                    disabled={isSaving || selectedUser.id === user.id}
                    className="flex h-[36px] items-center justify-center rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 text-[12px] font-semibold text-[var(--stock-empty)] transition hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedUser.id === user.id ? "Нельзя удалить себя" : "Удалить пользователя"}
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-[16px] border border-[var(--border-color)] bg-[var(--page-bg)] p-2.5">
              <button
                type="button"
                onClick={() => setIsCreateUserExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[var(--border-color)] bg-white px-3 py-2 text-left transition hover:bg-[#F8FAFD]"
              >
                <div>
                  <h2 className="text-[15px] font-[650] text-[var(--text-primary)]">Новый пользователь</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                    Создание новой учетной записи с ролью и данными для входа.
                  </p>
                </div>
                <span
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--border-color)] text-[var(--text-secondary)] transition-transform duration-200",
                    isCreateUserExpanded ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              </button>

              {isCreateUserExpanded ? (
                <div className="mt-2 grid gap-2">
                  <LabeledField label="Логин">
                    <input
                      type="text"
                      value={createForm.username}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, username: event.target.value }))
                      }
                      className={fieldClassName}
                    />
                  </LabeledField>
                  <LabeledField label="Полное имя">
                    <input
                      type="text"
                      value={createForm.fullName}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                      }
                      className={fieldClassName}
                    />
                  </LabeledField>
                  <LabeledField label="Логин 1С">
                    <input
                      type="text"
                      value={createForm.onecUsername}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, onecUsername: event.target.value }))
                      }
                      className={fieldClassName}
                    />
                  </LabeledField>
                  <LabeledField label="Пароль 1С">
                    <PasswordField
                      value={createForm.onecPassword}
                      onChange={(value) => setCreateForm((current) => ({ ...current, onecPassword: value }))}
                      visible={showCreateOnecPassword}
                      onToggleVisibility={() => setShowCreateOnecPassword((current) => !current)}
                    />
                  </LabeledField>
                  <div className="grid gap-2 md:grid-cols-2">
                    <LabeledField label="Пароль приложения">
                      <PasswordField
                        value={createForm.appPassword}
                        onChange={(value) =>
                          setCreateForm((current) => ({ ...current, appPassword: value }))
                        }
                        visible={showCreatePassword}
                        onToggleVisibility={() => setShowCreatePassword((current) => !current)}
                      />
                    </LabeledField>
                    <LabeledField label="Роль">
                      <select
                        value={createForm.role}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            role: event.target.value as AppUser["role"],
                          }))
                        }
                        className={fieldClassName}
                      >
                        <option value="user">Пользователь</option>
                        <option value="admin">Администратор</option>
                      </select>
                    </LabeledField>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateUser()}
                    disabled={isSaving}
                    className="flex h-[36px] items-center justify-center rounded-[12px] bg-[var(--brand-dark)] px-4 text-[12px] font-semibold text-white transition hover:bg-[#10264A] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
                  >
                    Создать пользователя
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function PasswordField({
  value,
  onChange,
  visible,
  onToggleVisibility,
  placeholder = "",
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisibility: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClassName} pr-20`}
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[9px] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] transition hover:bg-[#F8FAFD] hover:text-[var(--text-primary)]"
      >
        {visible ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 5.25L7 9.25L11 5.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const fieldClassName =
  "h-[36px] w-full rounded-[12px] border border-[var(--border-color)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[#94A3B8] focus:border-[var(--brand-yellow)] focus:shadow-[0_0_0_3px_rgba(255,196,0,0.12)]";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
