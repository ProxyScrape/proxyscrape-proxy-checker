export const PAGE_BACKGROUND = '#262B40';
export const FOOTER_BACKGROUND = '#33374F';
export const DRAWER_BACKGROUND = '#1E2132';
export const CARD_BACKGROUND = '#282C3E';
export const TOOLTIP_BACKGROUND = '#1A1D2E';
export const LIGHT_BACKGROUND_GRADIENT = 'linear-gradient(180deg, #33374F 0%, #4A5D88 100%)';

export const black = {
  50: 'rgba(255, 255, 255, 0.2)',
  20: 'rgba(0, 0, 0, 0.2)',
  200: 'rgba(47, 43, 61, 0.3)',
  300: 'rgba(47, 43, 61, 0.4)',
  400: 'rgba(47, 43, 61, 0.6)',
  800: 'rgba(47, 43, 61, 0.9)',
};

export const gray = {
  50: 'rgba(223, 226, 237, 0.15)',
  100: 'rgba(223, 226, 237, 0.3)',
  300: 'rgba(152, 161, 177, 0.15)',
};

export const blueBrand = {
  50: 'rgba(142, 169, 255, 0.1)',
  100: 'rgba(109, 160, 210, 0.2)',
  200: 'rgba(159, 191, 224, 0.8)',
  300: '#A1D0FF',
  400: '#6DA0D2',
  500: '#4888C7',
  700: '#3D74A9',
};

export const navyBlue = {
  100: 'rgba(24, 28, 45, 0.2)',
  200: 'rgba(28, 60, 156, 0.2)',
  300: 'rgba(51, 55, 79, 0.4)',
  400: '#33374F',
  700: '#262B3F',
  800: '#142152',
};

export const green = {
  500: '#098709',
  600: '#219654',
};

export const palette = {
  mode: 'dark',
  background: {
    default: navyBlue[700],
    paper: '#252836',
  },
  primary: {
    main: blueBrand[500],
    dark: blueBrand[700],
  },
  error: {
    main: '#e74856',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#9CA3AF',
    disabled: 'rgba(255, 255, 255, 0.3)',
  },
  common: {
    black: '#0F0F0F',
    white: '#FFFFFF',
  },
  grey: {
    50: gray[50],
    100: gray[100],
    300: gray[300],
    400: '#E0E0E0',
    500: '#9CA3AF',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    A100: '#f5f5f5',
    A200: '#eeeeee',
    A400: '#bdbdbd',
    A700: '#616161',
  },
  success: {
    main: '#00B70B',
  },
  black,
  gray,
  blueBrand,
  navyBlue,
  green,
};
