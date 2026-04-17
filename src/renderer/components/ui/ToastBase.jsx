import React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

// Shared animation variants for all toast cards.
export const CARD_VARIANTS = {
    hidden:  { y: 80, opacity: 0, scale: 0.92 },
    visible: {
        y: 0, opacity: 1, scale: 1,
        transition: {
            y:       { type: 'spring', stiffness: 380, damping: 28, mass: 0.9 },
            opacity: { duration: 0.25, ease: 'easeOut' },
            scale:   { duration: 0.25, ease: 'easeOut' },
        },
    },
    exit: {
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.18, ease: 'easeIn' },
    },
};

const ToastDismissIcon = () => (
    <svg viewBox="0 0 224.512 224.512" style={{ width: 10, height: 10, fill: 'currentColor' }}>
        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
    </svg>
);

export const ToastDismissButton = ({ onClick }) => (
    <IconButton
        onClick={onClick}
        size="small"
        sx={{
            color: alpha('#fff', 0.5),
            flexShrink: 0,
            ml: 0.5,
            mt: -0.25,
            '&:hover': { color: alpha('#fff', 0.9), bgcolor: alpha('#fff', 0.06) },
        }}
    >
        <ToastDismissIcon />
    </IconButton>
);

/**
 * ToastHeader — standard title row used by all simple toasts.
 *
 * Wraps the title (and optional subtitle children) in a flex column so the
 * dismiss button always aligns to the top-right without overlapping text.
 * Pass titleSx to override title colour (e.g. error toasts use 'error.main').
 */
export const ToastHeader = ({ title, titleSx, onDismiss, children }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', ...titleSx }}>
                {title}
            </Typography>
            {children}
        </Box>
        {onDismiss && <ToastDismissButton onClick={onDismiss} />}
    </Box>
);

/**
 * ToastCard — the shared card shell used by all toast notifications.
 * accentColor sets the 2px top-border stripe that signals the notification type.
 */
export const ToastCard = ({ accentColor = 'rgba(255,255,255,0.18)', children }) => (
    <Box sx={{
        bgcolor: 'background.paper',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: `2px solid ${accentColor}`,
    }}>
        <Box sx={{ p: '14px 16px 16px' }}>
            {children}
        </Box>
    </Box>
);
