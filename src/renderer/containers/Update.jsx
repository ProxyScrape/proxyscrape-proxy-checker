import React from 'react';
import { connect } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable, IS_CANARY } from '../../shared/AppConstants';
import { ipcRenderer } from 'electron';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { blueBrand } from '../theme/palette';

// ─── Animation variants ────────────────────────────────────────────────────────

// Card: spring slide-up + scale on enter, fade-only on exit (Apple pattern).
const CARD_VARIANTS = {
    hidden: {
        y: 80,
        opacity: 0,
        scale: 0.92,
    },
    visible: {
        y: 0,
        opacity: 1,
        scale: 1,
        transition: {
            y:       { type: 'spring', stiffness: 380, damping: 28, mass: 0.9 },
            opacity: { duration: 0.25, ease: 'easeOut' },
            scale:   { duration: 0.25, ease: 'easeOut' },
        },
    },
    exit: {
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.18, ease: 'easeIn' },
    },
};

// Content panes: drift upward on exit, rise into place on enter.
// This directional motion gives a sense of forward progression.
const CONTENT_VARIANTS = {
    hidden:  { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.12, ease: [0.55, 0, 1, 0.45] } },
};

// ─── Shared card styles ────────────────────────────────────────────────────────

const CARD_STYLE = {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 1400,
    width: 300,
    // Prevent layout shifts from affecting parent
    pointerEvents: 'auto',
};

const CARD_SX = {
    bgcolor: 'background.paper',
    borderRadius: 3,
    p: 2,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
    overflow: 'hidden',
};

const CloseIcon = () => (
    <svg viewBox="0 0 224.512 224.512" style={{ width: 11, height: 11, fill: 'currentColor' }}>
        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
    </svg>
);

// ─── Component ─────────────────────────────────────────────────────────────────

class Update extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            percent: 0,
            // 'downloading' when update-available fires, 'ready' when update-ready fires.
            phase: null,
            // When true, hides the downloading toast but the download continues.
            // The ready toast will still appear (and re-enter with spring animation).
            dismissed: false,
        };
    }

    componentDidMount() {
        this.props.checkAtAvailable();

        ipcRenderer.on('update-available', () => {
            this.setState({ phase: 'downloading', dismissed: false, percent: 0 });
        });

        ipcRenderer.on('download-progress', (_e, data) => {
            this.setState({ percent: data });
        });

        // Always show ready toast even if the downloading one was dismissed.
        ipcRenderer.on('update-ready', () => {
            this.setState({ phase: 'ready', dismissed: false });
        });
    }

    handleDismiss = () => {
        // Hides the downloading card. autoInstallOnAppQuit = true ensures
        // the update still installs silently on the next app quit.
        this.setState({ dismissed: true });
    };

    handleInstall = () => {
        ipcRenderer.send('install-update');
    };

    render() {
        const { available, portableAsset } = this.props;
        const { percent, phase, dismissed } = this.state;

        // ── Portable: manual download link (electron-updater doesn't run) ──────
        if (isPortable) {
            return (
                <AnimatePresence>
                    {!!available && (
                        <motion.div
                            key="portable"
                            style={CARD_STYLE}
                            variants={CARD_VARIANTS}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            <Box sx={CARD_SX}>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                    Update available
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                                    Download and replace your portable executable.
                                </Typography>
                                <Box
                                    component="a"
                                    onClick={openLink}
                                    href={portableAsset?.browser_download_url}
                                    sx={{
                                        color: blueBrand[300],
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        textDecoration: 'none',
                                        cursor: 'pointer',
                                        '&:hover': { textDecoration: 'underline' },
                                    }}
                                >
                                    Download Update
                                </Box>
                            </Box>
                        </motion.div>
                    )}
                </AnimatePresence>
            );
        }

        // ── Non-portable: IPC-driven. Canary only shows with --enable-updater. ──
        if (IS_CANARY && phase === null) return null;

        // Card is visible when downloading (and not dismissed) or when ready.
        const cardVisible = (phase === 'downloading' && !dismissed) || phase === 'ready';

        // The content key drives AnimatePresence to cross-fade between states.
        const contentKey = phase === 'ready' ? 'ready' : 'downloading';

        return (
            <AnimatePresence>
                {cardVisible && (
                    // layout: smoothly spring-animates height when content changes size.
                    <motion.div
                        key="update-card"
                        style={CARD_STYLE}
                        variants={CARD_VARIANTS}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        layout
                    >
                        <Box sx={CARD_SX}>
                            {/* Inner AnimatePresence cross-fades between content panes.
                                mode="wait" ensures the old pane exits before the new one enters. */}
                            <AnimatePresence mode="wait" initial={false}>
                                {contentKey === 'downloading' ? (
                                    <motion.div
                                        key="downloading"
                                        variants={CONTENT_VARIANTS}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                                                Downloading update…
                                            </Typography>
                                            <IconButton
                                                onClick={this.handleDismiss}
                                                size="small"
                                                sx={{ mt: -0.5, mr: -0.5, color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                                            >
                                                <CloseIcon />
                                            </IconButton>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={percent}
                                            sx={{ mb: 1 }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                            {percent}% complete
                                        </Typography>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="ready"
                                        variants={CONTENT_VARIANTS}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                    >
                                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                            Update ready
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                                            It will install automatically when you close the app.
                                        </Typography>
                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={this.handleInstall}
                                            fullWidth
                                        >
                                            Restart now
                                        </Button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Box>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }
}

const mapStateToProps = state => ({
    available:     state.update.available,
    portableAsset: state.update.portableAsset,
});

const mapDispatchToProps = { checkAtAvailable };

export default connect(mapStateToProps, mapDispatchToProps)(Update);
