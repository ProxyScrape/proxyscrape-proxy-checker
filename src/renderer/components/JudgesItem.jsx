import React from 'react';
import CloseIcon from './ui/CloseIcon';
import { HelpTip } from './ui/HelpTip';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

export default class JudgesItem extends React.PureComponent {
    toggleActive = () => {
        const { change, url, active } = this.props;
        change(url, { active: !active });
    };

    changeValidateString = e => {
        const { change, url } = this.props;
        change(url, { validate: e.target.value });
    };

    remove = () => {
        const { remove, url } = this.props;
        remove(url);
    };

    render = () => {
        const { url, active, validate } = this.props;

        return (
            <Box sx={{
                mb: 1.5,
                pb: 1.5,
                borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
                opacity: active ? 1 : 0.45,
                transition: 'opacity 0.2s',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1 }}>
                        <Switch
                            checked={active}
                            onChange={this.toggleActive}
                            size="small"
                        />
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {url}
                        </Typography>
                    </Box>
                    <IconButton onClick={this.remove} size="small" sx={{ color: 'text.secondary', flexShrink: 0, '&:hover': { color: 'error.main' } }}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <HelpTip title="Regular expression to validate the judge response. The response body must match this pattern for the check to succeed. Leave empty to accept any response." placement="bottom">
                    <TextField
                        fullWidth
                        size="small"
                        value={validate}
                        onChange={this.changeValidateString}
                        placeholder="Validate RegExp or String"
                        sx={{ mt: 1 }}
                    />
                </HelpTip>
            </Box>
        );
    };
}
