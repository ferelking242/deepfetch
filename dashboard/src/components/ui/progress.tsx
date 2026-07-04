import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  className?: string
  indicatorClassName?: string
}

export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className={cn('h-full bg-primary transition-all duration-700 ease-out rounded-full', indicatorClassName)}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  )
}
