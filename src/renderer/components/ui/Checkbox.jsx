import React from 'react';
import MuiCheckbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import { HelpTip, tooltipSx } from './HelpTip';
import { blueBrand } from '../../theme/palette';
import { openPsLink } from '../../misc/links';

const dottedSx = {
    borderBottom: '1px dotted',
    borderColor: 'inherit',
    cursor: 'help',
};

const lockedDottedSx = {
    ...dottedSx,
    cursor: 'not-allowed',
};

const DESKTOP_URL = 'https://proxyscrape.com/proxy-checker';

/**
 * Checkbox with an optional guest-mode lock.
 *
 * Props:
 *   tip        — normal help tooltip shown in desktop/server mode (dotted underline)
 *   lockedTip  — when present, the checkbox is disabled and a single unified tooltip
 *                replaces `tip`, showing the feature description + download CTA.
 *                Pass an object: { feature: string, description: string }
 */
const Checkbox = ({ id, name, checked, onChange, text, tip, disabled, lockedTip }) => {
    const isLocked = Boolean(lockedTip);

    const control = (
        <FormControlLabel
            disabled={disabled || isLocked}
            control={
                <MuiCheckbox
                    id={id}
                    name={name}
                    checked={checked}
                    onChange={isLocked ? () => {} : onChange}
                    size="small"
                    disabled={disabled || isLocked}
                />
            }
            label={
                tip && !isLocked ? (
                    <HelpTip title={tip}>
                        <Typography variant="body2" sx={{ fontWeight: 600, ...dottedSx }}>{text}</Typography>
                    </HelpTip>
                ) : tip && isLocked ? (
                    <Typography variant="body2" sx={{ fontWeight: 600, ...lockedDottedSx }}>{text}</Typography>
                ) : (
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{text}</Typography>
                )
            }
            sx={{ mr: 2 }}
        />
    );

    if (!isLocked) return control;

    const tooltipTitle = (
        <Box sx={{ fontSize: 'inherit' }}>
            {tip && (
                <Box component="span" sx={{ display: 'block', opacity: 0.65, mb: 0.6 }}>
                    {tip}
                </Box>
            )}
            <Box component="span" sx={{ display: 'block', fontWeight: 700, mb: 0.3 }}>
                {lockedTip.feature} — desktop only
            </Box>
            <Box component="span" sx={{ display: 'block', opacity: 0.65, mb: 0.6 }}>
                {lockedTip.description}
            </Box>
            <Box
                component="a"
                href={DESKTOP_URL}
                onClick={openPsLink}
                sx={{ display: 'inline-block', color: blueBrand[300], cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
                Get the free desktop app ↗
            </Box>
        </Box>
    );

    return (
        <Tooltip
            title={tooltipTitle}
            arrow
            placement="top"
            slotProps={{ tooltip: { sx: { ...tooltipSx.tooltip, maxWidth: 300 } }, arrow: { sx: tooltipSx.arrow } }}
        >
            {/* span needed: disabled FormControlLabel has pointer-events:none */}
            <span style={{ cursor: 'not-allowed', display: 'inline-flex' }}>
                {control}
            </span>
        </Tooltip>
    );
};

export const CheckboxWithCount = ({ id, name, checked, onChange, text, count }) => (
    <FormControlLabel
        control={
            <MuiCheckbox
                id={id}
                name={name}
                checked={checked}
                onChange={onChange}
                size="small"
            />
        }
        label={
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {text}
                <Typography component="span" variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>
                    {count}
                </Typography>
            </Typography>
        }
        sx={{ mr: 2 }}
    />
);

export default Checkbox;
