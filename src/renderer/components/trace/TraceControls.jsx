import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { FOOTER_BACKGROUND } from '../../theme/palette';
import { blueBrand } from '../../theme/palette';

export const ProtocolTabs = ({ protocols, active, onChange }) => (
    <Box sx={{
        display: 'flex',
        px: 2,
        pt: 1.25,
        flexShrink: 0,
        borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
    }}>
        {protocols.map(p => (
            <Box
                key={p}
                onClick={() => onChange(p)}
                sx={{
                    px: 1.5,
                    py: 0.75,
                    cursor: 'pointer',
                    borderBottom: '2px solid',
                    borderColor: active === p ? 'primary.main' : 'transparent',
                    mb: '-1px',
                    transition: 'border-color 0.15s',
                    '&:hover': {
                        borderColor: active === p ? 'primary.main' : alpha('#fff', 0.2),
                    },
                }}
            >
                <Typography variant="caption" sx={{
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: active === p ? 'primary.main' : 'text.secondary',
                }}>
                    {p}
                </Typography>
            </Box>
        ))}
    </Box>
);

export const ViewToggle = ({ value, onChange }) => (
    <Box sx={{
        display: 'flex',
        border: `1px solid ${alpha('#fff', 0.1)}`,
        borderRadius: 1.5,
        overflow: 'hidden',
    }}>
        {['all', 'tcp'].map((mode, i) => (
            <Typography
                key={mode}
                variant="caption"
                onClick={() => onChange(mode)}
                sx={{
                    cursor: value === mode ? 'default' : 'pointer',
                    px: 1.25,
                    py: 0.5,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: value === mode ? blueBrand[400] : 'text.secondary',
                    bgcolor: value === mode ? alpha(blueBrand[400], 0.08) : 'transparent',
                    transition: 'color 0.15s, background-color 0.15s',
                    borderLeft: i > 0 ? `1px solid ${alpha('#fff', 0.1)}` : 'none',
                    '&:hover': value === mode ? {} : {
                        color: 'text.primary',
                        bgcolor: alpha('#fff', 0.05),
                    },
                }}
            >
                {mode === 'all' ? 'All' : 'TCP'}
            </Typography>
        ))}
    </Box>
);
