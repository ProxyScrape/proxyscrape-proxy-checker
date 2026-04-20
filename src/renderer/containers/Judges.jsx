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
import { isGuestMode } from '../misc/mode';
import { GuestModeBannerV3Option5 as GuestModeBanner } from '../components/ui/GuestModeBannerV3';

const Judges = ({ items, swap, statuses, refreshing, change, add, remove, toggleOption, refreshJudges }) => {
    const guestMode = isGuestMode();

    useEffect(() => {
        refreshJudges();
    }, []);

    return (
        <>
            {guestMode && (
                <GuestModeBanner
                    feature="Judge settings"
                    description="Judges are target URLs the checker sends requests through. They detect anonymity level and let you test proxies against any custom target. Configuring judges requires the desktop app."
                />
            )}
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
                        disabled={refreshing || guestMode}
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
                            change={guestMode ? () => {} : change}
                            remove={guestMode ? () => {} : remove}
                            status={statuses[item.url]}
                            refreshing={refreshing}
                            readOnly={guestMode}
                        />
                    ))}
                </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Options</Typography>
                    <Checkbox
                        id="swap"
                        name="swap"
                        checked={swap}
                        onChange={toggleOption}
                        text="Swap"
                        tip="Rotate between active judges for each request instead of always using the same one. Helps distribute load when you have multiple judges."
                        lockedTip={guestMode ? { feature: 'Judge swap', description: 'Configuring judge rotation requires the free desktop app.' } : undefined}
                    />
                </Box>
                {!guestMode && (
                    <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                            Add new
                            <InfoIcon title="Add a new judge URL. The URL should return your IP address in the response body so the checker can determine proxy anonymity." />
                        </Typography>
                        <JudgesAddNew add={add} />
                    </Box>
                )}
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
