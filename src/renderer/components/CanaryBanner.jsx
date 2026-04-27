import React, { memo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { IS_CANARY } from '@shared/AppConstants';
import { shell } from 'electron';

const CANARY_ORANGE = '#e67e00';
const CANARY_BG = 'rgba(230, 126, 0, 0.12)';
const CANARY_BORDER = 'rgba(230, 126, 0, 0.3)';

const CanaryBanner = memo(() => {
    if (!IS_CANARY) return null;

    return (
        <Box
            sx={{
                bgcolor: CANARY_BG,
                borderTop: `1px solid ${CANARY_BORDER}`,
                borderBottom: `1px solid ${CANARY_BORDER}`,
                px: 3,
                py: 0.75,
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <Typography
                variant="caption"
                sx={{ color: CANARY_ORANGE, fontSize: '0.72rem', lineHeight: 1.4 }}
            >
                ⚡ <strong>Canary build</strong> — things may break. If they do, remove all app data and reinstall the{' '}
                <Box component="a" href="https://proxyscrape.com/proxy-checker" onClick={(e) => { e.preventDefault(); shell.openExternal('https://proxyscrape.com/proxy-checker'); }} sx={{ color: CANARY_ORANGE, textDecoration: 'underline', cursor: 'pointer' }}>stable version</Box>
                {' '}from our website.
            </Typography>
        </Box>
    );
});

export default CanaryBanner;
