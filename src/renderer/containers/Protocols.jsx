import React from 'react';
import { connect } from 'react-redux';
import { toggleOption, toggleProtocol } from '../actions/CoreActions';
import { start } from '../actions/CheckingActions';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

const Protocols = ({ protocols, overrideProtocols, hasProtocols, toggleOption, toggleProtocol, start }) => (
    <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mt: 2, mb: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
            Protocols
            <InfoIcon title="By default, each proxy is tested using the protocol declared in the import list (e.g. http:// → HTTP only). Enable 'Override' to ignore list protocols and test all selected protocols against every proxy." />
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
            <Checkbox id='http-protocol' name='http' checked={protocols.http} onChange={toggleProtocol} text='HTTP' tip="Check proxies for HTTP protocol support" />
            <Checkbox id='https-protocol' name='https' checked={protocols.https} onChange={toggleProtocol} text='HTTPs' tip="Check proxies for HTTPS proxy protocol support (TLS connection to the proxy itself)" />
            <Checkbox id='socks4-protocol' name='socks4' checked={protocols.socks4} onChange={toggleProtocol} text='Socks4' tip="Check proxies for SOCKS4 protocol support" />
            <Checkbox id='socks5-protocol' name='socks5' checked={protocols.socks5} onChange={toggleProtocol} text='Socks5' tip="Check proxies for SOCKS5 protocol support" />
        </Box>

        {/* Always rendered at full height to prevent layout shift; invisible until a protocol-prefixed list is loaded. */}
        <Box sx={{
            mt: 1,
            pt: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            visibility: hasProtocols ? 'visible' : 'hidden',
        }}>
            <Checkbox
                id='override-protocols'
                name='overrideProtocols'
                checked={overrideProtocols}
                onChange={toggleOption}
                text='Override list protocols'
                tip="When enabled, the selected protocols above are tested against every proxy regardless of any protocol prefix in the imported list (e.g. http://, socks5://). When disabled (default), each proxy is only tested with its declared protocol."
            />
        </Box>

        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button
                variant="contained"
                fullWidth
                onClick={start}
            >
                Check
            </Button>
        </Box>
    </Box>
);

const mapStateToProps = state => ({
    protocols: state.core.protocols,
    overrideProtocols: state.core.overrideProtocols,
    hasProtocols: state.input.hasProtocols,
});

const mapDispatchToProps = {
    toggleOption,
    toggleProtocol,
    start,
};

export default connect(mapStateToProps, mapDispatchToProps)(Protocols);
