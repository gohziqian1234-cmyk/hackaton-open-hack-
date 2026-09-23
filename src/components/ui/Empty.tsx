type Props = {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  heading?: 'h1' | 'h2' | 'h3';
  centered?: boolean;
};
/** Empty state: a title, one sentence, one next action. */
export function Empty({ title, children, action, icon, heading: H = 'h2', centered = true }: Props) {
  return (
    <div className={'empty-state' + (centered ? ' centered' : '')}>
      {icon && <span className="empty-icon">{icon}</span>}
      <H>{title}</H>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
