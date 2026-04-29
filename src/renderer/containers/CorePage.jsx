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

    // Single render tree — InputV2 stays mounted across breakpoint changes.
    //
    // Desktop (≥ 840px): two-column grid. The editor column uses
    // position:absolute;inset:0 to fill the grid row height set by the sidebar,
    // without contributing to that height itself (prevents unbounded growth).
    // See CSS Grid spec §8.1: height:% in an auto row is indefinite, so
    // flex/height:100% chains fail — absolute positioning is the fix.
    //
    // Mobile (< 840px): single-column grid. The absolute positioning wrappers
    // are still present but inactive (position:static), so InputV2 sizes
    // naturally. CSS `order` swaps Core below Protocols in the sidebar without
    // changing the DOM order.
    return (
        <>
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
                gap: 2,
            }}>
                {/* Editor — stable tree position in both layouts */}
                <Box sx={{ position: 'relative', minWidth: 0 }}>
                    <Box sx={isMobile
                        ? { display: 'flex', flexDirection: 'column' }
                        : { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }
                    }>
                        <InputV2 fillHeight={!isMobile} />
                    </Box>
                </Box>

                {/* Sidebar — stacks below the editor on mobile, right column on desktop.
                    DOM order is Protocols → Core. On desktop the flex order reverses
                    them (Core above Protocols) via CSS `order`. On mobile they stay
                    in DOM order so Protocols appears above Core, matching the
                    original mobile UX. */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ order: isMobile ? 0 : 1 }}>
                        <Protocols
                            showCheckButton={!isMobile}
                            onEmptyCheck={isMobile ? undefined : scrollToEditor}
                        />
                    </Box>
                    <Box sx={{ order: isMobile ? 1 : 0 }}>
                        <Core />
                    </Box>
                </Box>
            </Box>

            {/* Mobile only: spacer so content isn't hidden behind the floating button */}
            {isMobile && <Box sx={{ height: 72 }} />}

            {/* Mobile only: floating Check button fixed just above the footer */}
            {isMobile && (
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
            )}
        </>
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
