import React from 'react';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../../theme/palette';

const FullScreenOverlay = ({ isActive, children }) => (
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
        {children}
    </Box>
);

export default FullScreenOverlay;
