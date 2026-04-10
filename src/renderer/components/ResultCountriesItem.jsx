import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { blueBrand } from '../theme/palette';

export default class ResultCountriesItem extends React.PureComponent {
    toggle = () => {
        const { toggle, name, active } = this.props;
        toggle(name, false, !active);
    };

    toggleAll = () => {
        const { toggle, name, active } = this.props;
        toggle(name, true, !active);
    };

    render = () => {
        const { name, active, count, flag } = this.props;

        return (
            <Box
                onClick={this.toggle}
                onDoubleClick={this.toggleAll}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: active ? alpha(blueBrand[500], 0.1) : 'transparent',
                    border: `1px solid ${active ? alpha(blueBrand[500], 0.3) : 'transparent'}`,
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: alpha('#fff', 0.05) },
                }}
            >
                <Box sx={{ width: 24, height: 16, flexShrink: 0 }}>
                    <div className={`ico ${flag} png`} style={{ width: '100%', height: '100%' }} />
                </Box>
                <Box sx={{ overflow: 'hidden' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: active ? 600 : 400 }}>{name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 400 }}>Proxies: {count}</Typography>
                </Box>
            </Box>
        );
    };
}
