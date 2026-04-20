import React, { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import { openPsLink } from '../misc/links';
import { psUrl } from '../misc/other';

// Brand blue used only as an accent/highlight — never as text on a dark bg.
const ACCENT       = '#4888C7';
const ACCENT_LIGHT = '#A1D0FF'; // lighter variant — passes WCAG AA on dark surfaces
const DESKTOP_URL  = psUrl('/proxy-checker', 'guest-footer-banner');

const MonitorIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M21 2H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7v2H8v2h8v-2h-2v-2h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H3V4h18v12z"/>
    </svg>
);

const GuestModeBannerFooter = memo(() => (
    <Box
        sx={{
            // Slightly more opaque tint so the strip reads as a distinct surface.
            bgcolor: alpha(ACCENT, 0.13),
            borderTop:    `1px solid ${alpha(ACCENT, 0.35)}`,
            borderBottom: `1px solid ${alpha(ACCENT, 0.35)}`,
            px: 3,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
        }}
    >
        {/* Icon — stands alone so the text+button group wraps independently of it */}
        <Box sx={{ color: ACCENT_LIGHT, mt: '1px', flexShrink: 0 }}>
            <MonitorIcon />
        </Box>

        {/* Text + CTA in a flex-wrap group: when narrow, button falls under the text (not the icon) */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, flex: 1, minWidth: 0 }}>
            <Typography
                variant="caption"
                sx={{
                    color: alpha('#fff', 0.8),
                    fontSize: '0.72rem',
                    lineHeight: 1.4,
                }}
            >
                You're using the <strong style={{ color: '#fff' }}>online checker</strong> — the{' '}
                <Box
                    component="a"
                    href={DESKTOP_URL}
                    onClick={openPsLink}
                    sx={{
                        color: ACCENT_LIGHT,
                        textDecoration: 'underline',
                        textDecorationColor: alpha(ACCENT_LIGHT, 0.5),
                        cursor: 'pointer',
                        '&:hover': { textDecorationColor: ACCENT_LIGHT },
                    }}
                >
                    free desktop app
                </Box>
                {' '}has unlimited threads, custom judges & full history.
            </Typography>

            <Button
                size="small"
                variant="contained"
                href={DESKTOP_URL}
                onClick={openPsLink}
                sx={{
                    flexShrink: 0,
                    bgcolor: ACCENT,
                    color: '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    py: 0.35,
                    px: 1.5,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    boxShadow: 'none',
                    textTransform: 'none',
                    '&:hover': {
                        bgcolor: '#3D74A9',
                        boxShadow: 'none',
                    },
                }}
            >
                Get desktop app
            </Button>
        </Box>
    </Box>
));

GuestModeBannerFooter.displayName = 'GuestModeBannerFooter';

export default GuestModeBannerFooter;
