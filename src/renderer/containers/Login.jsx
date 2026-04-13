import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import { CARD_BACKGROUND, PAGE_BACKGROUND } from '../theme/palette';
import LogoWhite from '../../../public/icons/Logo-ProxyScrape-white.svg';

const SESSION_KEY = 'checker_session';

/**
 * Web server mode only: shown when there is no session token yet.
 * Desktop (Electron) uses preload token and never mounts this screen.
 */
const Login = ({ onSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = useCallback(
        async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                if (res.status === 401) {
                    setError('invalid');
                    setLoading(false);
                    return;
                }

                if (!res.ok) {
                    setError('other');
                    setLoading(false);
                    return;
                }

                const data = await res.json();
                const token = data && data.token;
                if (!token) {
                    setError('other');
                    setLoading(false);
                    return;
                }

                window.localStorage.setItem(SESSION_KEY, token);
                setLoading(false);
                if (typeof onSuccess === 'function') {
                    onSuccess();
                } else {
                    window.location.reload();
                }
            } catch (err) {
                setError('network');
                setLoading(false);
            }
        },
        [username, password, onSuccess]
    );

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: PAGE_BACKGROUND,
                px: 2,
                py: 4,
            }}
        >
            <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                    width: '100%',
                    maxWidth: 420,
                    p: 4,
                    borderRadius: 2,
                    bgcolor: CARD_BACKGROUND,
                    boxShadow: (theme) => `0 8px 32px ${alpha(theme.palette.common.black, 0.4)}`,
                    border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                    <Box
                        component="img"
                        src={LogoWhite}
                        alt="ProxyScrape"
                        sx={{ height: 40, width: 'auto', mb: 2 }}
                    />
                    <Typography variant="h6" component="h1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        Proxy Checker
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Sign in to continue
                    </Typography>
                </Box>

                {error === 'invalid' && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                        Invalid credentials
                    </Alert>
                )}
                {error === 'network' && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                        Could not connect to server
                    </Alert>
                )}
                {error === 'other' && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                        Sign in failed. Please try again.
                    </Alert>
                )}

                <TextField
                    fullWidth
                    label="Username"
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    margin="normal"
                    variant="outlined"
                />
                <TextField
                    fullWidth
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    margin="normal"
                    variant="outlined"
                />

                <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    color="primary"
                    disabled={loading}
                    sx={{ mt: 3, py: 1.25, fontWeight: 600 }}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
                </Button>
            </Box>
        </Box>
    );
};

export default Login;
