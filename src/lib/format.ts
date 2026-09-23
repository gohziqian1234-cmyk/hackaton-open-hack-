/** Serial of a physical figure, e.g. "#014 / 100". */
export const serialLabel = (serial: number, cap: number) =>
  `#${String(serial).padStart(3, '0')} / ${cap}`;
