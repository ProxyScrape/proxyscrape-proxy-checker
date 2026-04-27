import React, { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ipcRenderer } from '../electron-shim';

const BrowserIntegration = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(null); // browserId being registered/unregistered

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await ipcRenderer.invoke('native-messaging-status');
            setStatus(result);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleRegister = async (browserId) => {
        setPending(browserId);
        try {
            await ipcRenderer.invoke('native-messaging-register', browserId);
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleUnregisterAll = async () => {
        setPending('all');
        try {
            await ipcRenderer.invoke('native-messaging-unregister-all');
            await refresh();
        } finally {
            setPending(null);
        }
    };

    if (loading && !status) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Checking browser registrations…</Typography>
            </Box>
        );
    }

    const anyRegistered = status?.browsers?.some(b => b.registered);

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Browser Integration
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        Register this app as a native messaging host so the ProxyScrape browser extension can detect whether the desktop app is running.
                    </Typography>
                </Box>
                <Button
                    size="small"
                    startIcon={<RefreshIcon fontSize="small" />}
                    onClick={refresh}
                    disabled={loading}
                    sx={{ flexShrink: 0, ml: 2 }}
                >
                    Refresh
                </Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {status?.browsers?.map((browser) => {
                    const isBusy = pending === browser.id;
                    return (
                        <Box
                            key={browser.id}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                px: 2,
                                py: 1.25,
                                borderRadius: 1.5,
                                bgcolor: 'action.hover',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {browser.registered
                                    ? <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                                    : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                                }
                                <Typography variant="body2">{browser.name}</Typography>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        px: 0.75,
                                        py: 0.2,
                                        borderRadius: 0.75,
                                        bgcolor: browser.registered ? 'success.main' : 'action.selected',
                                        color: browser.registered ? 'success.contrastText' : 'text.secondary',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {browser.registered ? 'Registered' : 'Not registered'}
                                </Typography>
                            </Box>
                            <Button
                                size="small"
                                variant={browser.registered ? 'outlined' : 'contained'}
                                color={browser.registered ? 'error' : 'primary'}
                                disabled={isBusy || pending === 'all'}
                                onClick={() => browser.registered
                                    ? (async () => {
                                        setPending(browser.id);
                                        try {
                                            // Unregister only this browser by re-registering all others
                                            // (simpler: unregister all then re-register the rest)
                                            await ipcRenderer.invoke('native-messaging-unregister-all');
                                            const others = status.browsers.filter(b => b.registered && b.id !== browser.id);
                                            for (const b of others) {
                                                await ipcRenderer.invoke('native-messaging-register', b.id);
                                            }
                                            await refresh();
                                        } finally {
                                            setPending(null);
                                        }
                                    })()
                                    : handleRegister(browser.id)
                                }
                                sx={{ minWidth: 90, flexShrink: 0 }}
                            >
                                {isBusy
                                    ? <CircularProgress size={14} sx={{ color: 'inherit' }} />
                                    : browser.registered ? 'Remove' : 'Register'
                                }
                            </Button>
                        </Box>
                    );
                })}
            </Box>

            {anyRegistered && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={pending === 'all'}
                            onClick={handleUnregisterAll}
                        >
                            {pending === 'all'
                                ? <CircularProgress size={14} sx={{ color: 'inherit' }} />
                                : 'Remove All'
                            }
                        </Button>
                    </Box>
                </>
            )}

            {!status?.hostExists && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'warning.light', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="warning.dark">
                        Host binary not found. Run <code>npm run build:backend</code> to build it.
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default BrowserIntegration;
