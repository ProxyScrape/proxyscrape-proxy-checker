import React from 'react';
import { connect } from 'react-redux';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { dismissMmdbError, retryAfterMmdbError, continueWithoutMmdb } from '../actions/CheckingActions';
import DialogActionRow from './ui/DialogActionRow';

const WifiOffIcon = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
);

const MmdbErrorDialog = ({ open, dismiss, retry, continueWithout }) => (
    <Dialog open={open} maxWidth="xs" fullWidth onClose={dismiss}>
        <DialogContent sx={{ pt: 3.5, pb: 1, px: 3 }}>
            <Box sx={{
                width: 52,
                height: 52,
                borderRadius: 3,
                bgcolor: alpha('#e74856', 0.12),
                color: 'error.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2.5,
            }}>
                <WifiOffIcon />
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 1 }}>
                Can't Download Location Data
            </Typography>

            <DialogContentText sx={{ lineHeight: 1.65, fontSize: '0.875rem' }}>
                A one-time database file is needed to show country and city
                information in results. Check your internet connection and try
                again, or continue without location data.
            </DialogContentText>
        </DialogContent>

        <DialogActionRow
            cancel={{ label: 'Cancel', onClick: dismiss }}
            secondary={{ label: 'Try Again', onClick: retry }}
            primary={{ label: 'Continue Anyway', onClick: continueWithout }}
        />
    </Dialog>
);

const mapStateToProps = state => ({
    open: state.checking.mmdbError,
});

const mapDispatchToProps = {
    dismiss: dismissMmdbError,
    retry: retryAfterMmdbError,
    continueWithout: continueWithoutMmdb,
};

export default connect(mapStateToProps, mapDispatchToProps)(MmdbErrorDialog);
