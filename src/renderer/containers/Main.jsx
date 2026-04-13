import React from 'react';
import Box from '@mui/material/Box';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import Settings from '../components/Settings';
import Input from './Input';
import { connect } from 'react-redux';
import Checking from './Checking';
import Overlay from './Overlay';
import Update from './Update';
import Footer from '../components/Footer';
import Info from '../components/Info';
import LicenseModal from '../components/LicenseModal';
import Notification from '../components/Notification';
import ProtocolWarningDialog from '../components/ProtocolWarningDialog';
import Result from './Result';
import History from '../components/History';
import Titlebar from './Titlebar';
import { checkProxy } from '../actions/InputActions';
import { close as closeResult } from '../actions/ResultActions';
import { openDrawer, closeDrawer } from '../actions/UIActions';
import { trackScreen } from '../misc/analytics';
import { ipcRenderer } from 'electron';
import { TITLEBAR_HEIGHT } from '../constants/Layout';
const TAB_SCREENS = ['Core', 'Judges', 'Ip', 'Blacklist', 'History'];

class Main extends React.PureComponent {

    constructor(props) {
        super(props);
        this.state = {
            showModal: false,
            showNotify: false,
            fileName: "",
            disableNotify: false,
            tabIndex: 0
        };
        this.DirectoryCheck = this.DirectoryCheck.bind(this);
    }

    toggleInfo = () => {
        if (this.props.infoActive) {
            this.props.closeDrawer();
        } else {
            this.props.openDrawer('info');
        }
    };
    toggleModal = () => this.setState({ showModal: !this.state.showModal });
    toggleNotify = () => this.setState({ showNotify: !this.state.showNotify });
    disable = () => this.setState({ disableNotify: !this.state.disableNotify });
    setTabIndex = (e, v) => {
        if (this.props.resultIsOpened) {
            this.props.closeResult();
        }
        this.setState({ tabIndex: v });
        trackScreen(TAB_SCREENS[v] || 'Core');
    };

    DirectoryCheck = () => {
        if (!window.__ELECTRON__) return;
        window.__ELECTRON__.watchDownloads();
        window.__ELECTRON__.onDownloadsChanged((fileName) => {
            if (this.state.disableNotify) {
                window.__ELECTRON__.unwatchDownloads();
                return;
            }
            this.setState({ showNotify: true, fileName });
        });
    }

    render = () => {
        const { releases, checkProxy } = this.props;

        return (
            <>
                <Titlebar toggleInfo={this.toggleInfo}>
                    <MuiTabs
                        value={this.state.tabIndex}
                        onChange={this.setTabIndex}
                        onClick={() => {
                            if (this.props.resultIsOpened) {
                                this.props.closeResult();
                            }
                        }}
                        sx={{
                            minHeight: TITLEBAR_HEIGHT,
                            height: TITLEBAR_HEIGHT,
                            '& .MuiTabs-indicator': {
                                bottom: 0,
                            },
                            '& .MuiTab-root': {
                                minHeight: TITLEBAR_HEIGHT,
                                height: TITLEBAR_HEIGHT,
                                py: 0,
                                px: 2,
                            },
                        }}
                    >
                        <MuiTab label="Core" />
                        <MuiTab label="Judges" />
                        <MuiTab label="Ip" />
                        <MuiTab label="Blacklist" />
                        <MuiTab label="History" />
                    </MuiTabs>
                </Titlebar>
                <Box sx={{
                    bgcolor: 'background.paper',
                    minHeight: '100vh',
                }}>
                    <Box sx={{
                        width: '100%',
                        overflowY: 'auto',
                        height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`,
                        pt: `${TITLEBAR_HEIGHT}px`,
                        pb: '115px',
                        px: 5,
                    }}>
                        <Box sx={{ pt: 3 }}>
                            {this.state.tabIndex <= 3 && <Settings tabIndex={this.state.tabIndex} />}
                            {this.state.tabIndex === 0 && <Input />}
                            <History visible={this.state.tabIndex === 4} />
                        </Box>
                    </Box>
                    <Info show={this.props.infoActive} releases={releases} toggleInfo={this.toggleInfo}/>
                    <LicenseModal show={this.state.showModal} toggleModal={this.toggleModal}/>
                    <Result />
                    <Checking />
                    <Overlay />
                    <Update />
                    <Notification fileName={this.state.fileName} show={this.state.showNotify} toggleNotify={this.toggleNotify} checkProxy={checkProxy} disable={this.disable}/>
                    <ProtocolWarningDialog />
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
    checkProxy,
    closeResult,
    openDrawer,
    closeDrawer,
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Main);
