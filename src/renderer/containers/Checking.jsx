import React from 'react';
import Counter from '../components/Counter';
import ProgressBar from '../components/ui/ProgressBar';
import FullScreenOverlay from '../components/ui/FullScreenOverlay';
import { connect } from 'react-redux';
import { stop, cancelMMDBDownload } from '../actions/CheckingActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

/** Format bytes as a human-readable string, e.g. 64.2 MB. */
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const Checking = ({ state, stop, cancelMMDBDownload }) => {
    const { opened, preparing, mmdbDownloading, mmdbPhase, mmdbProgress, mmdbTotalBytes } = state;
    const visible = opened || mmdbDownloading;
    const isDecompressing = mmdbDownloading && mmdbPhase === 'decompress';

    return (
        <FullScreenOverlay isActive={visible}>
            <Box sx={{ textAlign: 'center', width: '80%', maxWidth: 500 }}>
                {mmdbDownloading ? (
                    <>
                        <Typography variant="body1" sx={{ mb: 0.5, fontWeight: 500 }}>
                            {isDecompressing ? 'Unpacking GeoIP database' : 'Downloading GeoIP database'}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2.5, color: 'text.secondary' }}>
                            {isDecompressing
                                ? 'This may take a moment\u2026'
                                : `One-time setup${mmdbTotalBytes > 0 ? ` \xb7 ${formatBytes(mmdbTotalBytes)}` : ''}`
                            }
                        </Typography>

                        {isDecompressing ? (
                            <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />
                        ) : (
                            <>
                                <ProgressBar value={mmdbProgress} sx={{ mb: 1 }} />
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {mmdbProgress}%
                                </Typography>
                            </>
                        )}

                        {!isDecompressing && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={cancelMMDBDownload}
                                sx={{ mt: 3 }}
                            >
                                Cancel
                            </Button>
                        )}
                    </>
                ) : (
                    <>
                        <Counter {...state.counter} />
                        <Button variant="contained" onClick={stop} sx={{ mt: 3 }}>
                            Stop
                        </Button>
                        {preparing && (
                            <Typography variant="body2" sx={{ mt: 2, color: 'primary.main', fontWeight: 500 }}>
                                Preparing results
                            </Typography>
                        )}
                    </>
                )}
            </Box>
        </FullScreenOverlay>
    );
};

const mapStateToProps = state => ({
    state: state.checking,
});

const mapDispatchToProps = {
    stop,
    cancelMMDBDownload,
};

export default connect(mapStateToProps, mapDispatchToProps)(Checking);
