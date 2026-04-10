import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';
import SearchBarIcon from './ui/SearchBarIcon';

const OverlayJudges = ({ isActive, items }) => {
    const all = items.length;
    const done = items.filter(item => !item.state.checking).length;

    return (
        <Box sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: alpha(PAGE_BACKGROUND, 0.95),
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isActive ? 1 : 0,
            pointerEvents: isActive ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
        }}>
            <Box sx={{ width: '80%', maxWidth: 500 }}>
                <Typography variant="body1" sx={{ textAlign: 'center', mb: 2, fontWeight: 500 }}>
                    Total Checked: <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>{done} of {all}</Box>
                </Typography>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2 }}>
                    {items.map(item => {
                        const isChecking = item.state.checking;
                        const isSuccess = !isChecking && item.state.working;
                        const isError = !isChecking && !item.state.working;

                        return (
                            <Box
                                key={item.url}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    py: 0.75,
                                    borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
                                    '&:last-child': { borderBottom: 'none' },
                                }}
                            >
                                <Box sx={{ flexShrink: 0, width: 16, height: 16, '& svg': { width: 16, height: 16, fill: isSuccess ? '#00B70B' : isError ? '#e74856' : alpha('#fff', 0.3) } }}>
                                    <SearchBarIcon />
                                </Box>
                                <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }} title={item.url}>
                                    {item.url}
                                </Typography>
                                <Box sx={{ width: 60, textAlign: 'right' }}>
                                    {isChecking ? (
                                        <CircularProgress size={14} />
                                    ) : (
                                        <Chip
                                            label={isSuccess ? `${item.state.timeout} ms` : 'Error'}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: '0.65rem',
                                                bgcolor: isSuccess ? alpha('#00B70B', 0.15) : alpha('#e74856', 0.15),
                                                color: isSuccess ? '#00B70B' : '#e74856',
                                            }}
                                        />
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
};

export default OverlayJudges;
