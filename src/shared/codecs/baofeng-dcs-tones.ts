import { DCS } from '@springfield/ham-radio-api';

export const dcsValues: DCS[] = Object.values(DCS).filter(value => typeof value === 'number') as DCS[];

export const dcsByValue = new Map<number, DCS>(); // index -> DCS value
export const valuesByDcs = new Map<DCS, number>(); // DCS value -> index

for (let index = 0; index < dcsValues.length; index += 1) {
  const value = dcsValues[index];
  dcsByValue.set(index, value);
  valuesByDcs.set(value, index);
}
