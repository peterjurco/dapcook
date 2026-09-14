import { cn } from '@/lib/utils/cn'

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <span className={cn('font-fraunces text-emerald-700', className)}>dapcook</span>
  )
}
