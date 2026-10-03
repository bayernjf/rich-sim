// @rich-sim/core barrel.
// Wave 0: types + version. Wave 1 gate: functions + catalog merged by the
// OrganizeAgent after the three parallel lines landed.
export * from './types';
export * from './functions';
export * from './catalog-data';

/** Engine version; bumped whenever formulas or assumptions change semantics. */
export const CORE_VERSION = '0.1.0';
