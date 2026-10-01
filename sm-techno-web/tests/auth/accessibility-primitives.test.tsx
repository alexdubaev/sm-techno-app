import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Label } from '@/components/ui/label';
import { PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

it('associates independent labels with the correct fields and focuses them by pointer', async () => {
  const user = userEvent.setup();
  render(<form><Label htmlFor="first">Первый клиент</Label><input id="first" /><Label htmlFor="second">Второй клиент</Label><input id="second" /></form>);
  await user.click(screen.getByText('Второй клиент'));
  expect(screen.getByRole('textbox', { name: 'Второй клиент' })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('textbox', { name: 'Первый клиент' })).toHaveFocus();
});

it('keeps pagination as named links and activates once without submitting a form', async () => {
  const user = userEvent.setup();
  const activated = vi.fn((event: React.MouseEvent) => event.preventDefault());
  const submitted = vi.fn((event: React.SyntheticEvent) => event.preventDefault());
  render(<form onSubmit={submitted}><PaginationPrevious href="#previous" onClick={activated} /><PaginationLink href="#page" onClick={activated}>2</PaginationLink><PaginationNext href="#next" onClick={activated} /></form>);
  const previous = screen.getByRole('link', { name: 'Предыдущая страница' });
  const next = screen.getByRole('link', { name: 'Следующая страница' });
  await user.click(previous);
  expect(activated).toHaveBeenCalledTimes(1);
  next.focus();
  await user.keyboard('{Enter}');
  expect(activated).toHaveBeenCalledTimes(2);
  expect(submitted).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '#page');
});
