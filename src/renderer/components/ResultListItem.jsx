import React from 'react';
import ReactDOM from 'react-dom';
import ProxyDetailsDrawer from './ProxyDetailsDrawer';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';

export default class ResultListItem extends React.PureComponent {
    handleDetailsClick = e => {
        e.stopPropagation();
        if (this.props.isDetailsOpen) {
            this.props.onCloseDetails();
        } else {
            this.props.onOpenDetails(this.props.host, this.props.port);
        }
    };

    render = () => {
        const {
            host,
            ip,
            port,
            protocols: protocolsProp,
            anon,
            country: countryProp,
            timeout,
            keepAlive,
            coreKeepAlive,
            captureServer,
            server,
            blacklist,
            status: statusProp,
            errors,
            traces,
            fullData,
            geoStatus,
            isDetailsOpen,
            gridTemplate,
        } = this.props;

        const status = statusProp || 'failed';
        const protocols = Array.isArray(protocolsProp) ? protocolsProp : [];
        const country = countryProp || { name: '', city: '', flag: '' };
        const isWorking = status === 'working';
        const isFailed = status === 'failed';
        const isCancelled = status === 'cancelled';

        const rowOpacity = isCancelled ? 0.45 : isFailed ? 0.6 : 1;
        const showAnonDash = !anon;
        const showCountryAsDash = isCancelled || geoStatus === 'skipped';
        const showProtocolsDash = isCancelled || (isFailed && protocols.length === 0);

        return (
            <>
            <Box sx={{
                borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
                counterIncrement: 'items-counter',
                opacity: rowOpacity,
            }}>
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: gridTemplate,
                    alignItems: 'center',
                    py: 0.75,
                    px: 1,
                }}>
                    <Box sx={{
                        fontSize: '0.7rem',
                        color: 'text.secondary',
                        '&::before': { content: 'counter(items-counter)' },
                    }} />

                    <Box sx={{ minWidth: 0, fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                        <span>{host}</span>
                        {!isCancelled && host !== ip && (
                            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary', fontSize: '0.7rem' }} title="Real IP">
                                {ip}
                            </Typography>
                        )}
                        {isCancelled && (
                            <Chip label="cancelled" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6rem', color: 'text.secondary', borderColor: alpha('#fff', 0.15) }} />
                        )}
                        {isFailed && (
                            <Chip label="failed" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                        )}
                    </Box>

                    <Box sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{port}</Box>

                    <Box sx={{ minWidth: 0, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {showProtocolsDash ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>–</Typography>
                        ) : (
                            protocols.map(protocol => (
                                <Chip
                                    key={protocol}
                                    label={protocol}
                                    size="small"
                                    color={protocol.match(/http/) ? 'primary' : 'default'}
                                    variant="outlined"
                                    sx={{ height: 20, fontSize: '0.65rem' }}
                                />
                            ))
                        )}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                        {showAnonDash ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>–</Typography>
                        ) : (
                            <Chip
                                label={anon}
                                size="small"
                                variant="outlined"
                                sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    borderColor: anon === 'elite' ? 'success.main' : anon === 'anonymous' ? 'warning.main' : alpha('#fff', 0.2),
                                    color: anon === 'elite' ? 'success.main' : anon === 'anonymous' ? 'warning.main' : 'text.secondary',
                                }}
                            />
                        )}
                    </Box>

                    <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {showCountryAsDash ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>–</Typography>
                        ) : geoStatus === 'pending' && !country.code ? (
                            <Typography
                                variant="caption"
                                title="Geo data pending enrichment"
                                sx={{ color: 'text.disabled', fontSize: '0.65rem', fontStyle: 'italic' }}
                            >
                                pending…
                            </Typography>
                        ) : (
                            <>
                                <Box sx={{ width: 20, height: 14, flexShrink: 0 }}>
                                    <div className={`ico ${country.flag} png`} style={{ width: '100%', height: '100%' }} />
                                </Box>
                                <Box sx={{ overflow: 'hidden' }}>
                                    <Typography variant="caption" sx={{ fontSize: '0.75rem', display: 'block', lineHeight: 1.2, fontWeight: 400 }}>{country.name}</Typography>
                                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', lineHeight: 1.2, fontWeight: 400 }} title={country.city}>{country.city}</Typography>
                                </Box>
                            </>
                        )}
                    </Box>

                    <Box sx={{ textAlign: 'center' }}>
                        {isCancelled ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>–</Typography>
                        ) : (
                            blacklist && (
                                <Typography variant="caption" title={blacklist.join('\n')} sx={{ color: 'error.main', fontWeight: 700, fontSize: '0.7rem' }}>
                                    {blacklist.length}
                                </Typography>
                            )
                        )}
                    </Box>

                    {coreKeepAlive && (
                        <Box sx={{ textAlign: 'center' }}>
                            {isWorking && keepAlive && (
                                <Typography variant="caption" title="Connection: Keep-Alive" sx={{ color: 'success.main', fontSize: '0.65rem', fontWeight: 700 }}>K-A</Typography>
                            )}
                        </Box>
                    )}

                    {captureServer && (
                        <Box sx={{ minWidth: 0, fontSize: '0.75rem', color: 'text.secondary' }}>
                            {isCancelled || !server ? '–' : server}
                        </Box>
                    )}

                    <Box sx={{ textAlign: 'center', fontSize: '0.75rem', color: 'text.secondary' }}>
                        {!isWorking ? '–' : `${splitByKK(timeout)} ms`}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <Chip
                            label="Details"
                            size="small"
                            onClick={this.handleDetailsClick}
                            sx={{
                                height: 18,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                bgcolor: isDetailsOpen ? alpha('#4888C7', 0.25) : alpha('#fff', 0.06),
                                color: isDetailsOpen ? '#A1D0FF' : 'text.secondary',
                                border: `1px solid ${isDetailsOpen ? alpha('#4888C7', 0.5) : alpha('#fff', 0.12)}`,
                                '&:hover': {
                                    bgcolor: isDetailsOpen ? alpha('#4888C7', 0.35) : alpha('#fff', 0.1),
                                },
                            }}
                        />
                    </Box>
                </Box>

            </Box>

            {ReactDOM.createPortal(
                <ProxyDetailsDrawer
                    open={isDetailsOpen}
                    onClose={this.props.onCloseDetails}
                    host={host}
                    port={port}
                    status={status}
                    protocols={protocols}
                    errors={errors}
                    anon={anon}
                    traces={traces}
                    server={server}
                    fullData={fullData}
                />,
                document.body
            )}
            </>
        );
    };
}
