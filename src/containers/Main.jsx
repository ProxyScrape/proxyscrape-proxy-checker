import React from 'react';
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
import Titlebar from './Titlebar';
import { toggleDark } from '../actions/MainActions';

import findMixedProxies from '../misc/FindMixedProxies.js';
import { readFile } from 'fs/promises';
import { uniq } from '../misc/array';

import { checkProxy } from '../actions/InputActions';

import fs from "fs";

import '../../public/styles/Main.postcss';
import '../../public/styles/Elements.postcss';



class Main extends React.PureComponent {

    constructor(props) {
        super(props);
        this.state = {
            showInfo: false,
            showModal: false,
            showNotify: false,
            fileName: "",
            disableNotify: false
        };
        this.DirectoryCheck = this.DirectoryCheck.bind(this);
    }
   
    componentDidMount() {
        this.DirectoryCheck();
    }

    toggleInfo = () => this.setState({ showInfo: !this.state.showInfo });
    toggleModal = () => this.setState({ showModal: !this.state.showModal });
    toggleNotify = () => this.setState({ showNotify: !this.state.showNotify });
    disable = () => this.setState({ disableNotify: !this.state.disableNotify });

    DirectoryCheck = (t = this) => {
        
        let folder = `${process.env.USERPROFILE}\\Downloads`;
        

        let watcher = fs.watch(folder, { persistent: true }, function (event, fileName) {
           
            if(event == "change")
            {
                let file = fileName.split('.');
                if(file[file.length-1] == 'txt')
                {
                    if(t.state.disableNotify)
                        watcher.close();

                    let path = folder + '/' + fileName;

                    fs.readFile(path, 'utf-8', (err, data) => {
                        // Change how to handle the file content
                        
                        if(data){
                            const totalLines = data.split(/\r?\n/).filter(item => item.length > 0);
                            const uniqueLines = uniq(totalLines);
                            const { successed: list, failed: errors } = findMixedProxies(uniqueLines);

                            if (!list.length) 
                            {
                                console.log('No proxies found');
                            }   
                            else {
                                t.setState({
                                    showNotify: true,
                                    fileName: fileName
                                });
                            }
                        }

                    });

                   
                }
            }
        
        });



    }
    
    render = () => {
        const { dark, toggleDark, releases, checkProxy } = this.props;

        return (
            <>
                <Titlebar dark={dark} toggleInfo={this.toggleInfo} toggleDark={toggleDark} />
                <div className={`container ${dark ? 'dark' : ''}`}>
                    <div className="main-page-container">
                        <div className="main-page-content">
                            <Settings />
                            <Input />
                        </div>
                    </div>
                    <Info show={this.state.showInfo} releases={releases} toggleInfo={this.toggleInfo}/>
                    <LicenseModal show={this.state.showModal} toggleModal={this.toggleModal}/>
                    <Result />
                    <Checking />
                    <Overlay />
                    <Update />
                    <Notification fileName={this.state.fileName} show={this.state.showNotify} toggleNotify={this.toggleNotify} checkProxy={checkProxy} disable={this.disable}/>
                    <Footer toggleModal={this.toggleModal}/>
                </div>
            </>
        );
    };
}

const mapStateToProps = state => ({
    ...state.main,
    releases: state.update.releases
});

const mapDispatchToProps = {
    toggleDark,
    checkProxy
};


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Main);
