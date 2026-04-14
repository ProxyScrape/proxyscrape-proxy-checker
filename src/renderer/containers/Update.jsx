import React from 'react';
import { connect } from 'react-redux';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable, IS_CANARY } from '../../shared/AppConstants';
import { ipcRenderer, enableUpdater } from 'electron';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND, blueBrand } from '../theme/palette';

class Update extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            percent: 0,
            // Driven by IPC events from electron-updater (active on stable always,
            // and on canary when --enable-updater is passed).
            updaterAvailable: false,
            updaterReady: false,
        };
    }

    componentDidMount() {
        const { checkAtAvailable } = this.props;
        checkAtAvailable();

        ipcRenderer.on('download-progress', (_event, data) => {
            this.setState({ percent: data });
        });

        ipcRenderer.on('update-available', () => {
            this.setState({ updaterAvailable: true, updaterReady: false });
        });

        ipcRenderer.on('update-ready', () => {
            this.setState({ updaterReady: true });
        });
    }

    handleInstall = () => {
        ipcRenderer.send('install-update');
    };

    handleDismiss = () => {
        this.setState({ updaterAvailable: false, updaterReady: false, percent: 0 });
    };

    render() {
        const { active, available, isChecking, portableAsset } = this.props;
        const { percent, updaterAvailable, updaterReady } = this.state;

        // On canary: only show when electron-updater has fired (--enable-updater mode).
        // On stable: always render (visibility is controlled by opacity/pointerEvents below).
        const hasUpdaterActivity = updaterAvailable || updaterReady;
        if (IS_CANARY && !hasUpdaterActivity) return null;

        // Overlay visibility: stable uses Redux `active`, canary uses IPC-driven state.
        const overlayActive = IS_CANARY ? hasUpdaterActivity : active;
        const overlayOpacity = overlayActive ? (isChecking ? 0.6 : 1) : 0;

        // What to show inside the overlay:
        // - updaterReady → "Restart now / Later" prompt (IPC-driven, both channels)
        // - available || updaterAvailable → "Downloading…" progress bar
        const showRestartPrompt = updaterReady;
        const showDownloading = !updaterReady && (available || updaterAvailable);

        return (
            <Box sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: alpha(PAGE_BACKGROUND, 0.95),
                backdropFilter: 'blur(8px)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: overlayOpacity,
                pointerEvents: overlayActive ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }}>
                {showRestartPrompt && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body1" sx={{ mb: 1, fontWeight: 600 }}>
                            Update ready to install
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                            The app will restart to apply the update.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                            <Button
                                variant="contained"
                                size="small"
                                onClick={this.handleInstall}
                                sx={{ bgcolor: blueBrand[500], '&:hover': { bgcolor: blueBrand[600] } }}
                            >
                                Restart now
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={this.handleDismiss}
                                sx={{ borderColor: blueBrand[700], color: blueBrand[300] }}
                            >
                                Later
                            </Button>
                        </Box>
                    </Box>
                )}

                {showDownloading && (
                    <Box sx={{ textAlign: 'center', width: '60%', maxWidth: 400 }}>
                        {isPortable ? (
                            <Box
                                component="a"
                                onClick={openLink}
                                href={portableAsset?.browser_download_url}
                                sx={{
                                    color: blueBrand[300],
                                    fontWeight: 600,
                                    fontSize: '1.1rem',
                                    textDecoration: 'none',
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                Download Update
                            </Box>
                        ) : (
                            <>
                                <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                                    Downloading update...
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={percent}
                                    sx={{ height: 8, borderRadius: 4, mb: 1 }}
                                />
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {`${percent}%`} complete
                                </Typography>
                            </>
                        )}
                    </Box>
                )}
            </Box>
        );
    }
}

const mapStateToProps = state => ({
    ...state.update
});

const mapDispatchToProps = {
    checkAtAvailable
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Update);
