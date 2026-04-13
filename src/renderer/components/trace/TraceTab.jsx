import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { TCP_GROUPS, getKindMeta } from './constants';
import { FOOTER_BACKGROUND } from '../../theme/palette';
import EventRow from './EventRow';
import SummaryBar, { buildSummary } from './SummaryBar';
import { ViewToggle } from './TraceControls';

const PROTOCOL_COLOR = {
    http:   '#4888C7',
    https:  '#6DA0D2',
    socks4: '#9CA3AF',
    socks5: '#9CA3AF',
};

const TraceTab = ({ traces, currentProtocol }) => {
    const [viewMode, setViewMode] = useState('all');

    const allEvents = currentProtocol && traces && traces[currentProtocol]
        ? [...traces[currentProtocol]].sort((a, b) => a.offsetMs - b.offsetMs)
        : [];

    const events = viewMode === 'tcp'
        ? allEvents.filter(e => {
            // Always keep retry dividers so attempt boundaries stay visible
            // even in TCP-only mode (otherwise multiple SYN sequences appear
            // with no explanation between them).
            if (e.kind === 'attempt_start') return true;
            return TCP_GROUPS.has(getKindMeta(e.kind).group);
        })
        : allEvents;

    const summary = allEvents.length > 0 ? buildSummary(allEvents) : null;

    return (
        <>
            <Box sx={{
                px: 2,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
                flexShrink: 0,
            }}>
                {currentProtocol ? (
                    <Typography variant="caption" sx={{
                        fontFamily: '"Roboto Mono", monospace',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: PROTOCOL_COLOR[currentProtocol] || '#9CA3AF',
                    }}>
                        {currentProtocol}
                    </Typography>
                ) : <Box />}
                <ViewToggle value={viewMode} onChange={setViewMode} />
            </Box>

            {summary && <SummaryBar summary={summary} />}

            <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
                {events.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                            {allEvents.length === 0
                                ? 'No trace events recorded'
                                : 'No TCP packet events in this trace'}
                        </Typography>
                    </Box>
                ) : (
                    events.map((event, idx) => (
                        <EventRow
                            key={idx}
                            event={event}
                            deltaMs={idx === 0 ? 0 : event.offsetMs - events[idx - 1].offsetMs}
                        />
                    ))
                )}
            </Box>

            {allEvents.length > 0 && (
                <Box sx={{
                    px: 2,
                    py: 1,
                    borderTop: `1px solid ${FOOTER_BACKGROUND}`,
                    flexShrink: 0,
                }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                        {events.length}
                        {events.length !== allEvents.length ? ` / ${allEvents.length}` : ''} events
                        {viewMode === 'tcp' ? ' · TCP only' : ''}
                    </Typography>
                </Box>
            )}
        </>
    );
};

export default TraceTab;
