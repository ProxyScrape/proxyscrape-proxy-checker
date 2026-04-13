import React, { memo, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { loadHistory, viewPastCheck, deleteHistoryCheck, clearHistory } from '../actions/HistoryActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { alpha } from '@mui/material/styles';
import { blueBrand } from '../theme/palette';

/** Parses API timestamps: RFC3339 with Z/offset, or legacy date strings without timezone. */
const parseApiDate = (dateStr) => {
    if (dateStr == null || dateStr === '') return null;
    const s = String(dateStr).trim();
    if (!s) return null;
    if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
        return new Date(s);
    }
    return new Date(s + 'Z');
};

const formatInvalid = () => '–';

const formatDate = (dateStr) => {
    const d = parseApiDate(dateStr);
    if (!d || Number.isNaN(d.getTime())) return formatInvalid();
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const formatTime = (dateStr) => {
    const d = parseApiDate(dateStr);
    if (!d || Number.isNaN(d.getTime())) return formatInvalid();
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const DeleteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
);

const HistoryItem = memo(({ check, onView, onDelete }) => {
    const successRate = check.total_checked > 0
        ? Math.round((check.working_count / check.total_checked) * 100)
        : 0;

    return (
        <Box
            onClick={() => onView(check.id)}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                borderBottom: `1px solid ${alpha('#fff', 0.05)}`,
                '&:hover': { bgcolor: alpha('#fff', 0.03) },
                '&:hover .delete-btn': { opacity: 1 },
            }}
        >
            <Box sx={{
                width: 44, height: 44, borderRadius: 2,
                bgcolor: alpha(blueBrand[500], 0.1),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: blueBrand[400] }}>
                    {successRate}%
                </Typography>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {check.working_count.toLocaleString()} working
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                        of {check.total_checked.toLocaleString()} checked
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                        {check.protocols.join(', ').toUpperCase()}
                    </Typography>
                    {check.country_count > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                            {check.country_count} {check.country_count === 1 ? 'country' : 'countries'}
                        </Typography>
                    )}
                    {check.avg_timeout && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                            ~{check.avg_timeout}ms
                        </Typography>
                    )}
                </Box>
            </Box>

            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem', display: 'block' }}>
                    {formatDate(check.created_at)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                    {formatTime(check.created_at)}
                </Typography>
            </Box>

            <IconButton
                className="delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(check.id); }}
                size="small"
                sx={{
                    opacity: 0,
                    color: 'text.disabled',
                    transition: 'opacity 0.15s, color 0.15s',
                    '&:hover': { color: 'error.main' },
                }}
            >
                <DeleteIcon />
            </IconButton>
        </Box>
    );
});

const EmptyState = () => (
    <Box sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        py: 8, px: 3,
    }}>
        <Box sx={{
            width: 64, height: 64, borderRadius: 3,
            bgcolor: alpha('#fff', 0.04),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mb: 2,
        }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={blueBrand[400]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
            </svg>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            No check history yet
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 280 }}>
            Results from your proxy checks will appear here automatically.
        </Typography>
    </Box>
);

const History = ({ checks, loading, loadHistory, viewPastCheck, deleteHistoryCheck, clearHistory, visible }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        if (visible) loadHistory();
    }, [visible]);

    if (!visible) return null;

    const handleClear = () => {
        setConfirmOpen(false);
        clearHistory();
    };

    return (
        <Box sx={{ pt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                    <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                        Check History
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {checks.length} {checks.length === 1 ? 'check' : 'checks'} saved
                    </Typography>
                </Box>
                {checks.length > 0 && (
                    <Button
                        size="small"
                        onClick={() => setConfirmOpen(true)}
                        sx={{
                            color: 'text.disabled',
                            fontSize: '0.75rem',
                            textTransform: 'none',
                            '&:hover': { color: 'error.main' },
                        }}
                    >
                        Clear history
                    </Button>
                )}
            </Box>

            <Dialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                sx={{ '& .MuiDialog-paper': { bgcolor: 'background.paper', borderRadius: 2 } }}
            >
                <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Clear all history?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        This will permanently delete all {checks.length} saved {checks.length === 1 ? 'check' : 'checks'}. This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 2, pb: 2 }}>
                    <Button size="small" onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none' }}>
                        Cancel
                    </Button>
                    <Button size="small" onClick={handleClear} color="error" variant="contained" sx={{ textTransform: 'none' }}>
                        Clear all
                    </Button>
                </DialogActions>
            </Dialog>

            {checks.length === 0 && !loading ? (
                <EmptyState />
            ) : (
                <Box sx={{
                    bgcolor: 'background.default',
                    borderRadius: 3,
                    overflow: 'hidden',
                }}>
                    {checks.map(check => (
                        <HistoryItem
                            key={check.id}
                            check={check}
                            onView={viewPastCheck}
                            onDelete={deleteHistoryCheck}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
};

const mapStateToProps = state => ({
    checks: state.history.checks,
    loading: state.history.loading,
});

const mapDispatchToProps = {
    loadHistory,
    viewPastCheck,
    deleteHistoryCheck,
    clearHistory,
};

export default connect(mapStateToProps, mapDispatchToProps)(History);
