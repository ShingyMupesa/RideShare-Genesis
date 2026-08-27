import { v4 as uuid } from 'uuid';

const PREFIXES = {
  user: 'usr',
  journey: 'jrn',
  match: 'mtc',
  booking: 'bkg',
  payment: 'pay',
  message: 'msg',
  safety: 'sfy',
  audit: 'adt',
};

export function newId(kind) {
  const prefix = PREFIXES[kind] || kind;
  return `${prefix}_${uuid().replace(/-/g, '').slice(0, 20)}`;
}
