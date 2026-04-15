import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { FOOTER_HEIGHT, CANARY_BANNER_HEIGHT } from '../constants/Layout';
import { IS_CANARY } from '../../shared/AppConstants';
import { CARD_VARIANTS, ToastCard, ToastHeader } from '../components/ui/ToastBase';

/**
 * GeoEnrichToast — shows progress for the one-time location data migration.
 *
 * This runs automatically when results exist that were checked before the
 * location database was available. The migration continues in the Go backend
 * regardless of whether this toast is visible.
 *
 * Listens to geo-enrich-progress IPC events forwarded from the main process
 * (which subscribes to the Go SSE stream).
 */
class GeoEnrichToast extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            running: false,
            done: 0,
            total: 0,
            phase: null,    // null | 'running' | 'done'
            dismissed: false,
        };
        this._removeListener = null;
        this._doneTimer = null;
    }

    componentDidMount() {
        if (!window.__ELECTRON__?.onGeoEnrichProgress) return;

        this._removeListener = window.__ELECTRON__.onGeoEnrichProgress((_, data) => {
            if (!data) return;
            const { running, done, total } = data;

            if (running && total > 0) {
                this.setState(prev => ({
                    running: true,
                    done,
                    total,
                    phase: 'running',
                    // Only surface the toast when a new session starts.
                    // If the user already dismissed during this run, respect that.
                    dismissed: prev.phase === 'running' ? prev.dismissed : false,
                }));
            } else if (!running && this.state.running) {
                // Enrichment just finished — show a brief completion message.
                clearTimeout(this._doneTimer);
                this.setState(prev => ({
                    running: false,
                    phase: 'done',
                    done: total || prev.done,
                    total: total || prev.total,
                    dismissed: false,
                }));
                this._doneTimer = setTimeout(() => {
                    this.setState({ phase: null });
                }, 4000);
            }
        });
    }

    componentWillUnmount() {
        if (this._removeListener) this._removeListener();
        clearTimeout(this._doneTimer);
    }

    handleDismiss = () => this.setState({ dismissed: true });

    cardStyle = () => ({
        position: 'fixed',
        bottom: FOOTER_HEIGHT + (IS_CANARY ? CANARY_BANNER_HEIGHT : 0) + 12,
        left: 20,
        zIndex: 1400,
        width: 290,
        pointerEvents: 'auto',
    });

    render() {
        const { phase, dismissed, done, total } = this.state;
        const visible = !!phase && !dismissed;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        return (
            <AnimatePresence>
                {visible && (
                    <motion.div key="geo-enrich-toast" style={this.cardStyle()}
                        variants={CARD_VARIANTS} initial="hidden" animate="visible" exit="exit"
                    >
                        <ToastCard>
                            <ToastHeader
                                title={phase === 'done' ? 'Location data updated' : 'Updating location data'}
                                onDismiss={this.handleDismiss}
                            >
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: phase === 'running' ? 0.75 : 0 }}>
                                    {phase === 'done'
                                        ? `${done.toLocaleString()} results updated`
                                        : `${done.toLocaleString()} / ${total.toLocaleString()} results`
                                    }
                                </Typography>
                            </ToastHeader>

                            {phase === 'running' && (
                                <>
                                    <LinearProgress
                                        variant={total > 0 ? 'determinate' : 'indeterminate'}
                                        value={pct}
                                        sx={{ borderRadius: 1, height: 4, mb: 1 }}
                                    />
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', lineHeight: 1.4 }}>
                                        One-time update for results checked without the location database.
                                        You can dismiss this — it continues in the background.
                                    </Typography>
                                </>
                            )}
                        </ToastCard>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }
}

export default GeoEnrichToast;
