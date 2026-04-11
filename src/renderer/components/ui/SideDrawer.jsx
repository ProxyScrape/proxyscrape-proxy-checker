import React, { forwardRef } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Fade from '@mui/material/Fade';
import { FOOTER_BACKGROUND, DRAWER_BACKGROUND } from '../../theme/palette';

const TITLEBAR_HEIGHT = 38;

const CloseIcon = () => (
    <svg viewBox="0 0 224.512 224.512" style={{ width: 14, height: 14, fill: 'currentColor' }}>
        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
    </svg>
);

const DrawerPanel = forwardRef(({ width, headerLeft, onClose, children, sx }, ref) => (
    <Box ref={ref} sx={{
        position: 'fixed',
        top: TITLEBAR_HEIGHT,
        right: 0,
        bottom: 0,
        width,
        bgcolor: DRAWER_BACKGROUND,
        borderLeft: `1px solid ${FOOTER_BACKGROUND}`,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
        ...sx,
    }}>
        <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
            flexShrink: 0,
        }}>
            {headerLeft}
            <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                <CloseIcon />
            </IconButton>
        </Box>
        {children}
    </Box>
));

const SideDrawer = ({ open, onClose, width = 320, zIndex = 1100, headerLeft, children, panelSx }) => (
    <>
        <Fade in={!!open} timeout={200}>
            <Box
                onClick={onClose}
                sx={{
                    position: 'fixed',
                    top: TITLEBAR_HEIGHT,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    bgcolor: 'rgba(0,0,0,0.4)',
                    zIndex: zIndex - 1,
                    pointerEvents: open ? 'auto' : 'none',
                }}
            />
        </Fade>
        <Slide direction="left" in={!!open} mountOnEnter unmountOnExit>
            <DrawerPanel
                width={width}
                headerLeft={headerLeft}
                onClose={onClose}
                sx={{ zIndex, ...panelSx }}
            >
                {children}
            </DrawerPanel>
        </Slide>
    </>
);

export default SideDrawer;
