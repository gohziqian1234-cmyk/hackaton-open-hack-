import { Button } from './Button';
type Props = {
  title: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  heading?: 'h1' | 'h2' | 'h3';
  centered?: boolean;
};
/** Error state: what failed, what to do, one action. */
export function ErrorNote({
  title,
  children,
  onRetry,
  retryLabel = 'Try again',
  heading: H = 'h2',
  centered = true,
}: Props) {
  return (
    <div className={'error-note' + (centered ? ' centered' : '')} role="alert">
      <H>{title}</H>
      {children && <p>{children}</p>}
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
