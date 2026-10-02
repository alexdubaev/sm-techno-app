import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BreadcrumbPage } from '@/components/ui/breadcrumb';
import { ButtonGroup } from '@/components/ui/button-group';
import { Field, FieldLegend } from '@/components/ui/field';

it('exposes the current breadcrumb as a page label, not a disabled link', () => {
  render(<BreadcrumbPage>Склад</BreadcrumbPage>);
  expect(screen.getByText('Склад')).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'Склад' })).not.toBeInTheDocument();
});

it('activates grouped buttons once by pointer, Enter, or Space without submitting the form', async () => {
  const user = userEvent.setup();
  const activate = vi.fn();
  const submit = vi.fn((event: React.SyntheticEvent) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <ButtonGroup aria-label="Инструменты">
        <button type="button" onClick={activate}>Сохранить</button>
      </ButtonGroup>
    </form>,
  );

  const group = screen.getByRole('group', { name: 'Инструменты' });
  expect(group.tagName).toBe('FIELDSET');
  const button = screen.getByRole('button', { name: 'Сохранить' });
  await user.click(button);
  expect(activate).toHaveBeenCalledTimes(1);
  button.focus();
  await user.keyboard('{Enter}');
  expect(activate).toHaveBeenCalledTimes(2);
  await user.keyboard(' ');
  expect(activate).toHaveBeenCalledTimes(3);
  expect(submit).not.toHaveBeenCalled();
});

it('lets native disabled fieldsets disable and skip their controls with forward and reverse Tab', async () => {
  const user = userEvent.setup();
  render(
    <form>
      <button type="button">До</button>
      <ButtonGroup aria-label="Недоступные действия" disabled>
        <button type="button">Сохранить</button>
      </ButtonGroup>
      <button type="button">После</button>
    </form>,
  );
  const disabledControl = screen.getByRole('button', { name: 'Сохранить' });
  expect(disabledControl).toBeDisabled();
  await user.tab();
  expect(screen.getByRole('button', { name: 'До' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'После' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'До' })).toHaveFocus();
});

it('uses fieldset semantics and native disabled control behavior for a field', () => {
  render(
    <Field disabled>
      <FieldLegend>Данные клиента</FieldLegend>
      <input aria-label="Наименование" />
    </Field>,
  );
  expect(screen.getByRole('group', { name: 'Данные клиента' }).tagName).toBe('FIELDSET');
  expect(screen.getByRole('textbox', { name: 'Наименование' })).toBeDisabled();
});
