import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import { change, add, remove, toggleOption, refreshJudges } from '../actions/JudgesActions';
import JudgesItem from '../components/JudgesItem';
import JudgesAddNew from '../components/JudgesAddNew';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

const Judges = ({ items, swap, statuses, refreshing, change, add, remove, toggleOption, refreshJudges }) => {
    useEffect(() => {
        refreshJudges();
    }, []);

    return (
        <>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Currently active
                        <InfoIcon title="Judges are URLs used to test proxy anonymity and connectivity. The checker sends requests through each proxy to these judge URLs and analyzes the response to determine anonymity level." />
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => refreshJudges()}
                        disabled={refreshing}
                        startIcon={refreshing ? <CircularProgress size={12} color="inherit" /> : null}
                        sx={{ minWidth: 80, fontSize: '0.7rem' }}
                    >
                        {refreshing ? 'Pinging…' : 'Ping all'}
                    </Button>
                </Box>
                <Box>
                    {items.map(item => (
                        <JudgesItem
                            {...item}
                            key={item.url}
                            change={change}
                            remove={remove}
                            status={statuses[item.url]}
                            refreshing={refreshing}
                        />
                    ))}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Options</Typography>
                    <Checkbox id="swap" name="swap" checked={swap} onChange={toggleOption} text="Swap" tip="Rotate between active judges for each request instead of always using the same one. Helps distribute load when you have multiple judges." />
                </Box>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                        Add new
                        <InfoIcon title="Add a new judge URL. The URL should return your IP address in the response body so the checker can determine proxy anonymity." />
                    </Typography>
                    <JudgesAddNew add={add} />
                </Box>
            </Box>
        </>
    );
};

const mapStateToProps = state => ({
    ...state.judges
});

const mapDispatchToProps = {
    change,
    add,
    remove,
    toggleOption,
    refreshJudges,
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Judges);
