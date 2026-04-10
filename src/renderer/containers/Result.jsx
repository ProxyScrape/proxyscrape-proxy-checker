import React from 'react';
import ResultListItem from '../components/ResultListItem';
import ResultCountries from '../components/ResultCountries';
import ResultBlacklist from '../components/ResultBlacklist';
import ResultItemsHeader from '../components/ResultItemsHeader';
import ResultExport from '../components/ResultExport';
import Checkbox from '../components/ui/Checkbox';
import { HelpTip, InfoIcon } from '../components/ui/HelpTip';
import SearchIcon from '../components/ui/SearchIcon';
import { connect } from 'react-redux';
import {
    save,
    copy,
    close,
    toggleAnon,
    toggleProtocol,
    toggleMisc,
    toggleCountry,
    onSearchInput,
    loadMore,
    toggleBlacklist,
    toggleCountries,
    setMaxTimeout,
    changePortsInput,
    allowPorts,
    disallowPorts,
    sortResults,
    toggleExport,
    changeExportType,
    changeExportAuthType
} from '../actions/ResultActions';
import { loadFromTxt } from '../actions/InputActions';
import { getFilteredProxies } from '../store/selectors/getFilteredProxies';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

import '../styles/icons.css';

class Result extends React.PureComponent {
    isMoreAvailable = () => this.props.state.countOfResults < this.props.filteredItems.length;

