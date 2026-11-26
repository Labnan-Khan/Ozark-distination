import { ATTRIBUTE_TYPES, RENTAL_PERIODS } from '../../shared/constants/index.js';

export const CATEGORY_ATTRIBUTE_TYPES = Object.freeze(Object.values(ATTRIBUTE_TYPES));

export const DEFAULT_RENTAL_PERIODS = Object.freeze([RENTAL_PERIODS.MONTHLY]);

/** Each attribute data type writes exactly one typed slot on an AttributeValue. */
export const ATTRIBUTE_VALUE_SLOTS = Object.freeze({
  [ATTRIBUTE_TYPES.STRING]: 'stringValue',
  [ATTRIBUTE_TYPES.ENUM]: 'stringValue',
  [ATTRIBUTE_TYPES.NUMBER]: 'numberValue',
  [ATTRIBUTE_TYPES.INTEGER]: 'numberValue',
  [ATTRIBUTE_TYPES.BOOLEAN]: 'booleanValue',
  [ATTRIBUTE_TYPES.MULTI_ENUM]: 'arrayValue',
  [ATTRIBUTE_TYPES.DATE]: 'dateValue'
});

export const CATEGORY_SORT_OPTIONS = Object.freeze([
  'sortOrder',
  '-sortOrder',
  'name',
  '-name',
  'createdAt',
  '-createdAt'
]);
