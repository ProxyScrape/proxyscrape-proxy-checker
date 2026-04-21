import React from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { HelpTip, tooltipSx } from './HelpTip';
import { blueBrand } from '../../theme/palette';
import { openPsLink } from '../../misc/links';
import { alpha } from '@mui/material/styles';

const DESKTOP_URL = 'https://proxyscrape.com/proxy-checker';

/**
 * Compact pill-shaped toggle chip.
 *
 * Props:
 *   label      — chip label text
 *   active     — whether the option is currently enabled
 *   onClick    — called when toggled (only if not locked)
 *   tip        — help tooltip shown when not locked
 *   lockedTip  — when present the chip is disabled and shows a guest-mode tooltip.
 *                Same shape as Checkbox: { feature: string, description: string }
 */
const ToggleChip = ({ label, active, onClick, tip, lockedTip }) => {
    const isLocked = Boolean(lockedTip);

    const chip = (
        <Box
            component="button"
            type="button"
            onClick={isLocked ? undefined : onClick}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.4,
                px: 1.25,
                py: '5px',
                borderRadius: '100px',
                border: '1px solid',
                borderColor: isLocked
                    ? 'rgba(255,255,255,0.1)'
                    : active
                    ? blueBrand[500]
                    : 'rgba(255,255,255,0.15)',
                bgcolor: isLocked
                    ? 'transparent'
                    : active
                    ? alpha(blueBrand[500], 0.18)
                    : 'transparent',
                color: isLocked
                    ? 'text.disabled'
                    : active
                    ? blueBrand[300]
                    : 'text.secondary',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.78rem',
                fontWeight: 600,
                lineHeight: 1,
                transition: 'border-color 0.15s, background-color 0.15s, color 0.15s',
                outline: 'none',
                userSelect: 'none',
                // Reset native button appearance without using the `background` shorthand,
                // which would override `bgcolor` (background-color) set above.
                appearance: 'none',
                WebkitAppearance: 'none',
                '&:hover': isLocked ? {} : {
                    borderColor: active ? blueBrand[400] : 'rgba(255,255,255,0.3)',
                    bgcolor: active ? alpha(blueBrand[500], 0.26) : 'rgba(255,255,255,0.05)',
                    color: active ? blueBrand[200] : 'text.primary',
                },
                '&:focus-visible': {
                    outline: `2px solid ${blueBrand[500]}`,
                    outlineOffset: 2,
                },
            }}
        >
            <Box component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', color: 'inherit' }}>
                {label}
            </Box>
            {isLocked && (
                <LockOutlinedIcon sx={{ fontSize: '0.65rem', opacity: 0.5, flexShrink: 0 }} />
            )}
        </Box>
    );

    if (isLocked) {
        const tooltipTitle = (
            <Box sx={{ fontSize: 'inherit' }}>
                {tip && (
                    <Box component="span" sx={{ display: 'block', opacity: 0.65, mb: 0.6 }}>
                        {tip}
                    </Box>
                )}
                <Box component="span" sx={{ display: 'block', fontWeight: 700, mb: 0.3 }}>
                    {lockedTip.feature} — desktop only
                </Box>
                <Box component="span" sx={{ display: 'block', opacity: 0.65, mb: 0.6 }}>
                    {lockedTip.description}
                </Box>
                <Box
                    component="a"
                    href={DESKTOP_URL}
                    onClick={openPsLink}
                    sx={{ display: 'inline-block', color: blueBrand[300], cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                    Get the free desktop app ↗
                </Box>
            </Box>
        );
        return (
            <Tooltip
                title={tooltipTitle}
                arrow
                placement="top"
                slotProps={{ tooltip: { sx: { ...tooltipSx.tooltip, maxWidth: 300 } }, arrow: { sx: tooltipSx.arrow } }}
            >
                {/* span wrapper needed so Tooltip can attach ref to non-interactive element */}
                <span style={{ display: 'inline-flex' }}>{chip}</span>
            </Tooltip>
        );
    }

    if (tip) {
        return <HelpTip title={tip}>{chip}</HelpTip>;
    }

    return chip;
};

export default ToggleChip;
