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
import Result from './Result';
import History from '../components/History';
import Titlebar from './Titlebar';
import { checkProxy } from '../actions/InputActions';
import { close as closeResult, closeCountries } from '../actions/ResultActions';
import { trackScreen } from '../misc/analytics';
import { ipcRenderer } from 'electron';
import fs from "fs";

const TITLEBAR_HEIGHT = 38;
const TAB_SCREENS = ['Core', 'Judges', 'Ip', 'Blacklist', 'History'];

class Main extends React.PureComponent {

    constructor(props) {
        super(props);
        this.state = {
            showInfo: false,
            showModal: false,
            showNotify: false,
            fileName: "",
            disableNotify: false,
            tabIndex: 0
        };
        this.DirectoryCheck = this.DirectoryCheck.bind(this);
    }

    toggleInfo = () => {
        const willOpen = !this.state.showInfo;
        if (willOpen && this.props.countriesActive) {
            this.props.closeCountries();
        }
        this.setState({ showInfo: willOpen });
    };
    closeInfo = () => this.setState({ showInfo: false });
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

    DirectoryCheck = (t = this) => {
        let folder = ipcRenderer.sendSync('getDownloadsPath');

        let watcher = fs.watch(folder, { persistent: true }, function (event, fileName) {
            if(event == "change") {
                let file = fileName.split('.');
                if(file[file.length-1] == 'txt') {
                    if(t.state.disableNotify)
                        watcher.close();

                    t.setState({
                        showNotify: true,
                        fileName: fileName
                    });
                }
            }
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
                            <Settings tabIndex={this.state.tabIndex} />
                            {this.state.tabIndex === 0 && <Input />}
                        </Box>
                    </Box>
                    <Info show={this.state.showInfo} releases={releases} toggleInfo={this.toggleInfo}/>
                    <LicenseModal show={this.state.showModal} toggleModal={this.toggleModal}/>
                    <Result />
                    <Checking />
                    <Overlay />
                    <Update />
                    <Notification fileName={this.state.fileName} show={this.state.showNotify} toggleNotify={this.toggleNotify} checkProxy={checkProxy} disable={this.disable}/>
                    <Footer toggleModal={this.toggleModal}/>
                </Box>
            </>
        );
    };
}

const mapStateToProps = state => ({
    releases: state.update.releases,
    resultIsOpened: state.result.isOpened,
    countriesActive: state.result.countries.active
});

const mapDispatchToProps = {
    checkProxy,
    closeResult,
    closeCountries
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Main);
