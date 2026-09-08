const PREFIXES = {
  user: 'usr',
  journey: 'jrn',
  match: 'mtc',
  booking: 'bkg',
  payment: 'pay',
  message: 'msg',
  safety: 'sfy',
  audit: 'adt',
  reset: 'rst',
};

export function newId(kind) {
  const prefix = PREFIXES[kind] || kind;
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
