import React, { forwardRef } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Fade from '@mui/material/Fade';
import { FOOTER_BACKGROUND, DRAWER_BACKGROUND } from '../../theme/palette';
import { TITLEBAR_HEIGHT } from '../../constants/Layout';
import CloseIcon from './CloseIcon';

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
