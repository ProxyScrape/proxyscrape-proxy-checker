import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Logo from '../../../public/icons/Logo-ProxyScrape-colored.png';

const Notification = ({ show, toggleNotify, fileName, checkProxy, disable }) => {
    return (
        <Snackbar
            open={!!show}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            onClose={toggleNotify}
        >
            <Box sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                p: 2,
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                minWidth: 280,
            }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <img src={Logo} width="120" height="15.25"/>
                    <IconButton onClick={toggleNotify} size="small" sx={{ color: 'text.secondary' }}>
                        <svg viewBox="0 0 224.512 224.512" style={{ width: 12, height: 12, fill: 'currentColor' }}>
                            <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
                        </svg>
                    </IconButton>
                </Box>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                    New proxy list "{fileName}" detected.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Button variant="contained" size="small" data-file={fileName} onClick={checkProxy}>
                        Check
                    </Button>
                    <Typography
                        variant="caption"
                        onClick={disable}
                        sx={{
                            color: 'text.secondary',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            fontSize: '0.7rem',
                            fontWeight: 400,
                            '&:hover': { color: 'text.primary' },
                        }}
                    >
                        Disable notifications
                    </Typography>
                </Box>
            </Box>
        </Snackbar>
    );
};

export default Notification;
