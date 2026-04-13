import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import { alpha } from '@mui/material/styles';
import { FOOTER_BACKGROUND, CARD_BACKGROUND } from '../../theme/palette';

const PROTOCOL_COLOR = {
    http:   '#4888C7',
    https:  '#6DA0D2',
    socks4: '#9CA3AF',
    socks5: '#9CA3AF',
};

const ANON_COLOR = {
    elite:       'success.main',
    anonymous:   'warning.main',
    transparent: 'text.secondary',
};

const ProtocolRow = ({ protocol, isWorking, error, anon }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
    }}>
        <Typography variant="caption" sx={{
            fontFamily: '"Roboto Mono", monospace',
            fontWeight: 700,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: PROTOCOL_COLOR[protocol] || '#9CA3AF',
            minWidth: 52,
            flexShrink: 0,
        }}>
            {protocol}
        </Typography>

        {isWorking ? (
            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: '0.75rem' }}>
                ✓ Working
            </Typography>
        ) : (
            <Typography variant="caption" sx={{ color: 'error.main', fontSize: '0.75rem' }}>
                ✗ {error || 'failed'}
            </Typography>
        )}

        {isWorking && anon && (
            <Chip
                label={anon}
                size="small"
                variant="outlined"
                sx={{
                    ml: 'auto',
                    height: 18,
                    fontSize: '0.62rem',
                    borderColor: alpha('#fff', 0.15),
                    color: ANON_COLOR[anon] || 'text.secondary',
                }}
            />
        )}
    </Box>
);

const FullDataSection = ({ protocol, data }) => {
    const [open, setOpen] = useState(false);
    const headers = data.headers ? Object.entries(data.headers) : [];

    return (
        <Box sx={{ borderTop: `1px solid ${FOOTER_BACKGROUND}`, mt: 0 }}>
            <Box
                onClick={() => setOpen(o => !o)}
                sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    px: 2, py: 1, cursor: 'pointer',
                    '&:hover': { bgcolor: alpha('#fff', 0.03) },
                }}
            >
                <Typography variant="caption" sx={{
                    fontFamily: '"Roboto Mono", monospace',
                    fontWeight: 700, fontSize: '0.68rem',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: PROTOCOL_COLOR[protocol] || '#9CA3AF',
                }}>
                    {protocol} response
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                    {open ? '▲' : '▼'}
                </Typography>
            </Box>
            <Collapse in={open}>
                <Box sx={{ px: 2, pb: 1.5 }}>
                    {headers.length > 0 && (
                        <Box sx={{ mb: 1 }}>
                            {headers.map(([k, v]) => (
                                <Box key={k} sx={{ display: 'flex', gap: 1, mb: 0.25 }}>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem', minWidth: 100, flexShrink: 0 }}>
                                        {k}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem', wordBreak: 'break-all', fontFamily: '"Roboto Mono", monospace' }}>
                                        {v}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                    {data.body && (
                        <Box sx={{
                            bgcolor: CARD_BACKGROUND,
                            borderRadius: 1,
                            p: 1,
                            maxHeight: 200,
                            overflow: 'auto',
                        }}>
                            <Typography variant="caption" sx={{
                                display: 'block',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                fontFamily: '"Roboto Mono", monospace',
                                fontSize: '0.65rem',
                                color: 'text.secondary',
                                lineHeight: 1.6,
                            }}>
                                {data.body}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

const DetailsTab = ({ checkedProtocols, workingProtocols, errors, anon, status, server, fullData }) => {
    if (status === 'cancelled') {
        return (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                    Check was cancelled before completing
                </Typography>
            </Box>
        );
    }

    if (checkedProtocols.length === 0) {
        return (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                    No protocol results available
                </Typography>
            </Box>
        );
    }

    const hasFullData = fullData && Object.keys(fullData).length > 0;

    return (
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {checkedProtocols.map(proto => (
                <ProtocolRow
                    key={proto}
                    protocol={proto}
                    isWorking={workingProtocols.includes(proto)}
                    error={errors[proto]}
                    anon={(proto === 'http' || proto === 'https') ? anon : undefined}
                />
            ))}

            {server && (
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    px: 2, py: 1.25,
                    borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
                }}>
                    <Typography variant="caption" sx={{
                        color: 'text.disabled', fontSize: '0.7rem',
                        minWidth: 52, flexShrink: 0,
                    }}>
                        Server
                    </Typography>
                    <Typography variant="caption" sx={{
                        fontFamily: '"Roboto Mono", monospace',
                        fontSize: '0.72rem', color: 'text.secondary',
                    }}>
                        {server}
                    </Typography>
                </Box>
            )}

            {hasFullData && (
                <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{
                        px: 2, pb: 0.5, display: 'block',
                        color: 'text.disabled', fontSize: '0.65rem',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                        Full Response Data
                    </Typography>
                    {Object.entries(fullData).map(([proto, data]) => (
                        <FullDataSection key={proto} protocol={proto} data={data} />
                    ))}
                </Box>
            )}
        </Box>
    );
};

export default DetailsTab;
