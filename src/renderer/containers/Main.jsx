import React from 'react';
import Box from '@mui/material/Box';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import useMediaQuery from '@mui/material/useMediaQuery';
import Settings from '../components/Settings';
import { connect } from 'react-redux';
import Checking from './Checking';
import Overlay from './Overlay';
import Update from './Update';
import ErrorToast from '../components/ErrorToast';
import Footer from '../components/Footer';
import Info from '../components/Info';
import LicenseModal from '../components/LicenseModal';
import ProtocolWarningDialog from '../components/ProtocolWarningDialog';
import Result from './Result';
import History from '../components/History';
import Titlebar from './Titlebar';
import Protocols from './Protocols';
import { close as closeResult } from '../actions/ResultActions';
import InputV2 from './InputV2';
import { openDrawer, closeDrawer } from '../actions/UIActions';
import { trackScreen, trackAction } from '../misc/analytics';
import { TITLEBAR_HEIGHT, FOOTER_HEIGHT, CANARY_BANNER_HEIGHT, GUEST_BANNER_HEIGHT } from '../constants/Layout';
import { IS_CANARY } from '../../shared/AppConstants';
import { isGuestMode } from '../misc/mode';

const TAB_SCREENS = ['Core', 'Judges', 'Ip', 'Blacklist', 'History'];

const TITLEBAR_TAB_SX = {
    minHeight: TITLEBAR_HEIGHT,
    height: TITLEBAR_HEIGHT,
    '& .MuiTabs-indicator': { bottom: 0 },
    '& .MuiTab-root': {
        minHeight: TITLEBAR_HEIGHT,
        height: TITLEBAR_HEIGHT,
        py: 0,
        px: 2,
    },
};

/**
 * Responsive navigation:
 * - Desktop (≥ sm): standard MUI tab bar, all tabs visible
 * - Mobile (< sm): hamburger + current page name in titlebar, slide-out drawer for tab switching
 */
const NavTabs = ({ value, onChange, onClick }) => {
    const isMobile = useMediaQuery('(max-width:599px)');
    const [drawerOpen, setDrawerOpen] = React.useState(false);

    const handleDrawerSelect = (e, index) => {
        onChange(e, index);
        setDrawerOpen(false);
    };

    if (isMobile) {
        return (
            <>
                {/* Titlebar: hamburger + current page name */}
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.5, pl: 0.5 }}>
                    <IconButton
                        size="small"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open navigation menu"
                        sx={{ color: 'rgba(255,255,255,0.8)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
                    >
                        <MenuIcon fontSize="small" />
                    </IconButton>
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', letterSpacing: '0.01em' }}
                    >
                        {TAB_SCREENS[value]}
                    </Typography>
                </Box>

                {/* Slide-out navigation drawer */}
                <Drawer
                    anchor="left"
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                    slotProps={{
                        paper: {
                            sx: {
                                width: 220,
                                bgcolor: '#1E2132',
                                borderTop: '3px solid #4888C7',
                                display: 'flex',
                                flexDirection: 'column',
                            },
                        },
                    }}
                >
                    {/* Branded header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 1.5 }}>
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem', letterSpacing: '0.01em' }}
                        >
                            Menu
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => setDrawerOpen(false)}
                            aria-label="Close navigation menu"
                            sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                    <List disablePadding sx={{ pt: 1 }}>
                        {TAB_SCREENS.map((name, i) => {
                            const active = value === i;
                            return (
                                <ListItemButton
                                    key={name}
                                    selected={active}
                                    onClick={(e) => handleDrawerSelect(e, i)}
                                    sx={{
                                        mx: 1,
                                        mb: 0.5,
                                        borderRadius: 2,
                                        '&.Mui-selected': {
                                            bgcolor: 'rgba(72,136,199,0.15)',
                                            '&:hover': { bgcolor: 'rgba(72,136,199,0.22)' },
                                        },
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                                    }}
                                >
                                    {/* Active indicator bar */}
                                    <Box sx={{
                                        width: 3,
                                        height: 16,
                                        borderRadius: 1,
                                        bgcolor: active ? '#4888C7' : 'transparent',
                                        flexShrink: 0,
                                        mr: 1.5,
                                        transition: 'background-color 0.15s',
                                    }} />
                                    <ListItemText
                                        primary={name}
                                        slotProps={{
                                            primary: {
                                                sx: {
                                                    fontSize: '0.9rem',
                                                    fontWeight: active ? 700 : 400,
                                                    color: active ? '#4888C7' : 'rgba(255,255,255,0.75)',
                                                },
                                            },
                                        }}
                                    />
                                </ListItemButton>
                            );
                        })}
                    </List>
                </Drawer>
            </>
        );
    }

    return (
        <MuiTabs
            value={value}
            onChange={onChange}
            onClick={onClick}
            sx={TITLEBAR_TAB_SX}
        >
            <MuiTab label="Core" />
            <MuiTab label="Judges" />
            <MuiTab label="Ip" />
            <MuiTab label="Blacklist" />
            <MuiTab label="History" />
        </MuiTabs>
    );
};