    render = () => {
        const {
            state: { isOpened, anons, protocols, misc, search, countries, items, countOfResults, inBlacklists, timeout, ports, sorting, exporting },
            stats,
            captureServer,
            keepAlive,
            close,
            save,
            copy,
            loadFromTxt,
            onSearchInput,
            toggleAnon,
            toggleProtocol,
            toggleMisc,
            toggleCountry,
            loadMore,
            filteredItems,
            toggleBlacklist,
            toggleCountries,
            maxTimeoutRange,
            setMaxTimeout,
            changePortsInput,
            allowPorts,
            disallowPorts,
            sortResults,
            toggleExport,
            changeExportType,
            changeExportAuthType
        } = this.props;

        const activeCountries = countries.items.filter(item => item.active);
        const displayActiveCountries = activeCountries.length == 0 ? 'Select countries' : countries.items.length == activeCountries.length ? 'All' : activeCountries.map(item => item.name).join(', ');

        const handleTimeoutSlider = (e, value) => {
            setMaxTimeout({ target: { value } });
        };

        return (
            <Box sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: 'background.default',
                zIndex: 1000,
                opacity: isOpened ? 1 : 0,
                pointerEvents: isOpened ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
            }}>
                <Box sx={{ flex: 1, overflow: 'auto', p: 3, pt: '3.5em' }}>
                    <Box sx={{ maxWidth: '100%' }}>
                        <TextField
                            fullWidth
                            size="small"
                            name="search"
                            placeholder="Search"
                            onChange={onSearchInput}
                            value={search}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                            sx={{ mb: 2 }}
                        />

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '1 1 auto', minWidth: 150 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                                    Anons
                                    <InfoIcon title="Filter proxies by anonymity level. Uncheck to hide proxies of that level." />
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                                    <Checkbox id='anon-transparent' name='transparent' checked={anons.transparent} onChange={toggleAnon} text='Transparent' tip="Proxies that reveal your real IP address to the target server" />
                                    <Checkbox id='anon-anonymous' name='anonymous' checked={anons.anonymous} onChange={toggleAnon} text='Anonymous' tip="Proxies that hide your IP but reveal they are proxies" />
                                    <Checkbox id='anon-elite' name='elite' checked={anons.elite} onChange={toggleAnon} text='Elite' tip="Proxies that hide your IP and don't reveal they are proxies" />
                                </Box>
                            </Box>
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '1 1 auto', minWidth: 150 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                                    Protocols
                                    <InfoIcon title="Filter results by working protocol. Uncheck to hide proxies supporting that protocol." />
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                                    <Checkbox id='protocol-http' name='http' checked={protocols.http} onChange={toggleProtocol} text='HTTP' />
                                    <Checkbox id='protocol-https' name='https' checked={protocols.https} onChange={toggleProtocol} text='HTTPs' />
                                    <Checkbox id='protocol-socks4' name='socks4' checked={protocols.socks4} onChange={toggleProtocol} text='Socks4' />
                                    <Checkbox id='protocol-socks5' name='socks5' checked={protocols.socks5} onChange={toggleProtocol} text='Socks5' />
                                </Box>
                            </Box>
                            {keepAlive && (
                                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '0 1 auto' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Misc</Typography>
                                    <Checkbox id='misc-onlyKeepAlive' name='onlyKeepAlive' checked={misc.onlyKeepAlive} onChange={toggleMisc} text='Only Keep-Alive' tip="Show only proxies that support persistent connections" />
                                </Box>
                            )}
                            {inBlacklists && inBlacklists.length > 0 && (
                                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '1 1 auto' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>Blacklists</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                                        <ResultBlacklist inBlacklists={inBlacklists} toggle={toggleBlacklist} />
                                    </Box>
                                </Box>
                            )}
                        </Box>

                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                        Ports
                                        <InfoIcon title="Filter proxies by port number. Enter comma-separated ports and choose Allow (keep only these ports) or Disallow (hide these ports)." />
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <HelpTip title="Show only proxies on these ports">
                                            <Typography
                                                variant="caption"
                                                onClick={allowPorts}
                                                sx={{
                                                    cursor: 'pointer',
                                                    px: 1,
                                                    py: 0.25,
                                                    borderRadius: 1,
                                                    bgcolor: ports.allow ? 'success.main' : 'transparent',
                                                    color: ports.allow ? '#fff' : 'text.secondary',
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                }}
                                            >
                                                Allow
                                            </Typography>
                                        </HelpTip>
                                        <HelpTip title="Hide proxies on these ports">
                                            <Typography
                                                variant="caption"
                                                onClick={disallowPorts}
                                                sx={{
                                                    cursor: 'pointer',
                                                    px: 1,
                                                    py: 0.25,
                                                    borderRadius: 1,
                                                    bgcolor: !ports.allow ? 'error.main' : 'transparent',
                                                    color: !ports.allow ? '#fff' : 'text.secondary',
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                }}
                                            >
                                                Disallow
                                            </Typography>
                                        </HelpTip>
                                    </Box>
                                </Box>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="8080, 80, 3128"
                                    onChange={changePortsInput}
                                    value={ports.input}
                                />
                            </Box>
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <HelpTip title="Hide proxies slower than this value. Set to the maximum to disable this filter.">
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>Max timeout</Typography>
                                    </HelpTip>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>{splitByKK(timeout)} ms</Typography>
                                </Box>
                                <Slider
                                    min={1000}
                                    max={maxTimeoutRange}
                                    step={100}
                                    value={Number(timeout)}
                                    onChange={handleTimeoutSlider}
                                    size="small"
                                />
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={toggleCountries}
                                sx={{
                                    borderRadius: 9999,
                                    textTransform: 'none',
                                    maxWidth: 300,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {displayActiveCountries}
                            </Button>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    Filtered: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{splitByKK(filteredItems.length)}</Box>
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    Total: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{splitByKK(items.length)}</Box>
                                </Typography>
                            </Box>
                        </Box>

                        <ResultItemsHeader sortResults={sortResults} keepAlive={keepAlive} captureServer={captureServer} inBlacklists={inBlacklists} sorting={sorting} />

                        <Box>
                            {filteredItems.slice(0, countOfResults).map(item => (
                                <ResultListItem key={`${item.auth}@${item.host}:${item.port}`} {...item} />
                            ))}
                        </Box>

                        {this.isMoreAvailable() && (
                            <Button
                                variant="outlined"
                                fullWidth
                                onClick={loadMore}
                                sx={{ mt: 1, borderRadius: 3 }}
                            >
                                Load more
                            </Button>
                        )}
                    </Box>
                </Box>

                <Box sx={{
                    position: 'sticky',
                    bottom: 0,
                    bgcolor: alpha(PAGE_BACKGROUND, 0.95),
                    backdropFilter: 'blur(8px)',
                    borderTop: `1px solid ${alpha('#fff', 0.08)}`,
                    p: 1.5,
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 2,
                }}>
                    <Button variant="contained" onClick={toggleExport}>
                        Export
                    </Button>
                    <Button variant="outlined" onClick={() => { close(); loadFromTxt(); }}>
                        New Check
                    </Button>
                    <Button variant="outlined" onClick={close}>
                        Close
                    </Button>
                </Box>

                <ResultCountries {...countries} toggleCountries={toggleCountries} activeCount={activeCountries.length} toggle={toggleCountry} />
                <ResultExport
                    {...exporting}
                    items={filteredItems.slice(0, 3)}
                    toggleExport={toggleExport}
                    changeExportType={changeExportType}
                    changeExportAuthType={changeExportAuthType}
                    save={save}
                    copy={copy}
                />
            </Box>
        );
    };
}

const mapStateToProps = state => ({
    filteredItems: getFilteredProxies(state),
    state: state.result,
    stats: state.main.stats,
    captureServer: state.core.captureServer,
    keepAlive: state.core.keepAlive,
    maxTimeoutRange: state.core.timeout
});

const mapDispatchToProps = {
    close,
    save,
    copy,
    loadFromTxt,
    onSearchInput,
    toggleAnon,
    toggleProtocol,
    toggleMisc,
    toggleCountry,
    loadMore,
    toggleBlacklist,
    toggleCountries,
    setMaxTimeout,
    changePortsInput,
    allowPorts,
    disallowPorts,
    sortResults,
    toggleExport,
    changeExportType,
    changeExportAuthType
};

export default connect(mapStateToProps, mapDispatchToProps)(Result);
