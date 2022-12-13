import React, { useState }from 'react';
import { connect } from 'react-redux';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable } from '../constants/AppConstants';
import { ipcRenderer } from 'electron';
import ProgressBar from 'react-bootstrap/ProgressBar';
import '../../public/styles/Update.postcss';

class Update extends React.PureComponent {
    
    constructor(props) {
        super(props);
        this.state = {
            percent: 0,
        };
        
    }

    componentDidMount = () => {
        const { checkAtAvailable } = this.props;
        checkAtAvailable();
        let cur_this = this;
        ipcRenderer.on("progress-bar", function (event, data) {

            cur_this.setState({percent: data});
        });
    };

    
    render = () => {
        const { active, available, isChecking, portableAsset } = this.props;

        
        return (
            <div className={active ? (isChecking ? 'update-notify checking' : 'update-notify') : 'update-notify closed'}>
                <div className="lds-ripple">
                    <div />
                    <div />
                </div>
                {available && (
                    <div className="transition-wrap">
                        <div className="update-container">
                            {isPortable ? (
                                <a onClick={openLink} href={portableAsset.browser_download_url}>
                                    Download Update
                                </a>
                            ) : (
                                <>
                                    <div className="update-info">
                                        updating...
                                    </div>
                                    <div className="update-progress">
                                        <ProgressBar now={this.state.percent} />
                                        <div className="update-label">{`${this.state.percent}%`}</div>                                        
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };
}

const mapStateToProps = state => ({
    ...state.update
});

const mapDispatchToProps = {
    checkAtAvailable
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Update);
