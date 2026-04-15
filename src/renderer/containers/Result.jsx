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
    setMaxTimeout,
    changePortsInput,
    allowPorts,
    disallowPorts,
    sortResults,
    toggleExport,
    changeExportType,
    changeExportAuthType,
    toggleHideStatus,
    setGeoFilter
} from '../actions/ResultActions';
import { openDrawer, closeDrawer, openDetails, closeDetails } from '../actions/UIActions';
import { loadFromTxt } from '../actions/InputActions';
import { getFilteredProxies } from '../store/selectors/getFilteredProxies';
import { splitByKK } from '../misc/text';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

import '../styles/icons.css';

class Result extends React.PureComponent {
    constructor(props) {
        super(props);
        this.tableRef = React.createRef();
        this.loadMoreWrapperRef = React.createRef();
        this.loadMoreInnerRef = React.createRef();
    }

    isMoreAvailable = () => this.props.state.countOfResults < this.props.filteredItems.length;

    updateLoadMore = () => {
        const el = this.tableRef.current;
        const wrapper = this.loadMoreWrapperRef.current;
        const inner = this.loadMoreInnerRef.current;
        if (!el || !wrapper || !inner) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const progress = Math.max(0, Math.min(1, 1 - distanceFromBottom / 80));
        const innerHeight = inner.offsetHeight || 52;
        wrapper.style.height = `${progress * innerHeight}px`;
        wrapper.style.pointerEvents = progress > 0.1 ? 'auto' : 'none';
    };

    componentDidMount() {
        this.updateLoadMore();
    }

    componentDidUpdate(prevProps) {
        if (
            prevProps.state.countOfResults !== this.props.state.countOfResults ||
            prevProps.filteredItems.length !== this.props.filteredItems.length
        ) {
            this.updateLoadMore();
        }
    }

