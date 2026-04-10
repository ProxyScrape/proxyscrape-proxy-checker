import React from 'react';
import ResultItemData from './ResultItemData';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';

export default class ResultListItem extends React.PureComponent {
    state = {
        isDataOpened: false
    };

    toggleOpenData = e => {
        e.stopPropagation();
        if (!e.ctrlKey) {
            this.setState({ isDataOpened: !this.state.isDataOpened });
        }
    };

    getProtocolColor = (protocol) => protocol.match(/http/) ? 'primary' : 'secondary';

    render = () => {
        const { host, ip, port, protocols, anon, country, timeout, keepAlive, server, data, blacklist } = this.props;

        return (
            <Box sx={{
                borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
                counterIncrement: 'items-counter',
            }}>
                <Box
                    onClick={this.toggleOpenData}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        py: 0.75,
                        px: 1,
                        cursor: data ? 'pointer' : 'default',
                        transition: 'background-color 0.15s',
                        '&:hover': { bgcolor: alpha('#fff', 0.03) },
                    }}
                >
                    <Box sx={{
                        width: 40,
                        fontSize: '0.7rem',
                        color: 'text.secondary',
                        '&::before': {
                            content: 'counter(items-counter)',
                        },
                    }} />
                    <Box sx={{ flex: '2 0 0', fontSize: '0.8rem', fontWeight: 500 }}>
                        {host}
                        {host !== ip && (
                            <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary', fontSize: '0.7rem' }} title="Real IP">
                                {ip}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ flex: '1 0 0', fontSize: '0.8rem', color: 'text.secondary' }}>{port}</Box>
                    <Box sx={{ flex: '1.5 0 0', display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {protocols.map(protocol => (
                            <Chip
                                key={protocol}
                                label={protocol}
                                size="small"
                                color={protocol.match(/http/) ? 'primary' : 'default'}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                        ))}
                    </Box>
                    <Box sx={{ flex: '1 0 0' }}>
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
                    </Box>
                    <Box sx={{ flex: '1.5 0 0', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 20, height: 14, flexShrink: 0 }}>
                            <div className={`ico ${country.flag} png`} style={{ width: '100%', height: '100%' }} />
                        </Box>
                        <Box sx={{ overflow: 'hidden' }}>
                            <Typography variant="caption" sx={{ fontSize: '0.75rem', display: 'block', lineHeight: 1.2, fontWeight: 400 }}>{country.name}</Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', lineHeight: 1.2, fontWeight: 400 }} title={country.city}>{country.city}</Typography>
                        </Box>
                    </Box>
                    <Box sx={{ width: 30, textAlign: 'center' }}>
                        {blacklist && (
                            <Typography
                                variant="caption"
                                title={blacklist.join('\n')}
                                sx={{ color: 'error.main', fontWeight: 700, fontSize: '0.7rem' }}
                            >
                                {blacklist.length}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ width: keepAlive !== undefined ? 30 : 0, textAlign: 'center' }}>
                        {keepAlive && (
                            <Typography variant="caption" title="Connection: Keep-Alive" sx={{ color: 'success.main', fontSize: '0.65rem', fontWeight: 700 }}>K-A</Typography>
                        )}
                    </Box>
                    {server !== undefined && (
                        <Box sx={{ flex: '1 0 0', fontSize: '0.75rem', color: 'text.secondary' }}>{server}</Box>
                    )}
                    <Box sx={{ width: 70, textAlign: 'right', fontSize: '0.75rem', color: 'text.secondary' }}>
                        {splitByKK(timeout)} ms
                    </Box>
                </Box>
                {this.state.isDataOpened && <ResultItemData data={data} />}
            </Box>
        );
    };
}
