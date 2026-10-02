import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  Carousel,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { InputOTPSeparator } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';

vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), undefined],
}));

it('names the carousel region and presents slide content as a native group', () => {
  const { rerender } = render(
    <Carousel>
      <CarouselPrevious />
      <CarouselItem aria-label="Первый слайд">Содержимое</CarouselItem>
      <CarouselNext />
    </Carousel>,
  );
  expect(screen.getByRole('region', { name: 'Карусель' })).toHaveAttribute(
    'aria-roledescription',
    'carousel',
  );
  const slide = screen.getByRole('group', { name: 'Первый слайд' });
  expect(slide.tagName).toBe('FIELDSET');
  expect(slide).toHaveClass('m-0', 'min-w-0', 'border-0', 'p-0', 'pl-4');

  rerender(
    <Carousel aria-label="Подборка товаров">
      <CarouselItem>Слайд</CarouselItem>
    </Carousel>,
  );
  expect(
    screen.getByRole('region', { name: 'Подборка товаров' }),
  ).toBeInTheDocument();
});

it('uses a visually hidden native separator while hiding its decorative icon', () => {
  const { container } = render(<InputOTPSeparator />);
  const separator = screen.getByRole('separator');
  expect(separator.tagName).toBe('HR');
  expect(separator).toHaveClass('sr-only');
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it('exposes loading text on a status output and keeps its icon decorative', () => {
  const { rerender, container } = render(<Spinner className="text-blue-600" />);
  let status = screen.getByRole('status', { name: 'Загрузка' });
  expect(status.tagName).toBe('OUTPUT');
  expect(status.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(status.firstElementChild).toHaveClass(
    'size-4',
    'animate-spin',
    'text-blue-600',
  );

  rerender(<Spinner aria-label="Синхронизация" />);
  status = screen.getByRole('status', { name: 'Синхронизация' });
  expect(status.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getAllByRole('status')).toHaveLength(1);

  rerender(
    <>
      <span id="sync-description">Обновление каталога</span>
      <Spinner aria-labelledby="sync-description" aria-busy="true" />
    </>,
  );
  const labelledStatus = container.querySelector('output');
  expect(labelledStatus).toHaveAttribute('aria-labelledby', 'sync-description');
  expect(labelledStatus).toHaveAttribute('aria-busy', 'true');
  expect(
    screen.getByRole('status', { name: 'Обновление каталога' }),
  ).toBeInTheDocument();

  rerender(<Spinner aria-label="Скрытая загрузка" aria-hidden="true" />);
  expect(container.querySelector('output')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
