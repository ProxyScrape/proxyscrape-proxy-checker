import React, { memo } from 'react';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

const CounterProtocol = memo(({ count, name, isHttp }) => {
    if (count == undefined) return null;

    return (
        <Box sx={{
            textAlign: 'center',
            opacity: count > 0 ? 1 : 0.4,
        }}>
            <Typography variant="caption" sx={{
                fontWeight: 600,
                color: isHttp ? 'primary.main' : '#A1D0FF',
                fontSize: '0.7rem',
            }}>
                {name}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {splitByKK(count)}
            </Typography>
        </Box>
    );
});

export default CounterProtocol;
