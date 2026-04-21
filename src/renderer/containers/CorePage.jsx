import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { start } from '../actions/CheckingActions';
import { getGuestLimits } from '../misc/mode';
import InputV2 from './InputV2';
import Core from './Core';
import Protocols from './Protocols';

/**
 * Core tab layout.
 *
 * Desktop (≥ sm):
 *   Two-column grid — proxy editor fills the left; settings sidebar on the right
 *   contains the chip bar, sliders, protocols, and the Check button inline.
 *
 * Mobile (< sm):
 *   Single column stack — editor → protocols → core settings.
 *   The Check button is rendered as a fixed floating bar just above the footer.
 */
const CorePage = ({ proxyCount, overLimit, start }) => {
    const isMobile = useMediaQuery('(max-width:839px)');
    const isEmpty = proxyCount === 0;

    // Measure the footer's actual rendered height so the floating button always
    // clears it, even when links wrap to two lines on narrow screens.
    const [footerHeight, setFooterHeight] = useState(0);
    useEffect(() => {
        const footer = document.querySelector('footer');
        if (!footer) return;
        const ro = new ResizeObserver(() => setFooterHeight(footer.offsetHeight));
        ro.observe(footer);
        setFooterHeight(footer.offsetHeight); // read immediately
        return () => ro.disconnect();
    }, []);

    const scrollToEditor = () => {
        const scrollRoot = document.getElementById('checker-scroll-root');
        if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleMobileCheck = () => {
        if (isEmpty) {
            scrollToEditor();
            return;
        }
        start();
    };

    if (isMobile) {
        return (
            <Box>
                {/* 1. Proxy editor */}
                <InputV2 />

                {/* 2. Protocol selection (no inline Check button — it floats below) */}
                <Box sx={{ mt: 2 }}>
                    <Protocols showCheckButton={false} />
                </Box>

                {/* 3. Chip options + sliders */}
                <Box sx={{ mt: 2 }}>
                    <Core />
                </Box>

                {/* Spacer so last content item isn't hidden behind the floating button */}
                <Box sx={{ height: 72 }} />

                {/* Floating Check button — fixed just above the footer */}
                <Box sx={{
                    position: 'fixed',
                    bottom: footerHeight,
                    left: 0,
                    right: 0,
                    px: { xs: 2, sm: 5 },
                    py: 1,
                    bgcolor: 'background.default',
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    zIndex: 50,
                }}>
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleMobileCheck}
                        disabled={overLimit}
                        aria-disabled={isEmpty && !overLimit ? true : undefined}
                        sx={isEmpty && !overLimit ? { opacity: 0.45, cursor: 'default' } : {}}
                    >
                        Check
                    </Button>
                </Box>
            </Box>
        );
    }

    // Desktop: two-column grid
    return (
        <Box sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 300px',
            gap: 2,
            alignItems: 'start',
        }}>
            {/* Left: proxy editor */}
            <InputV2 />

            {/* Right: settings sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Core />
                <Protocols
                    showCheckButton
                    onEmptyCheck={scrollToEditor}
                />
            </Box>
        </Box>
    );
};

const mapStateToProps = state => {
    const limits = getGuestLimits();
    return {
        proxyCount: state.input.list.length,
        overLimit: limits !== null && state.input.list.length > limits.inFlightProxies,
    };
};

const mapDispatchToProps = { start };

export default connect(mapStateToProps, mapDispatchToProps)(CorePage);
