import React, { useState, memo } from 'react';
import { connect } from 'react-redux';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { alpha } from '@mui/material/styles';
import { shell } from 'electron';
import { FOOTER_HEIGHT } from '../constants/Layout';

const CANARY_ORANGE = '#e67e00';
const CANARY_BG = 'rgba(230, 126, 0, 0.12)';
const CANARY_BORDER = 'rgba(230, 126, 0, 0.3)';

const CanaryBanner = memo(({ hasUpdate, latestCanary, canaryReleases }) => {
    const [pickerOpen, setPickerOpen] = useState(false);

    const openRelease = (htmlUrl) => {
        shell.openExternal(htmlUrl);
        setPickerOpen(false);
    };

    const openLatest = () => {
        if (canaryReleases && canaryReleases.length > 0) {
            openRelease(canaryReleases[0].htmlUrl);
        }
    };

    return (
        <>
            <Box
                sx={{
                    position: 'fixed',
                    bottom: FOOTER_HEIGHT,
                    left: 0,
                    right: 0,
                    zIndex: 99,
                    bgcolor: CANARY_BG,
                    borderTop: `1px solid ${CANARY_BORDER}`,
                    borderBottom: `1px solid ${CANARY_BORDER}`,
                    px: 3,
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                <Typography
                    variant="caption"
                    sx={{ color: CANARY_ORANGE, fontSize: '0.72rem', lineHeight: 1.4 }}
                >
                    ⚡ <strong>Canary build</strong> — things may break. If they do, remove all app data and reinstall the stable version from our website.
                </Typography>

                {hasUpdate && latestCanary && (
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPickerOpen(true)}
                        sx={{
                            flexShrink: 0,
                            borderColor: CANARY_ORANGE,
                            color: CANARY_ORANGE,
                            fontSize: '0.72rem',
                            py: 0.25,
                            px: 1.5,
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            '&:hover': {
                                bgcolor: alpha(CANARY_ORANGE, 0.1),
                                borderColor: CANARY_ORANGE,
                            },
                        }}
                    >
                        Update to {latestCanary}
                    </Button>
                )}
            </Box>

            <Dialog
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                maxWidth="xs"
                fullWidth
                slotProps={{ paper: { sx: { borderRadius: 3 } } }}
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Typography variant="h6" component="span" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                        Choose a Canary Version
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.82rem' }}>
                        Canary versions may be unstable. If the app breaks, remove all data and reinstall the stable release from our website.
                    </Typography>

                    <Button
                        fullWidth
                        variant="contained"
                        onClick={openLatest}
                        sx={{
                            mb: 1.5,
                            bgcolor: CANARY_ORANGE,
                            '&:hover': { bgcolor: '#c47600' },
                            fontWeight: 700,
                        }}
                    >
                        Install Latest ({canaryReleases?.[0]?.tagName ?? '…'})
                    </Button>

                    {canaryReleases && canaryReleases.length > 1 && (
                        <Box sx={{ borderTop: `1px solid ${alpha('#fff', 0.08)}`, pt: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', display: 'block', mb: 1 }}>
                                Older canary versions
                            </Typography>
                            {canaryReleases.slice(1).map(release => (
                                <Box
                                    key={release.tagName}
                                    onClick={() => openRelease(release.htmlUrl)}
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        py: 0.75,
                                        px: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        '&:hover': { bgcolor: alpha('#fff', 0.05) },
                                    }}
                                >
                                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.82rem' }}>
                                        {release.tagName}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                                        {release.publishedAt
                                            ? new Date(release.publishedAt).toLocaleDateString()
                                            : ''}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
});

const mapStateToProps = state => ({
    hasUpdate: state.update.hasUpdate,
    latestCanary: state.update.latestCanary,
    canaryReleases: state.update.canaryReleases,
});

export default connect(mapStateToProps)(CanaryBanner);
