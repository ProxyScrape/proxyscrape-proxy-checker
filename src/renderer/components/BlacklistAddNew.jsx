import React from 'react';
import { ipcRenderer } from 'electron';
import DropDocIcon from './ui/DropDocIcon';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';

export default class BlacklistAddNew extends React.PureComponent {
    state = {
        title: '',
        path: ''
    };

    changeTitle = e => this.setState({ title: e.target.value });

    changePath = e => this.setState({ path: e.target.value });

    selectPath = async () => {
        const path = await ipcRenderer.invoke('choose-path', 'open');

        if (path) {
            this.setState({ path });
        }
    };

    add = () => {
        if (this.state.title.length > 0 && this.state.path.length > 0) {
            const { add } = this.props;
            add(this.state.title, this.state.path);
        }
    };

    render = () => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    onChange={this.changePath}
                    value={this.state.path}
                    placeholder="URL or Select path"
                />
                <IconButton onClick={this.selectPath} sx={{ color: 'text.secondary' }}>
                    <DropDocIcon scale="20"/>
                </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    onChange={this.changeTitle}
                    value={this.state.title}
                    placeholder="Title"
                />
                <Button variant="contained" size="small" onClick={this.add}>
                    Add
                </Button>
            </Box>
        </Box>
    );
}
