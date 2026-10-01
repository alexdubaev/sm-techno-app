import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const {
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-live': ariaLive,
    'aria-busy': ariaBusy,
    'aria-hidden': ariaHidden,
    role,
    ...iconProps
  } = props;

  return (
    <output
      data-slot="spinner"
      aria-label={ariaLabel ?? 'Загрузка'}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-live={ariaLive}
      aria-busy={ariaBusy}
      aria-hidden={ariaHidden}
      role={role}
      className="inline-flex"
    >
      <Loader2Icon
        className={cn('size-4 animate-spin', className)}
        {...iconProps}
        aria-hidden="true"
      />
    </output>
  );
}

export { Spinner };
