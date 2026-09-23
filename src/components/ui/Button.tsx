import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
type Variant = 'primary' | 'ghost' | 'quiet';
type Props = {
  variant?: Variant;
  wide?: boolean;
  href?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;
/** One component for buttons and button-styled links. Pass `href` to render a Next <Link>. */
export function Button({
  variant = 'primary',
  wide = false,
  href,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  const classes = ['btn', 'btn-' + variant, wide ? 'btn-wide' : '', className]
    .filter(Boolean)
    .join(' ');
  if (href) {
    const anchorProps = Object.fromEntries(
      Object.entries(rest).filter(
        ([key]) => key.startsWith('aria-') || ['id', 'title', 'onClick'].includes(key),
      ),
    );
    return (
      <Link className={classes} href={href} {...anchorProps}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} type={type} {...rest}>
      {children}
    </button>
  );
}
