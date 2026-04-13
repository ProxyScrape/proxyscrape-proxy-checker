import React from 'react';
import { connect } from 'react-redux';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { respondToProtocolWarning } from '../actions/CheckingActions';

const ProtocolWarningDialog = ({ open, listProtocols, selectedProtocols, respondToProtocolWarning }) => (
    <Dialog open={open} maxWidth="sm" fullWidth onClose={() => respondToProtocolWarning('cancel')}>
        <DialogTitle sx={{ pb: 1 }}>Protocol Mismatch Detected</DialogTitle>
        <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
                Your proxy list contains protocols that are not currently selected. By default,
                each proxy will be tested using the protocol declared in the list — not your
                selected protocols.
            </DialogContentText>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                        In list
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {listProtocols.map(p => (
                            <Chip key={p} label={p.toUpperCase()} size="small" color="primary" variant="outlined" />
                        ))}
                    </Box>
                </Box>
                <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                        Selected
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {selectedProtocols.map(p => (
                            <Chip key={p} label={p.toUpperCase()} size="small" variant="outlined" />
                        ))}
                    </Box>
                </Box>
            </Box>
            <DialogContentText variant="body2">
                Click <strong>Continue</strong> to check each proxy using its declared protocol,
                or <strong>Ignore List Protocols</strong> to test all proxies against your selected
                protocols instead.
            </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={() => respondToProtocolWarning('override')}>
                Ignore List Protocols
            </Button>
            <Button variant="contained" onClick={() => respondToProtocolWarning('list')} autoFocus>
                Continue
            </Button>
        </DialogActions>
    </Dialog>
);

const mapStateToProps = state => ({
    open: state.core.protocolWarning.open,
    listProtocols: state.core.protocolWarning.listProtocols,
    selectedProtocols: state.core.protocolWarning.selectedProtocols,
});

const mapDispatchToProps = {
    respondToProtocolWarning,
};

export default connect(mapStateToProps, mapDispatchToProps)(ProtocolWarningDialog);
