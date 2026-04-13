import React, { useState, useCallback } from 'react';
import { connect } from 'react-redux';
import { changeOption, toggleOption, toggleProtocol, toggleCaptureTrace, recheckTraceStatus } from '../actions/CoreActions';
import Checkbox from '../components/ui/Checkbox';
import { HelpTip, InfoIcon } from '../components/ui/HelpTip';
import { splitByKK } from '../misc/text';
import { getMaxThreads } from '../misc/other';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import { alpha } from '@mui/material/styles';
import { blueBrand } from '../theme/palette';

// Each entry: msg (description), commands (array of {cmd}), link, restart
const TRACE_SETUP = {
    bpf_permission: {
        msg: 'BPF packet capture requires permission. Install the lightweight ChmodBPF helper (no full Wireshark needed), then click Re-check for next steps:',
        commands: [
            { cmd: 'brew install --cask wireshark-chmodbpf' },
        ],
        restart: false,
    },
    bpf_chmodbpf_installed: {
        msg: 'ChmodBPF is installed but BPF devices haven\'t been unlocked yet. Run this command, then restart the app (the OS doesn\'t need to reboot):',
        commands: [
            { cmd: 'sudo "/Library/Application Support/Wireshark/ChmodBPF/ChmodBPF"' },
        ],
        restart: true,
    },
    cap_net_raw: {
        msg: 'Packet capture requires the CAP_NET_RAW capability on this binary:',
        commands: [
            { cmd: 'sudo setcap cap_net_raw+eip ./checker-linux-x64' },
        ],
        restart: true,
    },
    npcap_missing: {
        msg: 'Packet capture requires Npcap on Windows.',
        link: { label: 'Download Npcap at npcap.com', url: 'https://npcap.com/#download' },
        restart: true,
    },
    libpcap_missing: {
        msg: 'libpcap is not installed:',
        commands: [
            { cmd: 'brew install libpcap' },
        ],
        restart: false,
    },
    unavailable: {
        msg: 'Packet capture is not available on this system.',
        restart: false,
    },
};

const CopyIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}>
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </svg>
);

const CheckIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
);

const CommandBlock = ({ cmd }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    }, [cmd]);

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            mt: 0.75,
            px: 1,
            py: 0.5,
            bgcolor: 'rgba(0,0,0,0.25)',
            borderRadius: 1,
            border: '1px solid rgba(255,255,255,0.08)',
        }}>
            <Typography variant="caption" sx={{
                flex: 1,
                fontFamily: '"Roboto Mono", monospace',
                fontSize: '0.67rem',
                color: '#A1D0FF',
                wordBreak: 'break-all',
            }}>
                {cmd}
            </Typography>
            <Box
                onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy'}
                sx={{
                    flexShrink: 0,
                    cursor: 'pointer',
                    color: copied ? '#00B70B' : 'text.secondary',
                    display: 'flex',
                    alignItems: 'center',
                    p: 0.25,
                    borderRadius: 0.5,
                    transition: 'color 0.15s',
                    '&:hover': { color: copied ? '#00B70B' : 'text.primary' },
                }}
            >
                {copied ? <CheckIcon /> : <CopyIcon />}
            </Box>
        </Box>
    );
};

const Core = ({ protocols, overrideProtocols, captureFullData, captureServer, captureTrace, traceStatus, localDns, threads, timeout, retries, keepAlive, changeOption, toggleOption, toggleProtocol, toggleCaptureTrace, recheckTraceStatus }) => {
    const handleSliderChange = (name) => (e, value) => {
        changeOption({ target: { name, value } });
    };

    return (
        <>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
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
                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Checkbox
                        id='override-protocols'
                        name='overrideProtocols'
                        checked={overrideProtocols}
                        onChange={toggleOption}
                        text='Override list protocols'
                        tip="When enabled, the selected protocols above are tested against every proxy regardless of any protocol prefix in the imported list (e.g. http://, socks5://). When disabled (default), each proxy is only tested with its declared protocol."
                    />
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
                    <Checkbox id='captureTrace' name='captureTrace' checked={captureTrace} onChange={toggleCaptureTrace} text='Traces' tip="Record TCP packet events and connection timing for every proxy. Adds a Trace button to each result row. Requires libpcap (macOS/Linux) or Npcap (Windows)." />
                </Box>
                {captureTrace && traceStatus && !traceStatus.available && (() => {
                    const info = TRACE_SETUP[traceStatus.reason] || TRACE_SETUP.unavailable;
                    return (
                        <Box sx={{ mt: 1, px: 1.25, py: 1, bgcolor: 'rgba(231,72,86,0.08)', border: '1px solid rgba(231,72,86,0.25)', borderRadius: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: '#e74856', fontSize: '0.72rem', fontWeight: 600, display: 'block' }}>
                                    ⚠ TCP packet capture unavailable
                                </Typography>
                                <Typography
                                    variant="caption"
                                    onClick={recheckTraceStatus}
                                    sx={{ color: blueBrand[300], fontSize: '0.68rem', cursor: 'pointer', flexShrink: 0, '&:hover': { textDecoration: 'underline' } }}
                                >
                                    Re-check
                                </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem', lineHeight: 1.5, display: 'block', mt: 0.5 }}>
                                {info.msg}
                            </Typography>
                            {info.commands && info.commands.map(({ cmd }) => (
                                <CommandBlock key={cmd} cmd={cmd} />
                            ))}
                            {info.link && (
                                <Typography
                                    variant="caption"
                                    component="a"
                                    href={info.link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{ color: blueBrand[300], fontSize: '0.68rem', display: 'inline-block', mt: 0.75, '&:hover': { textDecoration: 'underline' } }}
                                >
                                    {info.link.label} ↗
                                </Typography>
                            )}
                            {info.restart && (
                                <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontSize: '0.65rem', display: 'block', mt: 0.75, fontStyle: 'italic' }}>
                                    {traceStatus.reason === 'bpf_chmodbpf_installed'
                                        ? 'Restart the app after running the command above (full OS reboot not required).'
                                        : 'Restart the app after installing.'}
                                </Typography>
                            )}
                        </Box>
                    );
                })()}
            </Box>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Options</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Checkbox id='core-k-a' name='keepAlive' checked={keepAlive} onChange={toggleOption} text='Keep-Alive' tip="Send keep-alive headers and detect if proxies support persistent connections. Adds a Keep-Alive filter to results." />
                    <Checkbox id='core-local-dns' name='localDns' checked={localDns} onChange={toggleOption} text='Local DNS' tip="Resolve target hostnames locally before sending to the proxy (classic SOCKS4/SOCKS5 behaviour). Off by default — not recommended, as it causes DNS leaks and may produce false negatives." />
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
    ...state.core,
});

const mapDispatchToProps = {
    changeOption,
    toggleOption,
    toggleProtocol,
    toggleCaptureTrace,
    recheckTraceStatus,
};

export default connect(mapStateToProps, mapDispatchToProps)(Core);
