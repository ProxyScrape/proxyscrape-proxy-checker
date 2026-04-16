import React from 'react';
import { connect } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable, IS_CANARY, isDev } from '../../shared/AppConstants';
import { ipcRenderer } from 'electron';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { blueBrand } from '../theme/palette';
import { getToastBottom } from '../constants/Layout';
import { CARD_VARIANTS, ToastCard, ToastDismissButton } from '../components/ui/ToastBase';

// Content panes: old drifts upward out, new rises up into place.
const CONTENT_VARIANTS = {
    hidden:  { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.12, ease: [0.55, 0, 1, 0.45] } },
};

class Update extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            percent: 0,
            phase: null,      // null | 'downloading' | 'ready'
            dismissed: false, // hides the downloading card; ready still appears
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

        ipcRenderer.on('update-ready', () => {
            this.setState({ phase: 'ready', dismissed: false });
        });

        // ── Dev-only: Shift+U runs the full animated simulation ────────────────
        // Dead-code eliminated from production builds (isDev bakes to false).
        if (isDev) {
            this._onSimKey = (e) => {
                if (e.key === 'U' && e.shiftKey) this._startSim();
            };
            window.addEventListener('keydown', this._onSimKey);
        }
    }

    componentWillUnmount() {
        this._clearSim();
        if (this._onSimKey) window.removeEventListener('keydown', this._onSimKey);
    }

    _startSim = () => {
        this._clearSim();
        this.setState({ phase: 'downloading', dismissed: false, percent: 0 });
        this._simInterval = setInterval(() => {
            this.setState(prev => {
                const next = Math.min(prev.percent + 2, 100);
                if (next >= 100) {
                    this._clearSim();
                    this._simTimeout = setTimeout(() => this.setState({ phase: 'ready' }), 400);
                    return { percent: 100 };
                }
                return { percent: next };
            });
        }, 60);
    };

    _clearSim = () => {
        clearInterval(this._simInterval);
        clearTimeout(this._simTimeout);
        this._simInterval = null;
        this._simTimeout = null;
    };

    handleDismiss       = () => this.setState({ dismissed: true });
    handleDismissReady  = () => { this._clearSim(); this.setState({ phase: null }); };
    handleInstall       = () => ipcRenderer.send('install-update');

    cardStyle = () => ({
        position: 'fixed',
        bottom: getToastBottom(this.props.checkingOpen),
        right: 20,
        zIndex: 1400,
        width: 310,
        pointerEvents: 'auto',
        transition: 'bottom 0.3s ease',
    });

    render() {
        const { available, portableAsset } = this.props;
        const { percent, phase, dismissed } = this.state;

        // ── Portable ───────────────────────────────────────────────────────────
        if (isPortable) {
            return (
                <AnimatePresence>
                    {!!available && (
                        <motion.div key="portable" style={this.cardStyle()}
                            variants={CARD_VARIANTS} initial="hidden" animate="visible" exit="exit"
                        >
                            <ToastCard accentColor={blueBrand[500]}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                        Update available
                                    </Typography>
                                    <ToastDismissButton onClick={() => this.setState({ phase: null })} />
                                </Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, lineHeight: 1.5 }}>
                                    Download and replace your portable executable.
                                </Typography>
                                <Box component="a" onClick={openLink} href={portableAsset?.browser_download_url}
                                    sx={{ color: blueBrand[300], fontWeight: 600, fontSize: '0.8125rem',
                                          textDecoration: 'none', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    Download Update →
                                </Box>
                            </ToastCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            );
        }

        // ── Non-portable ───────────────────────────────────────────────────────
        if (IS_CANARY && phase === null) return null;

        const cardVisible  = (phase === 'downloading' && !dismissed) || phase === 'ready';
        const contentKey   = phase === 'ready' ? 'ready' : 'downloading';

        return (
            <AnimatePresence>
                {cardVisible && (
                    <motion.div key="update-card" style={this.cardStyle()}
                        variants={CARD_VARIANTS} initial="hidden" animate="visible" exit="exit" layout
                    >
                        <AnimatePresence mode="wait" initial={false}>

                            {contentKey === 'downloading' ? (
                                <motion.div key="downloading" variants={CONTENT_VARIANTS}
                                    initial="hidden" animate="visible" exit="exit"
                                >
                                    <ToastCard accentColor={blueBrand[500]}>
                                        {/* Title row: label + live percent + dismiss */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.25 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
                                                Downloading update
                                            </Typography>
                                            <Typography variant="caption" sx={{
                                                color: blueBrand[300], fontWeight: 600,
                                                fontSize: '0.75rem', mr: 0.5, flexShrink: 0,
                                            }}>
                                                {percent}%
                                            </Typography>
                                            <ToastDismissButton onClick={this.handleDismiss} />
                                        </Box>

                                        {/* Progress bar */}
                                        <LinearProgress
                                            variant="determinate"
                                            value={percent}
                                            sx={{ height: 5, borderRadius: 99, mb: 1.25 }}
                                        />

                                        {/* Footer hint */}
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', lineHeight: 1.4 }}>
                                            You can dismiss this — the download continues in the background.
                                        </Typography>
                                    </ToastCard>
                                </motion.div>
                            ) : (
                                <motion.div key="ready" variants={CONTENT_VARIANTS}
                                    initial="hidden" animate="visible" exit="exit"
                                >
                                    <ToastCard accentColor="#00B70B">
                                        {/* Title row: status dot + label + dismiss */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
                                            <Box sx={{
                                                width: 7, height: 7, borderRadius: '50%',
                                                bgcolor: '#00B70B', flexShrink: 0, mr: 1,
                                                boxShadow: '0 0 6px rgba(0,183,11,0.6)',
                                            }} />
                                            <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
                                                Update ready
                                            </Typography>
                                            <ToastDismissButton onClick={this.handleDismissReady} />
                                        </Box>

                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, lineHeight: 1.5 }}>
                                            Installs automatically when you close the app.
                                        </Typography>

                                        <Button
                                            variant="contained"
                                            size="small"
                                            onClick={this.handleInstall}
                                            fullWidth
                                            sx={{ fontSize: '0.8125rem', py: 0.75 }}
                                        >
                                            Restart now
                                        </Button>
                                    </ToastCard>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }
}

const mapStateToProps = state => ({
    available:     state.update.available,
    portableAsset: state.update.portableAsset,
    checkingOpen:  state.checking.opened || state.checking.starting || state.result.isOpened,
});

const mapDispatchToProps = { checkAtAvailable };

export default connect(mapStateToProps, mapDispatchToProps)(Update);
