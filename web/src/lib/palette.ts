// Colours. One accent for the interface; the categorical series colours are
// only used to give model families an identity in the curve chart and its
// legend (validated for adjacent-pair and colour-vision separation on the
// panel surface).

export const ACCENT = '#377249';
export const NULL_COLOR = '#8e897f';

export const SERIES = [
  '#a5492b', // oxide red
  '#377249', // green
  '#a06a20', // ochre
  '#6f655a', // taupe
  '#6b7a2e', // olive
  '#c9744f', // terracotta
  '#5a4636', // umber
  '#b8932f', // gold
];

/** Colour by proposal order among the non-null options, so it never changes with rank. */
export function familyColors(order: string[], isNull: (id: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  for (const id of order) {
    if (isNull(id)) {
      out[id] = NULL_COLOR;
      continue;
    }
    out[id] = SERIES[i % SERIES.length] ?? NULL_COLOR;
    i += 1;
  }
  return out;
}
