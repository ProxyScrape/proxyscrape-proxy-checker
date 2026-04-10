import React from 'react';
import { connect } from 'react-redux';
import { change, add, remove, toggleOption } from '../actions/JudgesActions';
import JudgesItem from '../components/JudgesItem';
import JudgesAddNew from '../components/JudgesAddNew';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const Judges = ({ items, swap, change, add, remove, toggleOption }) => (
    <>
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                Currently active
                <InfoIcon title="Judges are URLs used to test proxy anonymity and connectivity. The checker sends requests through each proxy to these judge URLs and analyzes the response to determine anonymity level." />
            </Typography>
            <Box>
                {items.map(item => (
                    <JudgesItem {...item} key={item.url} change={change} remove={remove} />
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

const mapStateToProps = state => ({
    ...state.judges
});

const mapDispatchToProps = {
    change,
    add,
    remove,
    toggleOption
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Judges);
