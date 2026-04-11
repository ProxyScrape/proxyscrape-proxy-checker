import React from 'react';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { FOOTER_BACKGROUND, TOOLTIP_BACKGROUND } from '../../theme/palette';

const tooltipSx = {
    tooltip: {
        bgcolor: TOOLTIP_BACKGROUND,
        color: 'text.primary',
        fontSize: '0.78rem',
        lineHeight: 1.5,
        border: `1px solid ${FOOTER_BACKGROUND}`,
        borderRadius: '8px',
        px: 1.5,
        py: 1,
        maxWidth: 280,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        whiteSpace: 'pre-line',
    },
    arrow: {
        color: TOOLTIP_BACKGROUND,
        '&::before': {
            border: `1px solid ${FOOTER_BACKGROUND}`,
        },
    },
};

export const HelpTip = ({ title, children, placement = 'top' }) => (
    <Tooltip
        title={title}
        arrow
        placement={placement}
        slotProps={{ tooltip: { sx: tooltipSx.tooltip }, arrow: { sx: tooltipSx.arrow } }}
    >
        {children}
    </Tooltip>
);

export const InfoIcon = ({ title, placement = 'top' }) => (
    <Tooltip
        title={title}
        arrow
        placement={placement}
        slotProps={{ tooltip: { sx: tooltipSx.tooltip }, arrow: { sx: tooltipSx.arrow } }}
    >
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                ml: 0.75,
                color: alpha('#fff', 0.3),
                cursor: 'help',
                verticalAlign: 'middle',
                '&:hover': { color: alpha('#fff', 0.6) },
                transition: 'color 0.2s',
            }}
        >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-6h2v6zm0-8H9V5h2v2z" />
            </svg>
        </Box>
    </Tooltip>
);

export default HelpTip;
