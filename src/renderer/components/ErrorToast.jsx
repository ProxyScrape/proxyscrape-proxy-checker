import React from 'react';
import { connect } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { FOOTER_HEIGHT, CANARY_BANNER_HEIGHT } from '../constants/Layout';
import { IS_CANARY } from '../../shared/AppConstants';
import { CARD_VARIANTS, ToastCard, ToastHeader } from './ui/ToastBase';
import { clearError } from '../store/reducers/app';

const ERROR_ACCENT = '#e74856';

const CARD_WIDTH = 320;

const cardStyle = (isCanary) => ({
    position: 'fixed',
    bottom: FOOTER_HEIGHT + (isCanary ? CANARY_BANNER_HEIGHT : 0) + 12,
    left: `calc(50% - ${CARD_WIDTH / 2}px)`,
    zIndex: 1400,
    width: CARD_WIDTH,
    pointerEvents: 'auto',
});

const ErrorToast = ({ error, onClose }) => (
    <AnimatePresence>
        {!!error && (
            <motion.div
                key="error-toast"
                style={cardStyle(IS_CANARY)}
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

const mapStateToProps = state => ({ error: state.app.error });
const mapDispatchToProps = { onClose: clearError };

export default connect(mapStateToProps, mapDispatchToProps)(ErrorToast);
