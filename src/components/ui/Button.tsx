import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}
