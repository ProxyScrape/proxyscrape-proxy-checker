import React from 'react';
import { connect } from 'react-redux';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable, IS_CANARY } from '../../shared/AppConstants';
import { ipcRenderer } from 'electron';
import Snackbar from '@mui/material/Snackbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { blueBrand } from '../theme/palette';

const CloseIcon = () => (
    <svg viewBox="0 0 224.512 224.512" style={{ width: 12, height: 12, fill: 'currentColor' }}>
        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
    </svg>
);

const TOAST_SX = {
    bgcolor: 'background.paper',
    borderRadius: 3,
    p: 2,
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    minWidth: 280,
};

const ANCHOR = { vertical: 'bottom', horizontal: 'right' };

class Update extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            percent: 0,
            // 'downloading' when update-available fires, 'ready' when update-ready fires.
            phase: null,
            // True when the user dismisses the downloading toast.
            // The download continues; the ready toast still appears when complete.
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

        ipcRenderer.on('update-ready', () => {
            this.setState({ phase: 'ready', dismissed: false });
        });
    }

    handleDismissDownloading = () => {
        // Hides the toast but does NOT cancel the download.
        // autoInstallOnAppQuit = true ensures it still installs on next quit.
        this.setState({ dismissed: true });
    };

    handleInstall = () => {
        ipcRenderer.send('install-update');
    };

    render() {
        const { available, portableAsset } = this.props;
        const { percent, phase, dismissed } = this.state;

        // Portable builds: electron-updater doesn't run; show a manual download link
        // driven by Redux state (from the Go backend /api/version check).
        if (isPortable) {
            return (
                <Snackbar open={!!available} anchorOrigin={ANCHOR}>
                    <Box sx={TOAST_SX}>
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
                                '&:hover': { textDecoration: 'underline' },
                                cursor: 'pointer',
                            }}
                        >
                            Download Update
                        </Box>
                    </Box>
                </Snackbar>
            );
        }

        // Non-portable: IPC-driven toasts from electron-updater events.
        // On canary, phase only becomes non-null when --enable-updater is passed
        // (because main only calls checkForUpdates() in that case).
        if (IS_CANARY && phase === null) return null;

        return (
            <>
                {/* Downloading toast — dismissible, download continues in background */}
                <Snackbar
                    open={phase === 'downloading' && !dismissed}
                    anchorOrigin={ANCHOR}
                >
                    <Box sx={TOAST_SX}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Downloading update…
                            </Typography>
                            <IconButton
                                onClick={this.handleDismissDownloading}
                                size="small"
                                sx={{ color: 'text.secondary', ml: 1, '&:hover': { color: 'text.primary' } }}
                            >
                                <CloseIcon />
                            </IconButton>
                        </Box>
                        <LinearProgress variant="determinate" value={percent} sx={{ mb: 1 }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {percent}% complete
                        </Typography>
                    </Box>
                </Snackbar>

                {/* Ready toast — stays until user acts or closes the app */}
                <Snackbar open={phase === 'ready'} anchorOrigin={ANCHOR}>
                    <Box sx={TOAST_SX}>
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
                    </Box>
                </Snackbar>
            </>
        );
    }
}

const mapStateToProps = state => ({
    available: state.update.available,
    portableAsset: state.update.portableAsset,
});

const mapDispatchToProps = {
    checkAtAvailable,
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Update);
