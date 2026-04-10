import React from 'react';
import Counter from '../components/Counter';
import { connect } from 'react-redux';
import { stop } from '../actions/CheckingActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

const Checking = props => (
    <Box sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: alpha(PAGE_BACKGROUND, 0.95),
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: props.state.opened ? 1 : 0,
        pointerEvents: props.state.opened ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
    }}>
        <Box sx={{ textAlign: 'center', width: '80%', maxWidth: 500 }}>
            <Counter {...props.state.counter} />
            <Button variant="contained" onClick={props.stop} sx={{ mt: 3 }}>
                Stop
            </Button>
            {props.state.preparing && (
                <Typography variant="body2" sx={{ mt: 2, color: 'primary.main', fontWeight: 500 }}>
                    Preparing results
                </Typography>
            )}
        </Box>
    </Box>
);

const mapStateToProps = state => ({
    state: state.checking
});

const mapDispatchToProps = {
    stop
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Checking);
