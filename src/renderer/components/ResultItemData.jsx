import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';

export default class ResultItemData extends React.Component {
    state = {
        full: false
    };

    viewFull = () => this.setState({ full: true });

    render = () => {
        const { data } = this.props;

        return data ? (
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha('#fff', 0.02), borderTop: `1px solid ${alpha('#fff', 0.05)}` }}>
                {data.map(item => (
                    <Box key={item.protocol} sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Details</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 0.5, mb: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>Protocol</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 400 }}>{item.protocol}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>Anon</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 400 }}>{item.anon}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>Judge</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 400 }}>{item.judge}</Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Timings</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 0.5, mb: 1.5 }}>
                            {['lookup', 'connect', 'socket', 'response', 'end'].map(key => (
                                <React.Fragment key={key}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'capitalize', fontWeight: 400 }}>{key}</Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 400 }}>{item.timings[key]}</Typography>
                                </React.Fragment>
                            ))}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Response</Typography>
                            {!this.state.full && item.response.body.length >= 800 && (
                                <Button size="small" variant="text" onClick={this.viewFull} sx={{ fontSize: '0.7rem', minWidth: 'auto', p: 0 }}>
                                    View full
                                </Button>
                            )}
                        </Box>
                        <Box
                            component="textarea"
                            readOnly
                            value={this.state.full || item.response.body.length < 800 ? item.response.body : `${item.response.body.slice(0, 800)}.....`}
                            sx={{
                                width: '100%',
                                bgcolor: alpha('#fff', 0.04),
                                color: 'text.primary',
                                border: `1px solid ${alpha('#fff', 0.08)}`,
                                borderRadius: 2,
                                p: 1.5,
                                fontFamily: '"Roboto Mono", monospace',
                                fontSize: '0.75rem',
                                resize: 'vertical',
                                minHeight: 80,
                                outline: 'none',
                            }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mt: 1.5, mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>Headers</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0.5 }}>
                            {Object.keys(item.response.headers).map(header => (
                                <React.Fragment key={header}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>{header}</Typography>
                                    <Typography variant="caption" sx={{ wordBreak: 'break-all', fontWeight: 400 }}>{item.response.headers[header]}</Typography>
                                </React.Fragment>
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>
        ) : null;
    };
}
