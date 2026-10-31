// Display the preserved decimal string without rounding or Number conversion.
export function sourceRupees(value: string | null) {
  if (value === null || !/^\d+(\.\d+)?$/.test(value)) return 'Amount unavailable';
  const [whole, fraction] = value.split('.'),
    tail = whole.slice(-3),
    head = whole.slice(0, -3);
  const grouped = head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail : tail;
  return '₹' + grouped + (fraction === undefined ? '' : '.' + fraction);
}
