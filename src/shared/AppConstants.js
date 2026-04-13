export const isPortable = process.env.PORTABLE_EXECUTABLE_DIR ? true : false;
export const isDev = process.env.NODE_ENV === 'production' ? false : true;

// Injected at build time from package.json version — true if version contains "-canary".
// Do not hardcode this value; change the version string in package.json instead.
export const IS_CANARY = __IS_CANARY__;
