/** Placeholder block. Never use a spinner outside the game. */
export function Skeleton({
  width = '100%',
  height = 24,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}
