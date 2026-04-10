import { alpha } from '@mui/material/styles';
import { blueBrand } from './palette';

export const components = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        margin: 0,
        overflow: 'hidden',
        counterReset: 'items-counter',
      },
      '#root': {
        position: 'relative',
        overflow: 'hidden',
      },
      '*, *::before, *::after': {
        boxSizing: 'border-box',
      },
      '::-webkit-scrollbar': {
        width: 6,
      },
      '::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 3,
      },
      '::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        borderRadius: 16,
        fontWeight: 600,
        fontSize: '0.9375rem',
      },
      contained: {
        '&:hover': {
          backgroundColor: blueBrand[700],
        },
      },
      containedPrimary: {
        backgroundColor: blueBrand[500],
        color: '#FFFFFF',
        boxShadow: `0 4px 14px ${alpha(blueBrand[500], 0.35)}`,
        '&:hover': {
          backgroundColor: blueBrand[700],
          boxShadow: `0 4px 18px ${alpha(blueBrand[500], 0.45)}`,
        },
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          borderRadius: 12,
          '& fieldset': {
            borderColor: alpha('#fff', 0.11),
          },
          '&:hover fieldset': {
            borderColor: alpha('#fff', 0.2),
          },
          '&.Mui-focused fieldset': {
            borderColor: blueBrand[500],
          },
        },
      },
    },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: {
        color: alpha('#fff', 0.3),
        '&.Mui-checked': {
          color: blueBrand[500],
        },
      },
    },
  },
  MuiSlider: {
    styleOverrides: {
      root: {
        color: blueBrand[500],
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      root: {
        borderBottom: `1px solid ${alpha('#fff', 0.08)}`,
      },
      indicator: {
        backgroundColor: blueBrand[300],
        height: 3,
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.875rem',
        color: alpha('#fff', 0.5),
        '&.Mui-selected': {
          color: '#FFFFFF',
        },
      },
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: {
        borderRadius: 4,
        backgroundColor: alpha('#fff', 0.08),
      },
      bar: {
        borderRadius: 4,
        backgroundColor: blueBrand[500],
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        fontWeight: 600,
        fontSize: '0.75rem',
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 16,
        backgroundColor: '#252836',
      },
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: {
        backgroundColor: '#252836',
      },
    },
  },
};
