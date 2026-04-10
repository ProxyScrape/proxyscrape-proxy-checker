import React from 'react';
import { isURL } from '../misc/regexes';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import FillPlusIcon from './ui/FillPlusIcon';

export default class JudgesAddNew extends React.PureComponent {
    state = {
        url: ''
    };

    changeUrl = e => this.setState({ url: e.target.value });

    addUrl = () => {
        if (this.state.url.length > 0 && isURL(this.state.url)) {
            const { add } = this.props;
            add(this.state.url);
        }
    };

    render = () => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
                fullWidth
                size="small"
                onChange={this.changeUrl}
                value={this.state.url}
                placeholder="Url"
            />
            <IconButton onClick={this.addUrl} sx={{ color: 'primary.main' }}>
                <FillPlusIcon />
            </IconButton>
        </Box>
    );
}
