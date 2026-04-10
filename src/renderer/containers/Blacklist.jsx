import React from 'react';
import { connect } from 'react-redux';
import BlacklistItem from '../components/BlacklistItem';
import BlacklistAddNew from '../components/BlacklistAddNew';
import { changePath, add, remove, setActive, toggleOption, selectPath } from '../actions/BlacklistActions';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const Blacklist = ({ filter, items, changePath, add, remove, setActive, toggleOption, selectPath }) => (
    <>
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                Currently active
                <InfoIcon title="Blacklists are lists of IP addresses to flag in results. Load from a local .txt file or a URL. Matched proxies are marked but not removed — you can filter them on the results page." />
            </Typography>
            <Box>
                {items.map(item => (
                    <BlacklistItem key={item.title} changePath={changePath} remove={remove} setActive={setActive} selectPath={selectPath} {...item} />
                ))}
            </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Options</Typography>
                <Checkbox id="filter" name="filter" checked={filter} onChange={toggleOption} text="Filtering" tip="Enable blacklist checking during proxy verification. When off, blacklists are ignored entirely." />
            </Box>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                    Add new
                    <InfoIcon title="Add a blacklist source. Provide a title and either a URL or local file path containing one IP address per line." />
                </Typography>
                <BlacklistAddNew add={add} />
            </Box>
        </Box>
    </>
);

const mapStateToProps = state => ({
    ...state.blacklist
});

const mapDispatchToProps = {
    changePath,
    add,
    remove,
    setActive,
    toggleOption,
    selectPath
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Blacklist);
