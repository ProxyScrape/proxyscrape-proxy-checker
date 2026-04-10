import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

const OverlayIp = ({ isActive, currentIP, isLookupDone, isLookupSuccess }) => (
    <Box sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: alpha(PAGE_BACKGROUND, 0.95),
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
    }}>
        <Box sx={{ textAlign: 'center' }}>
            {!isLookupDone && (
                <CircularProgress size={48} sx={{ mb: 2 }} />
            )}
            {isLookupDone && (
                <Typography variant="body1" sx={{
                    fontWeight: 500,
                    color: isLookupSuccess ? 'text.primary' : 'error.main',
                }}>
                    {isLookupSuccess ? `Your IP address: ${currentIP}` : 'IP lookup error. Please try change lookup address.'}
                </Typography>
            )}
        </Box>
    </Box>
);

export default OverlayIp;
