import React from 'react';
import CloseIcon from './ui/CloseIcon';
import DropDocIcon from './ui/DropDocIcon';
import { HelpTip } from './ui/HelpTip';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

export default class BlacklistItem extends React.PureComponent {
    setActive = () => {
        const { setActive, active, title, path } = this.props;
        const activeState = path.length > 0 ? !active : false;
        setActive(title, activeState);
    };

    changePath = e => {
        const { changePath, setActive, title } = this.props;
        const activeState = e.target.value.length > 0 ? true : false;
        changePath(title, e.target.value);
        setActive(title, activeState);
    };

    selectPath = () => {
        const { selectPath, title } = this.props;
        selectPath(title);
    };

    remove = () => {
        const { remove, title } = this.props;
        remove(title);
    };

    render = () => {
        const { title, active, path } = this.props;

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
                            onChange={this.setActive}
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
                            {title}
                        </Typography>
                    </Box>
                    <IconButton onClick={this.remove} size="small" sx={{ color: 'text.secondary', flexShrink: 0, '&:hover': { color: 'error.main' } }}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <HelpTip title="Path to a local .txt file or a URL containing one IP address per line" placement="bottom">
                        <TextField
                            fullWidth
                            size="small"
                            value={path}
                            onChange={this.changePath}
                            placeholder="URL or Select path"
                        />
                    </HelpTip>
                    <IconButton onClick={this.selectPath} sx={{ color: 'text.secondary' }}>
                        <DropDocIcon scale="20"/>
                    </IconButton>
                </Box>
            </Box>
        );
    };
}
