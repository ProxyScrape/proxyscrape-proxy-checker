import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { openPsLink } from '../../misc/links';

const DownloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

const DESKTOP_URL = 'https://proxyscrape.com/proxy-checker';

/**
 * Guest-mode restriction callout — two-tone card with a distinct header row.
 * Header strip: icon + feature name on a slightly darker background.
 * Body: description + CTA button on normal paper background.
 *
 * @param {object} props
 * @param {string} props.feature      Short feature name, e.g. "Judge settings"
 * @param {string} props.description  One sentence on why it's desktop-only.
 */
export function GuestModeBannerV3Option5({ feature, description }) {
    return (
        <Box
            sx={{
                mb: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
            }}
        >
            {/* Header strip */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    px: 2,
                    py: 1.25,
                    bgcolor: 'action.hover',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Box
                    sx={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        borderRadius: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'primary.main',
                        opacity: 0.9,
                    }}
                >
                    <DownloadIcon />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {feature} — desktop only
                </Typography>
            </Box>

            {/* Body */}
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.paper' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25, lineHeight: 1.5 }}>
                    {description}
                </Typography>
                <Button
                    component="a"
                    href={DESKTOP_URL}
                    onClick={openPsLink}
                    variant="contained"
                    size="small"
                    endIcon={<ExternalLinkIcon />}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}
                >
                    Get the free desktop app
                </Button>
            </Box>
        </Box>
    );
}
