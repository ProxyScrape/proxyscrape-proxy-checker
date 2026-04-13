import React from 'react';
import CloseIcon from './ui/CloseIcon';
import { HelpTip } from './ui/HelpTip';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

/** Coloured status dot shown next to the judge URL. */
function StatusDot({ status, refreshing }) {
    if (refreshing) {
        return (
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'warning.main',
                    flexShrink: 0,
                    animation: 'pulse 1s ease-in-out infinite',
                    '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.3 },
                    },
                }}
            />
        );
    }

    if (!status) {
        return (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0, opacity: 0.4 }} />
        );
    }

    return (
        <HelpTip title={status.alive ? `Reachable — ${status.timeoutMs}ms` : 'Unreachable'}>
            <Box
                sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: status.alive ? 'success.main' : 'error.main',
                    flexShrink: 0,
                    cursor: 'default',
                }}
            />
        </HelpTip>
    );
}

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
        const { url, active, validate, status, refreshing } = this.props;

        return (
            <Box sx={{
                mb: 1.5,
                pb: 1.5,
                borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
                opacity: active ? 1 : 0.45,
                transition: 'opacity 0.2s',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                        <Switch
                            checked={active}
                            onChange={this.toggleActive}
                            size="small"
                        />
                        <StatusDot status={status} refreshing={refreshing} />
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
                        {status && status.alive && (
                            <Typography variant="caption" sx={{ color: 'success.main', flexShrink: 0, fontWeight: 500 }}>
                                {status.timeoutMs}ms
                            </Typography>
                        )}
                        {status && !status.alive && (
                            <Typography variant="caption" sx={{ color: 'error.main', flexShrink: 0, fontWeight: 500 }}>
                                unreachable
                            </Typography>
                        )}
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
