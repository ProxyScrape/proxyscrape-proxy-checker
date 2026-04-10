import React, { memo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

const LicenseModal = memo(({ show, toggleModal }) => {
    return (
        <Dialog
            open={!!show}
            onClose={toggleModal}
            maxWidth="sm"
            fullWidth
            PaperProps={{ sx: { borderRadius: 4 } }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>MIT License</Typography>
                <IconButton onClick={toggleModal} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                    <svg viewBox="0 0 224.512 224.512" style={{ width: 14, height: 14, fill: 'currentColor' }}>
                        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
                    </svg>
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    A short and simple permissive license with conditions only requiring preservation of copyright and license notices.
                </Typography>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', mb: 0.5 }}>Permissions</Typography>
                    {['Commercial Use', 'Modification', 'Distribution', 'Private Use'].map(p => (
                        <Typography key={p} variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                            ✓ {p}
                        </Typography>
                    ))}
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main', mb: 0.5 }}>Limitations</Typography>
                    {['Liability', 'Warranty'].map(l => (
                        <Typography key={l} variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                            ✗ {l}
                        </Typography>
                    ))}
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>Conditions</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                        + License and copyright notice
                    </Typography>
                </Box>

                <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${alpha('#fff', 0.08)}` }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6, display: 'block', fontWeight: 400 }}>
                        MIT License — Copyright (c) 2018 assnctr — Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
});

export default LicenseModal;
