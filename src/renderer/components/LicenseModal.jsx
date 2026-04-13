import React, { memo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';

const LicenseModal = memo(({ show, toggleModal }) => {
    const year = new Date().getFullYear();
    const copyright = year > 2026
        ? `Copyright (c) 2026-present ProxyScrape (https://proxyscrape.com)`
        : `Copyright (c) ${year} ProxyScrape (https://proxyscrape.com)`;

    return (
        <Dialog
            open={!!show}
            onClose={toggleModal}
            maxWidth="sm"
            fullWidth
            slotProps={{ paper: { sx: { borderRadius: 4 } } }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                <Typography variant="h6" component="span" sx={{ fontWeight: 600, fontSize: '1rem' }}>MIT License with Commons Clause</Typography>
                <IconButton onClick={toggleModal} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                    <svg viewBox="0 0 224.512 224.512" style={{ width: 14, height: 14, fill: 'currentColor' }}>
                        <polygon points="224.507,6.997 217.521,0 112.256,105.258 6.998,0 0.005,6.997 105.263,112.254 0.005,217.512 6.998,224.512 112.256,119.24 217.521,224.512 224.507,217.512 119.249,112.254" />
                    </svg>
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    MIT License with a Commons Clause restriction. Free to use, modify, and
                    distribute for any non-commercial purpose. Selling the software or offering
                    it as a paid service is not permitted.
                </Typography>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', mb: 0.5 }}>Permissions</Typography>
                    {['Personal & Commercial Use', 'Modification', 'Distribution', 'Private Use'].map(p => (
                        <Typography key={p} variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                            ✓ {p}
                        </Typography>
                    ))}
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main', mb: 0.5 }}>Limitations</Typography>
                    {['Selling the Software', 'Offering as a paid service', 'Liability', 'Warranty'].map(l => (
                        <Typography key={l} variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                            ✗ {l}
                        </Typography>
                    ))}
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>Conditions</Typography>
                    {['Include license and copyright notice', 'Commons Clause restriction applies'].map(c => (
                        <Typography key={c} variant="body2" sx={{ color: 'text.secondary', pl: 1, fontSize: '0.85rem' }}>
                            + {c}
                        </Typography>
                    ))}
                </Box>

                <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${alpha('#fff', 0.08)}` }}>
                    {[
                        { label: 'MIT License with Commons Clause', text: copyright },
                        {
                            label: 'MIT License',
                            text: 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
                        },
                        {
                            label: 'Disclaimer',
                            text: 'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.',
                        },
                    ].map(({ label, text }) => (
                        <Box key={label} sx={{ mb: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.25 }}>
                                {label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6, display: 'block', fontWeight: 400 }}>
                                {text}
                            </Typography>
                        </Box>
                    ))}

                    <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.5 }}>
                            Commons Clause
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6, display: 'block', mb: 0.75 }}>
                            The right to Sell the Software is not granted. &quot;Sell&quot; means either of:
                        </Typography>
                        {[
                            'Distributing or licensing the Software itself to third parties for a fee.',
                            'Using the Software as a backend component of a commercially offered product or service — including SaaS — where its functionality directly powers or constitutes a material part of the value delivered to paying customers.',
                        ].map((item, i) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5, pl: 0.5 }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6, flexShrink: 0 }}>
                                    ({String.fromCharCode(97 + i)})
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6 }}>
                                    {item}
                                </Typography>
                            </Box>
                        ))}
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', lineHeight: 1.6, display: 'block', mt: 0.75 }}>
                            Internal use as a support or operations tool — e.g. verifying a proxy pool quality — is permitted.
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>
        </Dialog>
    );
});

export default LicenseModal;
