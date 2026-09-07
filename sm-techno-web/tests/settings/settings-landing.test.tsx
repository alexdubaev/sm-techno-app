import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsFeedback } from '../../components/settings/shared/settings-feedback';
import { SettingsLanding } from '../../components/settings/shared/settings-landing';
import { SettingsShell } from '../../components/settings/shared/settings-shell';

afterEach(cleanup);

describe('SettingsLanding', () => {
  it('renders exactly the two specified Settings destinations with counts, links, and image descriptions', () => {
    render(
      <SettingsLanding
        activeUsersCount={9}
        onecHref="/settings/onec"
        totalUsersCount={12}
        usersHref="/settings/users"
      />,
    );

    const destinations = screen.getAllByRole('link');

    expect(destinations).toHaveLength(2);
    expect(destinations[0]).toHaveAttribute('href', '/settings/users');
    expect(destinations[1]).toHaveAttribute('href', '/settings/onec');
    expect(
      screen.getByRole('heading', { name: 'Пользователи' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Учетные записи, роли и доступ к 1С'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('definition', { name: 'Всего 12' }),
    ).toHaveTextContent('12');
    expect(
      screen.getByRole('definition', { name: 'Активны 9' }),
    ).toHaveTextContent('9');
    expect(
      screen.getByRole('heading', { name: 'Интеграция с 1С' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Подключение, заказы, документы и НДС'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Управление учетными записями пользователей',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Обмен данными между СМ ТЕХНО и 1С' }),
    ).toBeInTheDocument();
  });

  it('notifies the route wrapper when a destination is chosen', async () => {
    const user = userEvent.setup();
    const onUsersNavigate = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const onOnecNavigate = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );

    render(
      <SettingsLanding
        activeUsersCount={3}
        onOnecNavigate={onOnecNavigate}
        onUsersNavigate={onUsersNavigate}
        totalUsersCount={4}
        usersHref="/settings/users"
        onecHref="/settings/onec"
      />,
    );

    await user.click(screen.getByRole('link', { name: /Пользователи/ }));
    await user.click(screen.getByRole('link', { name: /Интеграция с 1С/ }));

    expect(onUsersNavigate).toHaveBeenCalledOnce();
    expect(onOnecNavigate).toHaveBeenCalledOnce();
  });

  it('keeps headings and user-count descriptions outside phrasing-only wrappers', () => {
    const { container } = render(
      <SettingsLanding
        activeUsersCount={3}
        totalUsersCount={4}
        usersHref="/settings/users"
        onecHref="/settings/onec"
      />,
    );

    // span accepts phrasing content; headings and description lists need flow containers.
    expect(container.querySelector('span h2, span dl, span div')).toBeNull();
  });
});

describe('shared Settings chrome', () => {
  it('gives nested settings screens a labelled header and back navigation', () => {
    render(
      <SettingsShell backHref="/settings" title="Пользователи">
        <p>Содержимое</p>
      </SettingsShell>,
    );

    expect(
      screen.getByRole('heading', { name: 'Пользователи' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Вернуться в настройки' }),
    ).toHaveAttribute('href', '/settings');
    expect(screen.getByText('Содержимое')).toBeInTheDocument();
  });

  it('announces status and error feedback with the appropriate live role', () => {
    const { rerender } = render(
      <SettingsFeedback message="Настройки сохранены" tone="success" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Настройки сохранены');

    rerender(<SettingsFeedback message="Не удалось сохранить" tone="error" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
  });
});
