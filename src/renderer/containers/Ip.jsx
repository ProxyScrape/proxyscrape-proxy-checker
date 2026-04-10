import React from 'react';
import { connect } from 'react-redux';
import { changeOption } from '../actions/IpActions';
import { IpLookup } from '../actions/OverlayIpActions';
import { HelpTip, InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

const Ip = ({ lookupUrl, current, changeOption, IpLookup }) => (
    <>
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                Ip address lookup
                <InfoIcon title="The checker needs your real IP address to determine proxy anonymity levels (transparent, anonymous, elite). This URL should return your public IP in plain text." />
            </Typography>
            <HelpTip title="URL that returns your public IP address in plain text" placement="bottom">
                <TextField
                    fullWidth
                    size="small"
                    name="lookupUrl"
                    placeholder="Url"
                    onChange={changeOption}
                    value={lookupUrl}
                />
            </HelpTip>
        </Box>
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>Your ip is</Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <HelpTip title="Your detected public IP. You can manually override this if auto-detection fails." placement="bottom">
                    <TextField
                        fullWidth
                        size="small"
                        name="current"
                        placeholder="Your IP address"
                        onChange={changeOption}
                        value={current}
                    />
                </HelpTip>
                <Button variant="contained" size="small" onClick={IpLookup} sx={{ whiteSpace: 'nowrap' }}>
                    Check
                </Button>
            </Stack>
        </Box>
    </>
);

const mapStateToProps = state => ({
    ...state.ip
});

const mapDispatchToProps = {
    changeOption,
    IpLookup
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Ip);
