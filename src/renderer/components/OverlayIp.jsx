import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import FullScreenOverlay from './ui/FullScreenOverlay';

const OverlayIp = ({ isActive, currentIP, isLookupDone, isLookupSuccess }) => (
    <FullScreenOverlay isActive={isActive}>
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
    </FullScreenOverlay>
);

export default OverlayIp;
