import { DCS } from '@springfield/ham-radio-api';

export const dcsValues: DCS[] = Object.values(DCS).filter(value => 'number' === typeof value) as DCS[];

export const dcsByValue = new Map<number, DCS>(); // index -> DCS value
export const valuesByDcs = new Map<DCS, number>(); // DCS value -> index

dcsValues.forEach((value, index) => {
  dcsByValue.set(index, value);
  valuesByDcs.set(value, index);
});