    render = () => {
        const {
            state: { isOpened, anons, protocols, misc, search, countries, items, countOfResults, inBlacklists, timeout, ports, sorting, exporting, hiddenStatuses = ['cancelled'], geoFilter = 'all' },
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
            maxTimeoutRange,
            setMaxTimeout,
            changePortsInput,
            allowPorts,
            disallowPorts,
            sortResults,
            toggleExport,
            changeExportType,
            changeExportAuthType,
            toggleHideStatus,
            setGeoFilter,
            countriesDrawerOpen,
            activeDetails,
            openDrawer,
            closeDrawer,
            openDetails,
            closeDetails,
        } = this.props;

        const gridTemplate = [
            '40px',
            'minmax(120px, 2fr)',
            '55px',
            'minmax(110px, 1.5fr)',
            'minmax(75px, 1fr)',
            'minmax(110px, 1.5fr)',
            '30px',
            keepAlive     ? '30px'              : null,
            captureServer ? 'minmax(75px, 1fr)' : null,
            '70px',
            '58px',
        ].filter(Boolean).join(' ');

        const minTableWidth = 40 + 120 + 55 + 110 + 75 + 110 + 30
            + (keepAlive     ? 30 : 0)
            + (captureServer ? 75 : 0)
            + 70 + 58;

        const handleToggleCountries = () => {
            if (countriesDrawerOpen) closeDrawer();
            else openDrawer('countries');
        };

        const activeCountries = countries.items.filter(item => item.active);
        let displayActiveCountries;
        if (activeCountries.length === 0) {
            displayActiveCountries = 'Select countries';
        } else if (activeCountries.length === countries.items.length) {
            displayActiveCountries = `All countries (${countries.items.length})`;
        } else if (activeCountries.length <= 3) {
            displayActiveCountries = activeCountries.map(item => item.name).join(', ');
        } else {
            displayActiveCountries = activeCountries.slice(0, 3).map(item => item.name).join(', ') + ` +${activeCountries.length - 3} more`;
        }

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
                {/* Controls — fixed height, no scrolling */}
                <Box sx={{ flexShrink: 0, overflow: 'hidden', p: 3, pt: '3.5em' }}>
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
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '1 1 auto', minWidth: 200 }}>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <FormControlLabel
                                        control={(
                                            <Switch
                                                size="small"
                                                checked={!hiddenStatuses.includes('failed')}
                                                onChange={() => toggleHideStatus('failed')}
                                            />
                                        )}
                                        label={(
                                            <Typography variant="body2" component="span" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                                Show failed
                                                <InfoIcon title="Proxies that were checked but did not respond correctly." />
                                            </Typography>
                                        )}
                                        sx={{ m: 0, alignItems: 'flex-start' }}
                                    />
                                    <FormControlLabel
                                        control={(
                                            <Switch
                                                size="small"
                                                checked={!hiddenStatuses.includes('cancelled')}
                                                onChange={() => toggleHideStatus('cancelled')}
                                            />
                                        )}
                                        label={(
                                            <Typography variant="body2" component="span" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                                                Show cancelled
                                                <InfoIcon title="Entries from a stopped check that were not fully tested." />
                                            </Typography>
                                        )}
                                        sx={{ m: 0, alignItems: 'flex-start' }}
                                    />
                                </Box>
                            </Box>
                            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2, flex: '0 1 auto' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                                    Location data
                                    <InfoIcon title="Filter by geo enrichment status." />
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    {[
                                        { value: 'all', label: 'All' },
                                        { value: 'has_geo', label: 'Has geo' },
                                        { value: 'pending', label: 'Pending' },
                                    ].map(({ value, label }) => (
                                        <Typography
                                            key={value}
                                            variant="caption"
                                            onClick={() => setGeoFilter(value)}
                                            sx={{
                                                cursor: 'pointer',
                                                px: 1,
                                                py: 0.25,
                                                borderRadius: 1,
                                                bgcolor: geoFilter === value ? 'primary.main' : 'transparent',
                                                color: geoFilter === value ? '#fff' : 'text.secondary',
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                '&:hover': { bgcolor: geoFilter === value ? 'primary.main' : alpha('#fff', 0.06) },
                                            }}
                                        >
                                            {label}
                                        </Typography>
                                    ))}
                                </Box>
                            </Box>
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
                                    min={100}
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
                                onClick={handleToggleCountries}
                                sx={{
                                    borderRadius: 9999,
                                    textTransform: 'none',
                                    maxWidth: 420,
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

                </Box>

                {/* Table — fills remaining height, only this section scrolls */}
                <Box
                    ref={this.tableRef}
                    onScroll={this.updateLoadMore}
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowX: 'auto',
                        overflowY: 'auto',
                        px: 3,
                        pb: 2,
                    }}
                >
                    <Box sx={{ minWidth: minTableWidth }}>
                        <ResultItemsHeader sortResults={sortResults} keepAlive={keepAlive} captureServer={captureServer} inBlacklists={inBlacklists} sorting={sorting} gridTemplate={gridTemplate} />

                        <Box>
                            {filteredItems.slice(0, countOfResults).map(item => (
                                <ResultListItem
                                    key={item.id}
                                    {...item}
                                    coreKeepAlive={keepAlive}
                                    captureServer={captureServer}
                                    gridTemplate={gridTemplate}
                                    isDetailsOpen={activeDetails !== null && activeDetails.host === item.host && activeDetails.port === item.port}
                                    onOpenDetails={openDetails}
                                    onCloseDetails={closeDetails}
                                />
                            ))}
                        </Box>
                    </Box>
                </Box>

                {/* Load more — height collapses to 0 when not at bottom, slides up from below */}
                {this.isMoreAvailable() && (
                    <Box
                        ref={this.loadMoreWrapperRef}
                        sx={{ flexShrink: 0, overflow: 'hidden', height: 0, position: 'relative', pointerEvents: 'none', mt: 0.5 }}
                    >
                        <Box
                            ref={this.loadMoreInnerRef}
                            sx={{ position: 'absolute', top: 0, left: 0, right: 0, px: 3, pb: 1 }}
                        >
                            <Button
                                variant="outlined"
                                fullWidth
                                onClick={loadMore}
                                sx={{ borderRadius: 3 }}
                            >
                                Load more
                            </Button>
                        </Box>
                    </Box>
                )}

                <Box sx={{
                    flexShrink: 0,
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

                <ResultCountries active={countriesDrawerOpen} items={countries.items} toggleCountries={handleToggleCountries} activeCount={activeCountries.length} toggle={toggleCountry} />
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
    captureServer: state.core.captureServer,
    keepAlive: state.core.keepAlive,
    maxTimeoutRange: state.core.timeout,
    countriesDrawerOpen: state.ui.activeDrawer === 'countries',
    activeDetails: state.ui.activeDetails,
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
    setMaxTimeout,
    changePortsInput,
    allowPorts,
    disallowPorts,
    sortResults,
    toggleExport,
    changeExportType,
    changeExportAuthType,
    toggleHideStatus,
    setGeoFilter,
    openDrawer,
    closeDrawer,
    openDetails,
    closeDetails,
};

export default connect(mapStateToProps, mapDispatchToProps)(Result);