class Main extends React.PureComponent {

    constructor(props) {
        super(props);
        this.state = {
            showModal: false,
            tabIndex: 0,
        };
    }

    componentDidMount() {
        if (!window.__ELECTRON__?.onDeepLinkProxy) return;
        this._removeDeepLinkListener = window.__ELECTRON__.onDeepLinkProxy((_e, url) => {
            this.handleDeepLink(url);
        });
    }

    componentWillUnmount() {
        if (this._removeDeepLinkListener) {
            this._removeDeepLinkListener();
        }
    }

    handleDeepLink = (url) => {
        try {
            const parsed = new URL(url);
            if (parsed.hostname !== 'check') return;

            const source       = parsed.searchParams.get('source') || 'unknown';
            const proxiesParam = parsed.searchParams.get('proxies'); // bulk: newline-separated
            const proxyParam   = parsed.searchParams.get('proxy');   // single proxy (legacy)

            // Build the raw string array — bulk import takes precedence.
            let rawList;
            if (proxiesParam) {
                rawList = proxiesParam.split('\n').map(s => s.trim()).filter(Boolean);
            } else if (proxyParam) {
                rawList = [proxyParam];
            } else {
                return;
            }

            const browserLabel = source && source !== 'unknown' ? `${source} Extension` : 'Browser Extension';

            if (this.props.resultIsOpened) {
                this.props.closeResult();
            }
            this.setState({ tabIndex: 0 });

            // Populate the editor so the user can review before checking.
            // InputV2 listens for this event and writes the lines into its CodeMirror editor.
            window.dispatchEvent(new CustomEvent('proxy-checker:load-lines', {
                detail: {
                    lines: rawList,
                    meta:  { name: browserLabel, sourceType: 'extension' },
                },
            }));
            trackAction('proxy_list_imported', { source, proxy_count: rawList.length, unique_count: rawList.length, error_count: 0 });
        } catch { /* ignore malformed deep-link URLs */ }
    };

    toggleInfo = () => {
        if (this.props.infoActive) {
            this.props.closeDrawer();
        } else {
            this.props.openDrawer('info');
        }
    };
    toggleModal = () => this.setState({ showModal: !this.state.showModal });
    setTabIndex = (e, v) => {
        if (this.props.resultIsOpened) {
            this.props.closeResult();
        }
        this.setState({ tabIndex: v });
        trackScreen(TAB_SCREENS[v] || 'Core');
    };

    render = () => {
        const { releases } = this.props;
        return (
            <>
                <Titlebar toggleInfo={this.toggleInfo}>
                    <NavTabs
                        value={this.state.tabIndex}
                        onChange={this.setTabIndex}
                        onClick={() => {
                            if (this.props.resultIsOpened) {
                                this.props.closeResult();
                            }
                        }}
                    />
                </Titlebar>
                <Box sx={{
                    bgcolor: 'background.paper',
                    minHeight: '100vh',
                }}>
                    <Box id="checker-scroll-root" sx={{
                        width: '100%',
                        overflowY: 'auto',
                        height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`,
                        pt: `${TITLEBAR_HEIGHT}px`,
                        pb: `${FOOTER_HEIGHT + (IS_CANARY ? CANARY_BANNER_HEIGHT : 0) + (isGuestMode() ? GUEST_BANNER_HEIGHT : 0)}px`,
                        px: { xs: 2, sm: 5 },
                    }}>
                        <Box id="checker-content-root" sx={{ pt: 3 }}>
                            {this.state.tabIndex <= 3 && <Settings tabIndex={this.state.tabIndex} />}
                            {this.state.tabIndex === 0 && <InputV2 />}
                            {this.state.tabIndex === 0 && <Protocols />}
                            <History visible={this.state.tabIndex === 4} />
                        </Box>
                    </Box>
                    <Info show={this.props.infoActive} releases={releases} toggleInfo={this.toggleInfo}/>
                    <LicenseModal show={this.state.showModal} toggleModal={this.toggleModal}/>
                    <Result />
                    <Checking />
                    <Overlay />
                    <Update />
                    <ProtocolWarningDialog />
                    <ErrorToast />
                    <Footer toggleModal={this.toggleModal} closeDrawer={this.props.closeDrawer}/>
                </Box>
            </>
        );
    };
}

const mapStateToProps = state => ({
    releases: state.update.releases,
    resultIsOpened: state.result.isOpened,
    infoActive: state.ui.activeDrawer === 'info',
});

const mapDispatchToProps = {
    closeResult,
    openDrawer,
    closeDrawer,
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Main);
