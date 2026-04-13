import React, { useState } from 'react';
import { connect } from 'react-redux';
import { loadFromTxt,
        pasteFromClipboard,
        overrideEventDefaults,
        onFileDrop,
        clearInput } from '../actions/InputActions';
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
import Collapse from '@mui/material/Collapse';
import { alpha } from '@mui/material/styles';
import { blueBrand, palette } from '../theme/palette';

const ChevronIcon = ({ open }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
);

const MAX_VISIBLE_ERRORS = 50;

const ParseErrorList = ({ errors }) => {
    const [showAll, setShowAll] = useState(false);
    const displayed = showAll ? errors : errors.slice(0, MAX_VISIBLE_ERRORS);
    const hasMore = errors.length > MAX_VISIBLE_ERRORS;

    const copyErrors = () => {
        navigator.clipboard.writeText(errors.map(e => e.line).join('\r\n'));
    };

    return (
        <Box sx={{ mt: 1 }}>
            <Box sx={{
                maxHeight: 280,
                overflow: 'auto',
                borderRadius: 2,
                bgcolor: alpha('#000', 0.2),
            }}>
                {displayed.map((err, i) => (
                    <Box key={i} sx={{
                        display: 'flex',
                        gap: 1.5,
                        px: 1.5,
                        py: 0.75,
                        borderBottom: i < displayed.length - 1 ? `1px solid ${alpha('#fff', 0.04)}` : 'none',
                        '&:hover': { bgcolor: alpha('#fff', 0.02) },
                    }}>
                        <Typography variant="caption" sx={{
                            color: 'text.disabled',
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            minWidth: 24,
                            textAlign: 'right',
                            pt: '1px',
                            flexShrink: 0,
                            userSelect: 'none',
                        }}>
                            {i + 1}
                        </Typography>
                        <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                            <Typography variant="caption" sx={{
                                fontFamily: '"Roboto Mono", monospace',
                                fontSize: '0.7rem',
                                color: 'error.main',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {err.line}
                            </Typography>
                            <Typography variant="caption" sx={{
                                fontSize: '0.65rem',
                                color: 'text.disabled',
                                display: 'block',
                            }}>
                                {err.reason}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                {hasMore && !showAll && (
                    <Typography
                        variant="caption"
                        onClick={() => setShowAll(true)}
                        sx={{ color: 'text.secondary', fontSize: '0.7rem', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
                    >
                        Show all {errors.length} errors
                    </Typography>
                )}
                {(!hasMore || showAll) && <Box />}
                <Typography
                    variant="caption"
                    onClick={copyErrors}
                    sx={{ color: 'text.secondary', fontSize: '0.7rem', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
                >
                    Copy all
                </Typography>
            </Box>
        </Box>
    );
};

const ClearIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

const Input = ({ loaded, total, errors, unique, name, size, loadFromTxt, onFileDrop, overrideEventDefaults, pasteFromClipboard, clearInput, start, shuffle, toggleOption }) => {
    const [errorsExpanded, setErrorsExpanded] = useState(false);

    // Both inner panels share the same fixed height so the card doesn't
    // resize when switching between the drop zone and the stats view.
    // 170px matches the natural rendered height of the drop zone
    // (24px top pad + 70px icon + 8px gap + 20px text + 4px gap + 20px text + 24px bottom pad).
    const INNER_HEIGHT = 170;
    const innerSx = {
        border: `2px dashed ${alpha('#fff', 0.15)}`,
        borderRadius: 3,
        p: 3,
        height: INNER_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
    };

    return (
        <Box sx={{ mb: 3 }}>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 3 }}>

                {/* ── Header row ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    {loaded ? (
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                            {name}
                        </Typography>
                    ) : (
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                            Load from Txt
                            <InfoIcon title={"Supported formats (one proxy per line):\n• ip:port\n• user:pass@ip:port\n• ip:port:user:pass\n• protocol://ip:port\n• protocol://user:pass@ip:port\n\nDrag & drop or browse for .txt files."} />
                        </Typography>
                    )}

                    {loaded ? (
                        <Box
                            onClick={clearInput}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'text.secondary',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                transition: 'color 0.15s, background-color 0.15s',
                                '&:hover': { color: 'error.main', bgcolor: alpha('#f44', 0.08) },
                            }}
                        >
                            <ClearIcon />
                            Clear
                        </Box>
                    ) : (
                        <Typography
                            variant="body2"
                            sx={{
                                color: blueBrand[300],
                                cursor: 'pointer',
                                fontWeight: 500,
                                '&:hover': { textDecoration: 'underline' },
                            }}
                            onClick={pasteFromClipboard}
                        >
                            Paste From Clipboard
                        </Typography>
                    )}
                </Box>

                {/* ── Inner area: drop zone ↔ stats ── */}
                {loaded ? (
                    <Box sx={{ ...innerSx, border: `2px solid ${alpha('#fff', 0.08)}`, cursor: 'default', justifyContent: 'flex-start', overflowY: 'auto', height: 'auto', minHeight: INNER_HEIGHT }}>
                        <Stack spacing={1.25}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(total)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Unique</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(unique)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>File Names</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{name}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Size</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{splitByKK(size)} bytes</Typography>
                            </Box>
                            {errors.length > 0 && (
                                <Box>
                                    <Box
                                        onClick={() => setErrorsExpanded(!errorsExpanded)}
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            borderRadius: 1.5,
                                            mx: -1,
                                            px: 1,
                                            py: 0.5,
                                            transition: 'background-color 0.15s',
                                            '&:hover': { bgcolor: alpha(palette.error.main, 0.08) },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <ChevronIcon open={errorsExpanded} />
                                            <Typography variant="body2" sx={{ color: 'error.main' }}>Parse Errors</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>{errors.length}</Typography>
                                    </Box>
                                    <Collapse in={errorsExpanded}>
                                        <ParseErrorList errors={errors} />
                                    </Collapse>
                                </Box>
                            )}
                        </Stack>
                    </Box>
                ) : (
                    <Box
                        onClick={loadFromTxt}
                        onDragEnter={overrideEventDefaults}
                        onDragLeave={overrideEventDefaults}
                        onDragOver={overrideEventDefaults}
                        onDrop={onFileDrop}
                        sx={{
                            ...innerSx,
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'border-color 0.2s, background-color 0.2s',
                            '&:hover': {
                                borderColor: 'primary.main',
                                bgcolor: alpha(blueBrand[500], 0.05),
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
                            or <Box component="span" sx={{ textDecoration: 'underline', color: blueBrand[300] }}>Browse File</Box>
                        </Typography>
                    </Box>
                )}

                {/* ── Shuffle + Check ── */}
                {/* Always rendered to prevent a height shift; hidden when no list is loaded. */}
                <Box sx={{ mt: 1.5, visibility: loaded ? 'visible' : 'hidden' }}>
                    <Checkbox id='core-shuffle' name='shuffle' checked={shuffle} onChange={toggleOption} text='Shuffle' tip="Randomize the order of proxies before checking begins" />
                </Box>
                <Button
                    variant="contained"
                    fullWidth
                    onClick={start}
                    sx={{ mt: 1.5 }}
                >
                    Check
                </Button>
            </Box>

            {/* Always reserve space for the decorative SVG to prevent a page-level layout shift. */}
            <Box sx={{ textAlign: 'center', mt: 3, visibility: loaded ? 'hidden' : 'visible', '& svg': { width: 200, fill: alpha('#fff', 0.06) } }}>
                <svg viewBox='0 -17 512 512'>
                        <path d='m74.722656 297.265625h-51.734375c-12.675781 0-22.988281 10.3125-22.988281 22.992187v134.375c0 12.675782 10.3125 22.988282 22.988281 22.988282h51.734375c12.679688 0 22.992188-10.3125 22.992188-22.988282v-134.375c0-12.679687-10.3125-22.992187-22.992188-22.992187zm7.992188 157.367187c0 4.402344-3.585938 7.988282-7.992188 7.988282h-51.734375c-4.402343 0-7.988281-3.585938-7.988281-7.988282v-134.375c0-4.40625 3.585938-7.992187 7.988281-7.992187h51.734375c4.40625 0 7.992188 3.585937 7.992188 7.992187zm0 0' />
                        <path d='m212.820312 191.945312h-51.734374c-12.675782 0-22.988282 10.3125-22.988282 22.988282v42.644531c0 4.140625 3.355469 7.5 7.5 7.5 4.140625 0 7.5-3.359375 7.5-7.5v-42.644531c0-4.402344 3.582032-7.988282 7.988282-7.988282h51.734374c4.40625 0 7.988282 3.585938 7.988282 7.988282v239.699218c0 4.402344-3.582032 7.988282-7.988282 7.988282h-51.734374c-4.40625 0-7.988282-3.585938-7.988282-7.988282v-167.054687c0-4.140625-3.359375-7.5-7.5-7.5-4.144531 0-7.5 3.359375-7.5 7.5v167.054687c0 12.675782 10.3125 22.988282 22.988282 22.988282h51.734374c12.675782 0 22.988282-10.3125 22.988282-22.988282v-239.695312c0-12.679688-10.3125-22.992188-22.988282-22.992188zm0 0' />
                        <path d='m350.914062 255.140625h-51.734374c-12.675782 0-22.988282 10.3125-22.988282 22.988281v176.503906c0 12.675782 10.3125 22.988282 22.988282 22.988282h51.734374c12.679688 0 22.992188-10.3125 22.992188-22.988282v-176.503906c0-12.675781-10.3125-22.988281-22.992188-22.988281zm7.992188 199.492187c0 4.402344-3.585938 7.988282-7.992188 7.988282h-51.734374c-4.40625 0-7.988282-3.585938-7.988282-7.988282v-176.503906c0-4.40625 3.582032-7.988281 7.988282-7.988281h51.734374c4.40625 0 7.992188 3.582031 7.992188 7.988281zm0 0' />
                        <path d='m489.011719 139.285156h-51.734375c-12.675782 0-22.992188 10.3125-22.992188 22.988282v214.304687c0 4.140625 3.359375 7.5 7.5 7.5 4.144532 0 7.5-3.359375 7.5-7.5v-214.304687c0-4.40625 3.585938-7.988282 7.992188-7.988282h51.734375c4.402343 0 7.988281 3.582032 7.988281 7.988282v292.359374c0 4.402344-3.585938 7.988282-7.988281 7.988282h-51.734375c-4.40625 0-7.992188-3.585938-7.992188-7.988282v-48.054687c0-4.140625-3.355468-7.5-7.5-7.5-4.140625 0-7.5 3.359375-7.5 7.5v48.054687c0 12.675782 10.316406 22.988282 22.992188 22.988282h51.734375c12.675781 0 22.988281-10.3125 22.988281-22.988282v-292.359374c0-12.675782-10.3125-22.988282-22.988281-22.988282zm0 0' />
                    </svg>
                </Box>
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
    clearInput,
    start,
    toggleOption
};

export default connect(mapStateToProps, mapDispatchToProps)(Input);
