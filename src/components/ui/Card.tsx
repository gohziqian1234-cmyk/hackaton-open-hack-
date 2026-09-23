type Props = {
  variant?: 'orbit' | 'panel';
  as?: 'div' | 'section' | 'article' | 'aside';
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;
/** `orbit` is a raised dark card; `panel` is the light printed box-panel surface. */
export function Card({ variant = 'orbit', as: Tag = 'div', className = '', children, ...rest }: Props) {
  return (
    <Tag className={(variant === 'panel' ? 'panel ' : 'card ') + className} {...rest}>
      {children}
    </Tag>
  );
}
