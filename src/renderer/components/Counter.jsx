import React from 'react';
import CounterProtocol from './CounterProtocol';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ProgressBar from './ui/ProgressBar';

const Counter = ({ all, done, protocols: { http, https, socks4, socks5 } }) => {
    const progress = all > 0 ? Math.floor((done / all) * 100) : 0;

    return (
        <>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 3 }}>
                <CounterProtocol count={http} name="HTTP" isHttp />
                <CounterProtocol count={https} name="HTTPs" isHttp />
                <CounterProtocol count={socks4} name="Socks4" />
                <CounterProtocol count={socks5} name="Socks5" />
            </Box>
            <Box sx={{ mb: 1 }}>
            <ProgressBar value={progress} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 600, fontSize: '1.2rem' }}>
                Total Checked: {splitByKK(done)} of {splitByKK(all)}
            </Typography>
        </>
    );
};

export default Counter;
