import React from 'react';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';

/**
 * Standardized dialog action row used across all app dialogs.
 *
 * Layout:
 *   [cancel]                    [secondary]  [primary]
 *
 * Button hierarchy:
 *   cancel    — text, secondary colour  (dismiss, lowest priority)
 *   secondary — text, primary colour    (alternative action)
 *   primary   — contained              (recommended action)
 *
 * Props:
 *   cancel    { label, onClick } — optional; omit when the dialog has no explicit dismiss
 *   secondary { label, onClick } — optional
 *   primary   { label, onClick } — required
 */
const DialogActionRow = ({ cancel, secondary, primary }) => (
    <DialogActions sx={{
        px: 3,
        pb: 3,
        pt: 1.5,
        justifyContent: cancel ? 'space-between' : 'flex-end',
    }}>
        {cancel && (
            <Button
                variant="text"
                onClick={cancel.onClick}
                sx={{ color: 'text.secondary' }}
            >
                {cancel.label}
            </Button>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
            {secondary && (
                <Button variant="text" onClick={secondary.onClick}>
                    {secondary.label}
                </Button>
            )}
            <Button variant="contained" onClick={primary.onClick} autoFocus>
                {primary.label}
            </Button>
        </Box>
    </DialogActions>
);

export default DialogActionRow;
