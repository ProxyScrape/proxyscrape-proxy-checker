import React from 'react';
import { connect } from 'react-redux';
import { changeOption, toggleOption, toggleProtocol } from '../actions/CoreActions';
import Checkbox from '../components/ui/Checkbox';
import { HelpTip, InfoIcon } from '../components/ui/HelpTip';
import { splitByKK } from '../misc/text';
import { getMaxThreads } from '../misc/other';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';

const Core = ({ protocols, captureFullData, captureServer, threads, timeout, retries, keepAlive, changeOption, toggleOption, toggleProtocol }) => {
    const handleSliderChange = (name) => (e, value) => {
        changeOption({ target: { name, value } });
    };

    return (
        <>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                    Protocols
                    <InfoIcon title="Select which proxy protocols to test. Enabling more protocols reduces the max thread count." />
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Checkbox id='http-protocol' name='http' checked={protocols.http} onChange={toggleProtocol} text='HTTP' tip="Check proxies for HTTP protocol support" />
                    <Checkbox id='https-protocol' name='https' checked={protocols.https} onChange={toggleProtocol} text='HTTPs' tip="Check proxies for HTTPS (SSL) protocol support" />
                    <Checkbox id='socks4-protocol' name='socks4' checked={protocols.socks4} onChange={toggleProtocol} text='Socks4' tip="Check proxies for SOCKS4 protocol support" />
                    <Checkbox id='socks5-protocol' name='socks5' checked={protocols.socks5} onChange={toggleProtocol} text='Socks5' tip="Check proxies for SOCKS5 protocol support" />
                </Box>
            </Box>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                    Data Capturing
                    <InfoIcon title="Extra data to collect during checking. Enabling these adds more detail to results but may slow down checks slightly." />
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Checkbox id='captureFullData' name='captureFullData' checked={captureFullData} onChange={toggleOption} text='Full Data' tip="Capture the full judge response (body and headers) for each protocol tested. Useful for debugging proxy behavior." />
                    <Checkbox id='captureServer' name='captureServer' checked={captureServer} onChange={toggleOption} text='Server' tip="Capture the web server name from proxy responses. Adds a Server column to results." />
                </Box>
            </Box>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Options</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Checkbox id='core-k-a' name='keepAlive' checked={keepAlive} onChange={toggleOption} text='Keep-Alive' tip="Send keep-alive headers and detect if proxies support persistent connections. Adds a Keep-Alive filter to results." />
                </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <HelpTip title="Number of proxies checked simultaneously. Maximum depends on how many protocols are enabled.">
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>Threads</Typography>
                        </HelpTip>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>{threads}</Typography>
                    </Box>
                    <Slider
                        name="threads"
                        min={1}
                        max={getMaxThreads(protocols)}
                        value={Number(threads)}
                        onChange={handleSliderChange('threads')}
                        size="small"
                    />
                </Box>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <HelpTip title="How many times to retry a failed proxy before marking it as dead. Set to 0 to disable retries.">
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>Retries</Typography>
                        </HelpTip>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>{retries > 0 ? retries : 'Off'}</Typography>
                    </Box>
                    <Slider
                        name="retries"
                        min={0}
                        max={10}
                        value={Number(retries)}
                        onChange={handleSliderChange('retries')}
                        size="small"
                    />
                </Box>
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <HelpTip title="Maximum time in milliseconds to wait for a proxy response before timing out. Also sets the upper bound for the timeout filter on the results page.">
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>Timeout</Typography>
                        </HelpTip>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>{splitByKK(timeout)} ms</Typography>
                    </Box>
                    <Slider
                        name="timeout"
                        min={1000}
                        max={60000}
                        step={100}
                        value={Number(timeout)}
                        onChange={handleSliderChange('timeout')}
                        size="small"
                    />
                </Box>
            </Box>
        </>
    );
};

const mapStateToProps = state => ({
    ...state.core
});

const mapDispatchToProps = {
    changeOption,
    toggleOption,
    toggleProtocol
};

export default connect(mapStateToProps, mapDispatchToProps)(Core);
