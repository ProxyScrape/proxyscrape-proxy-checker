import React, { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { ipcRenderer } from '../electron-shim';
import { InfoIcon } from '../components/ui/HelpTip';

const EMPTY_FORM = { name: '', type: 'chromium', nmDir: '' };

const platform = typeof window !== 'undefined' ? window.__ELECTRON__?.platform : null;

const NM_DIR_HINTS = {
    chromium: {
        darwin:  '~/Library/Application Support/<BrowserName>/NativeMessagingHosts',
        linux:   '~/.config/<browser-name>/NativeMessagingHosts',
        win32:   'Configured via registry — use the manifest directory you want to write to',
    },
    firefox: {
        darwin:  '~/Library/Application Support/Mozilla/NativeMessagingHosts',
        linux:   '~/.mozilla/native-messaging-hosts',
        win32:   'Configured via registry — use the manifest directory you want to write to',
    },
};

function nmDirHint(type) {
    return NM_DIR_HINTS[type]?.[platform] ?? null;
}

const BrowserIntegration = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(null);
    const [showKnown, setShowKnown] = useState(false);
    const [addingCustom, setAddingCustom] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setStatus(await ipcRenderer.invoke('native-messaging-status'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleRegister = async (browser) => {
        setPending(browser.id);
        try {
            await ipcRenderer.invoke('native-messaging-register', browser.id);
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleUnregister = async (browser) => {
        setPending(browser.id);
        try {
            await ipcRenderer.invoke('native-messaging-unregister', browser.id);
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleToggle = (browser) =>
        browser.registered ? handleUnregister(browser) : handleRegister(browser);

    const handleUnregisterAll = async () => {
        setPending('__all__');
        try {
            await ipcRenderer.invoke('native-messaging-unregister-all');
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleRemoveCustom = async (id) => {
        setPending(id);
        try {
            await ipcRenderer.invoke('native-messaging-remove-custom', id);
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleAddCustom = async () => {
        if (!form.name.trim() || !form.nmDir.trim()) return;
        setPending('__add__');
        try {
            await ipcRenderer.invoke('native-messaging-add-custom', {
                name: form.name.trim(),
                type: form.type,
                nmDir: form.nmDir.trim(),
            });
            setForm(EMPTY_FORM);
            setAddingCustom(false);
            await refresh();
        } finally {
            setPending(null);
        }
    };

    const handleBrowseDir = async () => {
        const dir = await ipcRenderer.invoke('choose-directory');
        if (dir) setForm(f => ({ ...f, nmDir: dir }));
    };

    const cancelAddCustom = () => { setAddingCustom(false); setForm(EMPTY_FORM); };

    if (loading && !status) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Checking browser registrations…</Typography>
            </Box>
        );
    }

    const detected = status?.detected ?? [];
    const known    = status?.known    ?? [];
    const custom   = status?.custom   ?? [];
    const anyRegistered = [...detected, ...known, ...custom].some(b => b.registered);

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Browser Integration
                    <InfoIcon title="Registers this app as a native messaging host so the ProxyScrape browser extension can detect whether the desktop app is running." />
                </Typography>
                <Button size="small" startIcon={<RefreshIcon fontSize="small" />} onClick={refresh} disabled={loading} sx={{ flexShrink: 0, ml: 2 }}>
                    Refresh
                </Button>
            </Box>

            {/* Detected browsers */}
            {detected.length > 0
                ? <BrowserList browsers={detected} pending={pending} onToggle={handleToggle} />
                : <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No browsers detected on this machine.</Typography>
            }

            {/* Known but not detected — collapsed by default */}
            {known.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                    <Button
                        size="small"
                        onClick={() => setShowKnown(v => !v)}
                        endIcon={showKnown ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        sx={{ color: 'text.secondary', textTransform: 'none', px: 0 }}
                    >
                        {showKnown ? 'Hide' : `Show ${known.length} more browser${known.length === 1 ? '' : 's'}`}
                    </Button>
                    {showKnown && (
                        <Box sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                Not detected on this machine — you can still register manually.
                            </Typography>
                            <BrowserList browsers={known} pending={pending} onToggle={handleToggle} />
                        </Box>
                    )}
                </Box>
            )}

            {/* Custom browsers */}
            <Divider sx={{ my: 2 }} />

            {custom.length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', display: 'block', mb: 1 }}>
                        Custom
                    </Typography>
                    {custom.map(browser => (
                        <Box
                            key={browser.id}
                            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', mb: 0.75 }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {browser.registered
                                    ? <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                                    : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                                }
                                <Typography variant="body2">{browser.name}</Typography>
                                <StatusBadge registered={browser.registered} />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <ToggleBtn browser={browser} pending={pending} onToggle={handleToggle} minWidth={80} />
                                <IconButton
                                    size="small"
                                    color="error"
                                    disabled={!!pending}
                                    onClick={() => handleRemoveCustom(browser.id)}
                                    title="Delete custom browser"
                                >
                                    <DeleteOutlinedIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}

            {/* Add custom browser */}
            {!addingCustom ? (
                <Button
                    size="small"
                    startIcon={<AddIcon fontSize="small" />}
                    onClick={() => setAddingCustom(true)}
                    sx={{ color: 'text.secondary', textTransform: 'none', px: 0 }}
                >
                    Add browser manually
                </Button>
            ) : (
                <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>Add custom browser</Typography>
                    <TextField
                        label="Browser name"
                        size="small"
                        fullWidth
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Type</Typography>
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={form.type}
                            onChange={(_e, v) => v && setForm(f => ({ ...f, type: v }))}
                        >
                            <ToggleButton value="chromium">Chromium</ToggleButton>
                            <ToggleButton value="firefox">Firefox</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <TextField
                                label="NativeMessagingHosts directory"
                                size="small"
                                fullWidth
                                value={form.nmDir}
                                onChange={e => setForm(f => ({ ...f, nmDir: e.target.value }))}
                                placeholder="/path/to/NativeMessagingHosts"
                            />
                            <IconButton onClick={handleBrowseDir} title="Browse" sx={{ mt: 0.5, flexShrink: 0 }}>
                                <FolderOpenIcon fontSize="small" />
                            </IconButton>
                        </Box>
                        {nmDirHint(form.type) && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, pl: 0.25 }}>
                                Typically: <code style={{ fontSize: 'inherit' }}>{nmDirHint(form.type)}</code>
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button size="small" onClick={cancelAddCustom}>Cancel</Button>
                        <Button
                            size="small"
                            variant="contained"
                            disabled={!form.name.trim() || !form.nmDir.trim() || pending === '__add__'}
                            onClick={handleAddCustom}
                        >
                            {pending === '__add__' ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Save'}
                        </Button>
                    </Box>
                </Box>
            )}

            {/* Remove all */}
            {anyRegistered && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={pending === '__all__'}
                            onClick={handleUnregisterAll}
                        >
                            {pending === '__all__' ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Remove All'}
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

const BrowserList = ({ browsers, pending, onToggle }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {browsers.map(browser => (
            <Box
                key={browser.id}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {browser.registered
                        ? <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                        : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    }
                    <Typography variant="body2">{browser.name}</Typography>
                    <StatusBadge registered={browser.registered} />
                </Box>
                <ToggleBtn browser={browser} pending={pending} onToggle={onToggle} minWidth={90} />
            </Box>
        ))}
    </Box>
);

const ToggleBtn = ({ browser, pending, onToggle, minWidth }) => (
    <Button
        size="small"
        variant={browser.registered ? 'outlined' : 'contained'}
        color={browser.registered ? 'error' : 'primary'}
        disabled={!!pending}
        onClick={() => onToggle(browser)}
        sx={{ minWidth, flexShrink: 0 }}
    >
        {pending === browser.id
            ? <CircularProgress size={14} sx={{ color: 'inherit' }} />
            : browser.registered ? 'Remove' : 'Register'
        }
    </Button>
);

const StatusBadge = ({ registered }) => (
    <Typography
        variant="caption"
        sx={{
            px: 0.75, py: 0.2, borderRadius: 0.75,
            bgcolor: registered ? 'success.main' : 'action.selected',
            color: registered ? 'success.contrastText' : 'text.secondary',
            fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.4,
        }}
    >
        {registered ? 'Registered' : 'Not registered'}
    </Typography>
);

export default BrowserIntegration;
