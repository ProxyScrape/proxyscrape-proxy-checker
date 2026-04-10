import React from 'react';
import { connect } from 'react-redux';
import { loadFromTxt,
        pasteFromClipboard,
        overrideEventDefaults,
        onFileDrop} from '../actions/InputActions';
import { start } from '../actions/CheckingActions';
import Checkbox from '../components/ui/Checkbox';
import { splitByKK } from '../misc/text';
import { toggleOption } from '../actions/CoreActions';
import DropDocIcon from '../components/ui/DropDocIcon';
import { InfoIcon } from '../components/ui/HelpTip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';

const Input = ({ loaded, total, errors, unique, name, size, loadFromTxt, onFileDrop, overrideEventDefaults, pasteFromClipboard, start, shuffle, toggleOption }) => {
    const copyErrors = () => {
        navigator.clipboard.writeText(errors.join('\r\n'));
    };

    return (
        <Box sx={{ mb: 3 }}>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Load from Txt
                        <InfoIcon title={"Supported formats (one proxy per line):\n• ip:port\n• user:pass@ip:port\n• ip:port:user:pass\n• protocol://ip:port\n• protocol://user:pass@ip:port\n\nDrag & drop or browse for .txt files."} />
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'primary.main',
                            cursor: 'pointer',
                            fontWeight: 500,
                            '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={pasteFromClipboard}
                    >
                        Paste From Clipboard
                    </Typography>
                </Box>
                <Box
                    onClick={loadFromTxt}
                    onDragEnter={overrideEventDefaults}
                    onDragLeave={overrideEventDefaults}
                    onDragOver={overrideEventDefaults}
                    onDrop={onFileDrop}
                    sx={{
                        border: `2px dashed ${alpha('#fff', 0.15)}`,
                        borderRadius: 3,
                        p: 3,
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'border-color 0.2s, background-color 0.2s',
                        '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: alpha('#4888C7', 0.05),
                        },
                    }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, '& svg': { fill: alpha('#fff', 0.3) } }}>
                        <DropDocIcon scale="70" />
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                        Drag & Drop Txt Here
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        or <Box component="span" sx={{ textDecoration: 'underline', color: 'primary.main' }}>Browse File</Box>
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    fullWidth
                    onClick={start}
                    sx={{ mt: 2 }}
                >
                    Check
                </Button>
            </Box>
            {loaded && (
                <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 2.5, mt: 2, animation: 'fade-left 0.3s ease' }}>
                    <Box sx={{ mb: 1 }}>
                        <Checkbox id='core-shuffle' name='shuffle' checked={shuffle} onChange={toggleOption} text='Shuffle' tip="Randomize the order of proxies before checking begins" />
                    </Box>
                    <Stack spacing={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(total)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Unique</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(unique)}</Typography>
                        </Box>
                        {errors.length > 0 && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    '&:hover': { color: 'error.main' },
                                }}
                                onClick={copyErrors}
                                title={`Click To Copy:\r\n` + errors.join('\r\n')}
                            >
                                <Typography variant="body2" sx={{ color: 'error.main' }}>Parse Errors</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>{errors.length}</Typography>
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>File Names</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Size</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(size)} bytes</Typography>
                        </Box>
                    </Stack>
                </Box>
            )}
            {!loaded && (
                <Box sx={{ textAlign: 'center', mt: 3, '& svg': { width: 200, fill: alpha('#fff', 0.06) } }}>
                    <svg viewBox='0 -17 512 512'>
                        <path d='m74.722656 297.265625h-51.734375c-12.675781 0-22.988281 10.3125-22.988281 22.992187v134.375c0 12.675782 10.3125 22.988282 22.988281 22.988282h51.734375c12.679688 0 22.992188-10.3125 22.992188-22.988282v-134.375c0-12.679687-10.3125-22.992187-22.992188-22.992187zm7.992188 157.367187c0 4.402344-3.585938 7.988282-7.992188 7.988282h-51.734375c-4.402343 0-7.988281-3.585938-7.988281-7.988282v-134.375c0-4.40625 3.585938-7.992187 7.988281-7.992187h51.734375c4.40625 0 7.992188 3.585937 7.992188 7.992187zm0 0' />
                        <path d='m212.820312 191.945312h-51.734374c-12.675782 0-22.988282 10.3125-22.988282 22.988282v42.644531c0 4.140625 3.355469 7.5 7.5 7.5 4.140625 0 7.5-3.359375 7.5-7.5v-42.644531c0-4.402344 3.582032-7.988282 7.988282-7.988282h51.734374c4.40625 0 7.988282 3.585938 7.988282 7.988282v239.699218c0 4.402344-3.582032 7.988282-7.988282 7.988282h-51.734374c-4.40625 0-7.988282-3.585938-7.988282-7.988282v-167.054687c0-4.140625-3.359375-7.5-7.5-7.5-4.144531 0-7.5 3.359375-7.5 7.5v167.054687c0 12.675782 10.3125 22.988282 22.988282 22.988282h51.734374c12.675782 0 22.988282-10.3125 22.988282-22.988282v-239.695312c0-12.679688-10.3125-22.992188-22.988282-22.992188zm0 0' />
                        <path d='m350.914062 255.140625h-51.734374c-12.675782 0-22.988282 10.3125-22.988282 22.988281v176.503906c0 12.675782 10.3125 22.988282 22.988282 22.988282h51.734374c12.679688 0 22.992188-10.3125 22.992188-22.988282v-176.503906c0-12.675781-10.3125-22.988281-22.992188-22.988281zm7.992188 199.492187c0 4.402344-3.585938 7.988282-7.992188 7.988282h-51.734374c-4.40625 0-7.988282-3.585938-7.988282-7.988282v-176.503906c0-4.40625 3.582032-7.988281 7.988282-7.988281h51.734374c4.40625 0 7.992188 3.582031 7.992188 7.988281zm0 0' />
                        <path d='m489.011719 139.285156h-51.734375c-12.675782 0-22.992188 10.3125-22.992188 22.988282v214.304687c0 4.140625 3.359375 7.5 7.5 7.5 4.144532 0 7.5-3.359375 7.5-7.5v-214.304687c0-4.40625 3.585938-7.988282 7.992188-7.988282h51.734375c4.402343 0 7.988281 3.582032 7.988281 7.988282v292.359374c0 4.402344-3.585938 7.988282-7.988281 7.988282h-51.734375c-4.40625 0-7.992188-3.585938-7.992188-7.988282v-48.054687c0-4.140625-3.355468-7.5-7.5-7.5-4.140625 0-7.5 3.359375-7.5 7.5v48.054687c0 12.675782 10.316406 22.988282 22.992188 22.988282h51.734375c12.675781 0 22.988281-10.3125 22.988281-22.988282v-292.359374c0-12.675782-10.3125-22.988282-22.988281-22.988282zm0 0' />
                    </svg>
                </Box>
            )}
        </Box>
    );
};

const mapStateToProps = state => ({
    ...state.input,
    shuffle: state.core.shuffle
});

const mapDispatchToProps = {
    loadFromTxt,
    pasteFromClipboard,
    overrideEventDefaults,
    onFileDrop,
    start,
    toggleOption
};

export default connect(mapStateToProps, mapDispatchToProps)(Input);
