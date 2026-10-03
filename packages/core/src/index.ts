// @rich-sim/core barrel. Wave 0: types + version only.
// functions.ts and catalog-data.ts exports are merged here by the
// OrganizeAgent at the Wave 1 gate — do not edit concurrently.
export * from './types';

/** Engine version; bumped whenever formulas or assumptions change semantics. */
export const CORE_VERSION = '0.1.0';
