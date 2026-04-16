import React from 'react';
import { connect } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { getToastBottom } from '../constants/Layout';
import { CARD_VARIANTS, ToastCard, ToastHeader } from './ui/ToastBase';
import { clearError } from '../store/reducers/app';

const ERROR_ACCENT = '#e74856';

const CARD_WIDTH = 320;

const cardStyle = (checkingOpen) => ({
    position: 'fixed',
    bottom: getToastBottom(checkingOpen),
    left: `calc(50% - ${CARD_WIDTH / 2}px)`,
    zIndex: 1400,
    width: CARD_WIDTH,
    pointerEvents: 'auto',
    transition: 'bottom 0.3s ease',
});

const ErrorToast = ({ error, onClose, checkingOpen }) => (
    <AnimatePresence>
        {!!error && (
            <motion.div
                key="error-toast"
                style={cardStyle(checkingOpen)}
                variants={CARD_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                <ToastCard accentColor={ERROR_ACCENT}>
                        <ToastHeader
                            title={error}
                            titleSx={{ color: 'error.main' }}
                            onDismiss={onClose}
                        />
                    </ToastCard>
            </motion.div>
        )}
    </AnimatePresence>
);

const mapStateToProps = state => ({
    error: state.app.error,
    checkingOpen: state.checking.opened || state.checking.starting || state.result.isOpened,
});
const mapDispatchToProps = { onClose: clearError };

export default connect(mapStateToProps, mapDispatchToProps)(ErrorToast);
