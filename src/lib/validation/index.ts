/**
 * Validation of data/projects/** and the reference tables it depends on:
 * schema, geometry, money, history, sources, locale vocabulary and the
 * pointers between projects. `collectErrors` gathers everything for a root;
 * `validateAll` prints it and exits non-zero on any error, so builds fail
 * loudly. Each check is a pure function so a test can hold it to a rule
 * without touching the filesystem.
 */
export * from "./geometry";
export * from "./references";
export * from "./money";
export * from "./history";
export * from "./sources";
export * from "./locale";
export * from "./collect";
