import React from 'react';
import { getResultsInIpPort, getResultsInProtocolIpPort } from '../actions/ResultActions';
import CloseIcon from './ui/CloseIcon';
import { HelpTip, InfoIcon } from './ui/HelpTip';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import { alpha } from '@mui/material/styles';
import { PAGE_BACKGROUND } from '../theme/palette';

const ResultExport = ({ active, copy, items, type, authType, toggleExport, changeExportType, changeExportAuthType, save }) => {
    const hasItemsWithAuth = items.some(item => item.auth !== 'none');

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
            opacity: active ? 1 : 0,
            pointerEvents: active ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
        }}>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, p: 3, maxWidth: 600, width: '90%', position: 'relative' }}>
                <IconButton onClick={toggleExport} size="small" sx={{ position: 'absolute', top: 12, right: 12, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                    <CloseIcon />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1rem' }}>
                    Export
                    <InfoIcon title="Export the currently filtered proxy list. Only proxies matching your active filters (anon level, protocol, country, ports, timeout) will be included." />
                </Typography>

                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                    Protocol Type
                    <InfoIcon title="Choose how proxy addresses are formatted in the export output." />
                </Typography>
                <RadioGroup value={String(type)} onChange={changeExportType}>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Box sx={{ flex: 1, border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2, p: 1.5 }}>
                            <HelpTip title="Export as ip:port (e.g. 1.2.3.4:8080)">
                                <FormControlLabel
                                    value="1"
                                    control={<Radio size="small" />}
                                    label={<Typography variant="body2"><strong>Host</strong>:<strong>Port</strong></Typography>}
                                />
                            </HelpTip>
                            <Box
                                component="textarea"
                                readOnly
                                value={`Example:\r\n${getResultsInIpPort(items, authType)}.....`}
                                rows={4}
                                sx={{
                                    width: '100%',
                                    bgcolor: alpha('#fff', 0.04),
                                    color: 'text.primary',
                                    border: `1px solid ${alpha('#fff', 0.08)}`,
                                    borderRadius: 1,
                                    p: 1,
                                    fontFamily: '"Roboto Mono", monospace',
                                    fontSize: '0.75rem',
                                    resize: 'none',
                                    outline: 'none',
                                    mt: 1,
                                }}
                            />
                        </Box>
                        <Box sx={{ flex: 1, border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2, p: 1.5 }}>
                            <HelpTip title="Export with protocol prefix (e.g. http://1.2.3.4:8080)">
                                <FormControlLabel
                                    value="2"
                                    control={<Radio size="small" />}
                                    label={<Typography variant="body2"><strong>Protocol</strong>://<strong>Host</strong>:<strong>Port</strong></Typography>}
                                />
                            </HelpTip>
                            <Box
                                component="textarea"
                                readOnly
                                value={`Example:\r\n${getResultsInProtocolIpPort(items, authType)}.....`}
                                rows={4}
                                sx={{
                                    width: '100%',
                                    bgcolor: alpha('#fff', 0.04),
                                    color: 'text.primary',
                                    border: `1px solid ${alpha('#fff', 0.08)}`,
                                    borderRadius: 1,
                                    p: 1,
                                    fontFamily: '"Roboto Mono", monospace',
                                    fontSize: '0.75rem',
                                    resize: 'none',
                                    outline: 'none',
                                    mt: 1,
                                }}
                            />
                        </Box>
                    </Box>
                </RadioGroup>

                {hasItemsWithAuth && (
                    <>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                            Auth Type
                            <InfoIcon title="Choose where authentication credentials appear in the exported proxy format." />
                        </Typography>
                        <RadioGroup value={String(authType)} onChange={changeExportAuthType}>
                            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                <Box sx={{ flex: 1, border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2, p: 1.5 }}>
                                    <HelpTip title="Credentials before address (e.g. user:pass@1.2.3.4:8080)">
                                        <FormControlLabel
                                            value="1"
                                            control={<Radio size="small" />}
                                            label={<Typography variant="body2"><strong>User:Pass</strong>@<strong>Host:Port</strong></Typography>}
                                        />
                                    </HelpTip>
                                </Box>
                                <Box sx={{ flex: 1, border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2, p: 1.5 }}>
                                    <HelpTip title="Credentials after address (e.g. 1.2.3.4:8080:user:pass)">
                                        <FormControlLabel
                                            value="2"
                                            control={<Radio size="small" />}
                                            label={<Typography variant="body2"><strong>Host:Port</strong>:<strong>User:Pass</strong></Typography>}
                                        />
                                    </HelpTip>
                                </Box>
                            </Box>
                        </RadioGroup>
                    </>
                )}

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <HelpTip title="Save the filtered proxy list to a .txt file on disk">
                        <Button variant="contained" onClick={save}>Save as .txt</Button>
                    </HelpTip>
                    <HelpTip title="Copy the filtered proxy list to your clipboard">
                        <Button variant="outlined" onClick={copy}>Copy To Clipboard</Button>
                    </HelpTip>
                </Box>
            </Box>
        </Box>
    );
};

export default ResultExport;
