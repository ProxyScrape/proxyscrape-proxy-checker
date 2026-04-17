import React from 'react';
import LinearProgress from '@mui/material/LinearProgress';

/**
 * Standardized determinate progress bar used throughout the app.
 * Wraps MUI LinearProgress with consistent height and border-radius so all
 * progress indicators look identical without repeating sx values at each site.
 *
 * Usage:
 *   <ProgressBar value={42} />
 *   <ProgressBar value={progress} sx={{ my: 1 }} />   // extra sx is merged
 */
const ProgressBar = ({ value, sx, ...props }) => (
    <LinearProgress
        variant="determinate"
        value={value}
        sx={{ height: 8, borderRadius: 4, ...sx }}
        {...props}
    />
);

export default ProgressBar;
