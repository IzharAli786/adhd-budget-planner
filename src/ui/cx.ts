/** Joins class names, skipping falsy ones: cx('a', on && 'b'). */
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')
