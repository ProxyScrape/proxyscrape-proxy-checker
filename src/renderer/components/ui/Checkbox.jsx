import React from 'react';
import MuiCheckbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { HelpTip } from './HelpTip';

const dottedSx = {
    borderBottom: '1px dotted',
    borderColor: 'inherit',
    cursor: 'help',
};

const Checkbox = ({ id, name, checked, onChange, text, tip }) => (
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
            tip ? (
                <HelpTip title={tip}>
                    <Typography variant="body2" sx={{ fontWeight: 600, ...dottedSx }}>{text}</Typography>
                </HelpTip>
            ) : (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{text}</Typography>
            )
        }
        sx={{ mr: 2 }}
    />
);

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
