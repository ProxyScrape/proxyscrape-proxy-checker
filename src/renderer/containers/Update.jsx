import React from 'react';
import { connect } from 'react-redux';
import { checkAtAvailable } from '../actions/UpdateActions';
import { openLink } from '../misc/other';
import { isPortable } from '../../shared/AppConstants';
import { ipcRenderer } from 'electron';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

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

        ipcRenderer.on("download-progress", function (event, data) {
            cur_this.setState({ percent: data });
        });
    };

    render = () => {
        const { active, available, isChecking, portableAsset } = this.props;

        return (
            <Box sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                bgcolor: alpha(PAGE_BACKGROUND, 0.95),
                backdropFilter: 'blur(8px)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: active ? (isChecking ? 0.6 : 1) : 0,
                pointerEvents: active ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
            }}>
                {available && (
                    <Box sx={{ textAlign: 'center', width: '60%', maxWidth: 400 }}>
                        {isPortable ? (
                            <Box
                                component="a"
                                onClick={openLink}
                                href={portableAsset.browser_download_url}
                                sx={{
                                    color: 'primary.main',
                                    fontWeight: 600,
                                    fontSize: '1.1rem',
                                    textDecoration: 'none',
                                    '&:hover': { textDecoration: 'underline' },
                                }}
                            >
                                Download Update
                            </Box>
                        ) : (
                            <>
                                <Typography variant="body1" sx={{ mb: 2, fontWeight: 500 }}>
                                    Downloading update...
                                </Typography>
                                <LinearProgress
                                    variant="determinate"
                                    value={this.state.percent}
                                    sx={{ height: 8, borderRadius: 4, mb: 1 }}
                                />
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {`${this.state.percent}%`} complete
                                </Typography>
                            </>
                        )}
                    </Box>
                )}
            </Box>
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
