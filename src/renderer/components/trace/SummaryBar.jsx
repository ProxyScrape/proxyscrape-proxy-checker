import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { FOOTER_BACKGROUND } from '../../theme/palette';

export const buildSummary = events => {
    const sorted = [...events].sort((a, b) => a.offsetMs - b.offsetMs);
    const last = sorted[sorted.length - 1];
    const totalMs = last ? last.offsetMs : 0;
    const tcpConnected = sorted.find(e => e.kind === 'tcp_connected');
    const synAck = sorted.find(e => e.kind === 'syn_ack');
    const connectMs = tcpConnected ? tcpConnected.offsetMs : (synAck ? synAck.offsetMs : null);
    const hasTls = sorted.some(e => e.kind === 'tls_done');
    const doneEvent = sorted.find(e => e.kind === 'done');
    const detail = doneEvent && doneEvent.detail ? doneEvent.detail : null;
    return { totalMs, connectMs, hasTls, detail };
};

const SummaryBar = ({ summary }) => {
    const items = [{ label: 'Total', value: summary.totalMs + ' ms' }];
    if (summary.connectMs !== null) items.push({ label: 'TCP connect', value: summary.connectMs + ' ms' });
    items.push({ label: 'TLS', value: summary.hasTls ? 'Yes' : 'No' });
    if (summary.detail) items.push({ label: 'Result', value: summary.detail });

    return (
        <Box sx={{
            display: 'flex',
            gap: 2.5,
            flexWrap: 'wrap',
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
            bgcolor: alpha('#fff', 0.015),
            flexShrink: 0,
        }}>
            {items.map(item => (
                <Box key={item.label}>
                    <Typography variant="caption" sx={{
                        display: 'block',
                        color: 'text.secondary',
                        fontSize: '0.62rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                        mb: 0.25,
                    }}>
                        {item.label}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '0.78rem' }}>
                        {item.value}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
};

export default SummaryBar;
