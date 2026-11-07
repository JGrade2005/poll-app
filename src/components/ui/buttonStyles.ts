export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 select-none text-center'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:hover:bg-blue-700',
  secondary:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:hover:bg-white',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:hover:bg-transparent',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
}

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim()
}
