import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import SideDrawer from './ui/SideDrawer';
import { FOOTER_BACKGROUND } from '../theme/palette';
import DetailsTab from './details/DetailsTab';
import TraceTab from './trace/TraceTab';
import { ProtocolTabs } from './trace/TraceControls';

// ─── Tab bar (Details / Trace) ───────────────────────────────────────────────

const DrawerTabs = ({ tabs, active, onChange }) => (
    <Box sx={{
        display: 'flex',
        borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
        flexShrink: 0,
    }}>
        {tabs.map(tab => (
            <Box
                key={tab.id}
                onClick={() => onChange(tab.id)}
                sx={{
                    px: 2,
                    py: 1,
                    cursor: 'pointer',
                    borderBottom: '2px solid',
                    borderColor: active === tab.id ? 'primary.main' : 'transparent',
                    mb: '-1px',
                    transition: 'border-color 0.15s',
                    '&:hover': {
                        borderColor: active === tab.id ? 'primary.main' : alpha('#fff', 0.2),
                    },
                }}
            >
                <Typography variant="caption" sx={{
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    letterSpacing: '0.04em',
                    color: active === tab.id ? 'primary.main' : 'text.secondary',
                    userSelect: 'none',
                }}>
                    {tab.label}
                </Typography>
            </Box>
        ))}
    </Box>
);

// ─── Main component ───────────────────────────────────────────────────────────

const ProxyDetailsDrawer = ({
    open,
    onClose,
    host,
    port,
    status,
    protocols: workingProtocols,
    errors,
    anon,
    traces,
    server,
    fullData,
}) => {
    const [activeTab, setActiveTab] = useState('details');
    const [activeProtocol, setActiveProtocol] = useState(null);

    const hasTraces = Boolean(traces && Object.keys(traces).length > 0);
    const traceProtocols = hasTraces ? Object.keys(traces) : [];

    const currentProtocol = activeProtocol && traceProtocols.includes(activeProtocol)
        ? activeProtocol
        : (traceProtocols[0] || null);

    // Collect every protocol that was attempted: working ones + those in errors.
    const working = workingProtocols || [];
    const errorsMap = errors || {};
    const checkedProtocols = [
        ...working,
        ...Object.keys(errorsMap).filter(p => !working.includes(p)),
    ];

    const tabs = hasTraces
        ? [{ id: 'details', label: 'Details' }, { id: 'trace', label: 'Trace' }]
        : null;

    const headerLeft = (
        <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                {hasTraces ? 'Details & Trace' : 'Details'}
            </Typography>
            {host && (
                <Typography variant="caption" sx={{
                    color: 'text.secondary',
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: '0.7rem',
                    display: 'block',
                    lineHeight: 1.2,
                }}>
                    {host}:{port}
                </Typography>
            )}
        </Box>
    );

    return (
        <SideDrawer open={open} onClose={onClose} width={460} zIndex={1200} headerLeft={headerLeft}>
            {/* Main tab bar — only shown when traces are available */}
            {tabs && (
                <DrawerTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
            )}

            {/* Protocol selector — only in Trace tab and only for multi-protocol traces */}
            {activeTab === 'trace' && traceProtocols.length > 1 && (
                <ProtocolTabs
                    protocols={traceProtocols}
                    active={currentProtocol}
                    onChange={setActiveProtocol}
                />
            )}

            {activeTab === 'details' ? (
                <DetailsTab
                    checkedProtocols={checkedProtocols}
                    workingProtocols={working}
                    errors={errorsMap}
                    anon={anon}
                    status={status}
                    server={server}
                    fullData={fullData}
                />
            ) : (
                <TraceTab
                    traces={traces}
                    currentProtocol={currentProtocol}
                />
            )}
        </SideDrawer>
    );
};

export default ProxyDetailsDrawer;
