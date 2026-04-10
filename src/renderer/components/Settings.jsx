import React from 'react';
import Box from '@mui/material/Box';
import Judges from '../containers/Judges';
import Core from '../containers/Core';
import Ip from '../containers/Ip';
import Blacklist from '../containers/Blacklist';

const Settings = ({ tabIndex }) => (
    <Box className="no-select" sx={{ mb: 3 }}>
        {tabIndex === 0 && <Core />}
        {tabIndex === 1 && <Judges />}
        {tabIndex === 2 && <Ip />}
        {tabIndex === 3 && <Blacklist />}
    </Box>
);

export default Settings;
