import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { getToastBottom } from '../constants/Layout';
import { isGuestMode } from '../misc/mode';
import { CARD_VARIANTS, ToastCard, ToastHeader } from './ui/ToastBase';
import { clearError } from '../store/reducers/app';
import { openPsLink } from '../misc/links';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

const ERROR_ACCENT = '#e74856';
const CARD_WIDTH = 320;
const AUTO_DISMISS_MS = 30000;

const cardStyle = (checkingOpen) => ({
    position: 'fixed',
    bottom: getToastBottom(checkingOpen, isGuestMode()),
    left: `calc(50% - ${CARD_WIDTH / 2}px)`,
    zIndex: 1400,
    width: CARD_WIDTH,
    pointerEvents: 'auto',
    transition: 'bottom 0.3s ease',
});

const ExternalLinkIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, verticalAlign: 'middle' }}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

const ErrorToast = ({ error, errorCta, onClose, checkingOpen }) => {
    const hovered = useRef(false);
    const timerRef = useRef(null);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        if (!error) return;

        const schedule = () => {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                if (hovered.current) {
                    // User is hovering — check again after a short interval
                    schedule();
                } else {
                    onClose();
                }
            }, AUTO_DISMISS_MS);
        };

        schedule();
        return () => clearTimeout(timerRef.current);
    }, [error, onClose]);

    const handleMouseEnter = () => { hovered.current = true; };
    const handleMouseLeave = () => { hovered.current = false; };

    return (
        <AnimatePresence>
            {!!error && (
                <motion.div
                    key="error-toast"
                    style={cardStyle(checkingOpen)}
                    variants={CARD_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <ToastCard accentColor={ERROR_ACCENT}>
                        <ToastHeader
                            title={error}
                            titleSx={{ color: 'error.main' }}
                            onDismiss={onClose}
                        >
                            {errorCta && (
                                <Box sx={{ mt: 1 }}>
                                    {errorCta.subtitle && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, lineHeight: 1.5 }}>
                                            {errorCta.subtitle}
                                        </Typography>
                                    )}
                                    <Button
                                        component="a"
                                        href={errorCta.href}
                                        onClick={openPsLink}
                                        variant="contained"
                                        size="small"
                                        endIcon={<ExternalLinkIcon />}
                                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}
                                    >
                                        {errorCta.label}
                                    </Button>
                                </Box>
                            )}
                        </ToastHeader>
                    </ToastCard>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const mapStateToProps = state => ({
    error: state.app.error,
    errorCta: state.app.errorCta,
    checkingOpen: state.checking.opened || state.checking.starting || state.result.isOpened,
});
const mapDispatchToProps = { onClose: clearError };

export default connect(mapStateToProps, mapDispatchToProps)(ErrorToast);
