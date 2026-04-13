import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { getKindMeta } from './constants';
import { KindIcon } from './TraceIcons';

const monoSx = {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: '0.67rem',
    display: 'inline-block',
};

const RetryDivider = ({ event }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        mt: 0.5,
        mb: 0.25,
        borderTop: '1px solid rgba(240,160,64,0.25)',
    }}>
        <Typography variant="caption" sx={{
            ...monoSx,
            color: '#f0a040',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontSize: '0.62rem',
        }}>
            ↺ {event.detail}
        </Typography>
        <Typography variant="caption" sx={{
            ...monoSx,
            color: alpha('#f0a040', 0.45),
            fontSize: '0.62rem',
        }}>
            t={event.offsetMs}ms
        </Typography>
    </Box>
);

const EventRow = ({ event, deltaMs }) => {
    if (event.kind === 'attempt_start') {
        return <RetryDivider event={event} />;
    }

    const { label, color, group } = getKindMeta(event.kind);
    const isFirst = deltaMs === 0;

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 0.6,
            px: 2,
            '&:hover': { bgcolor: alpha('#fff', 0.03) },
        }}>
            {/* Absolute offset — t=Xms — tells the dev WHEN this happened */}
            <Box sx={{ minWidth: 52, textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="caption" sx={{
                    ...monoSx,
                    color: 'text.secondary',
                    bgcolor: alpha('#fff', 0.06),
                    px: 0.6,
                    py: 0.2,
                    borderRadius: 0.75,
                }}>
                    t={event.offsetMs}ms
                </Typography>
            </Box>

            {/* Delta — +Xms — tells the dev HOW LONG this step took */}
            <Box sx={{ minWidth: 44, textAlign: 'right', flexShrink: 0 }}>
                {!isFirst && (
                    <Typography variant="caption" sx={{
                        ...monoSx,
                        color: deltaMs > 100 ? '#e74856' : deltaMs > 30 ? '#f0a040' : alpha('#fff', 0.3),
                    }}>
                        +{deltaMs}ms
                    </Typography>
                )}
            </Box>

            <Box sx={{ color, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <KindIcon group={group} kind={event.kind} />
            </Box>

            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{
                    fontSize: '0.75rem',
                    fontWeight: group === 'error' ? 600 : 400,
                    color: group === 'error' ? '#e74856' : group === 'tcp' ? '#A1D0FF' : 'text.primary',
                    whiteSpace: 'nowrap',
                }}>
                    {label}
                </Typography>
                {event.bytes > 0 && (
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', flexShrink: 0 }}>
                        {event.bytes} B
                    </Typography>
                )}
                {event.detail && event.kind !== 'done' && (
                    <Typography variant="caption" sx={{
                        fontSize: '0.65rem',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {event.detail}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

export default EventRow;
