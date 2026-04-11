import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { blueBrand } from '../theme/palette';

const CheckboxIcon = ({ checked }) => (
    <Box sx={{
        width: 18,
        height: 18,
        borderRadius: '4px',
        border: `2px solid ${checked ? blueBrand[500] : alpha('#fff', 0.3)}`,
        bgcolor: checked ? blueBrand[500] : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
    }}>
        {checked && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )}
    </Box>
);

export default class ResultCountriesItem extends React.PureComponent {
    toggle = () => {
        const { toggle, name, active } = this.props;
        toggle(name, false, !active);
    };

    render = () => {
        const { name, active, count, flag } = this.props;

        return (
            <Box
                onClick={this.toggle}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 0.75,
                    px: 2,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                    '&:hover': { bgcolor: alpha('#fff', 0.04) },
                }}
            >
                <CheckboxIcon checked={active} />
                <Box sx={{ width: 22, height: 14, flexShrink: 0 }}>
                    <div className={`ico ${flag} png`} style={{ width: '100%', height: '100%' }} />
                </Box>
                <Typography variant="body2" sx={{
                    fontSize: '0.8rem',
                    fontWeight: 400,
                    flex: 1,
                    color: active ? 'text.primary' : 'text.secondary',
                    transition: 'color 0.15s',
                }}>
                    {name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 400, flexShrink: 0 }}>
                    {count}
                </Typography>
            </Box>
        );
    };
}
