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
        // Always scroll the internal container (works in standalone and desktop).
        const scrollRoot = document.getElementById('checker-scroll-root');
        if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });

        // When embedded in an iframe the internal scroll container may not be
        // scrollable (content fits the sized iframe), and the user's view of the
        // editor depends on where the parent page is scrolled. Ask the parent to
        // bring the iframe into view instead.
        if (window.self !== window.top) {
            window.parent.postMessage({ type: 'checker-scroll-top' }, '*');
        }
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

    // Desktop: two-column grid.
    // The sidebar (right column) has a natural content height that sets the row
    // height. The editor column uses position:absolute;inset:0 inside a
    // position:relative grid item — this removes the editor from flow so it
    // cannot contribute to the row height (which would cause unbounded growth
    // when proxies are loaded). The absolutely-positioned child then fills the
    // already-resolved grid area height with no circular dependency.
    // See CSS Grid spec §8.1: height:% in an auto row is indefinite (treated as
    // auto), so flex/height:100% chains fail — absolute positioning is the fix.
    return (
        <Box sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 300px',
            gap: 2,
        }}>
            {/* Left: position:relative gives the absolute child a definite
                containing block (the grid area height set by the sidebar).
                minWidth:0 prevents the column from overflowing its 1fr track. */}
            <Box sx={{ position: 'relative', minWidth: 0 }}>
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                    <InputV2 fillHeight />
                </Box>
            </Box>

            {/* Right: sidebar — its natural height is the single source of truth
                for the grid row height. */}
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
