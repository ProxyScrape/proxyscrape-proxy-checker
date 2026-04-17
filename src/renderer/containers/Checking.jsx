import React from 'react';
import Counter from '../components/Counter';
import FullScreenOverlay from '../components/ui/FullScreenOverlay';
import { connect } from 'react-redux';
import { stop } from '../actions/CheckingActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

const Checking = ({ state, stop }) => {
    const { opened, preparing, finalizingMessage } = state;
    const isFinalizing = !!finalizingMessage;

    return (
        <FullScreenOverlay isActive={opened}>
            <Box sx={{ textAlign: 'center', width: '80%', maxWidth: 500 }}>
                <Counter {...state.counter} />

                {isFinalizing ? (
                    <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                        <CircularProgress size={14} thickness={5} />
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                            {finalizingMessage}
                        </Typography>
                    </Box>
                ) : (
                    <>
                        <Button variant="contained" onClick={stop} sx={{ mt: 3 }}>
                            Stop
                        </Button>
                        {preparing && (
                            <Typography variant="body2" sx={{ mt: 2, color: 'primary.main', fontWeight: 500 }}>
                                Preparing results
                            </Typography>
                        )}
                    </>
                )}
            </Box>
        </FullScreenOverlay>
    );
};

const mapStateToProps = state => ({
    state: state.checking,
});

const mapDispatchToProps = { stop };

export default connect(mapStateToProps, mapDispatchToProps)(Checking);
