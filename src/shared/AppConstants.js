export const isPortable = process.env.PORTABLE_EXECUTABLE_DIR ? true : false;
export const isDev = process.env.NODE_ENV === 'production' ? false : true;

// Set to true on the canary branch. Controls update UX and warnings throughout the app.
export const IS_CANARY = true;
