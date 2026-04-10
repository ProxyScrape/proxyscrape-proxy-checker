import React, { memo } from 'react';
import ResultCountriesItem from './ResultCountriesItem';
import CloseIcon from './ui/CloseIcon';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import { alpha } from '@mui/material/styles';

const ResultCountries = memo(({ items, active, toggle, toggleCountries, activeCount }) => (
    <Slide direction="left" in={!!active} mountOnEnter unmountOnExit>
    <Box sx={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        bgcolor: 'background.paper',
        zIndex: 1100,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
    }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: `1px solid ${alpha('#fff', 0.08)}` }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Selected <Box component="span" sx={{ color: activeCount > 0 ? 'primary.main' : 'text.secondary' }}>{activeCount}</Box> of {items.length}
            </Typography>
            <IconButton onClick={toggleCountries} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
                <CloseIcon />
            </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {items.map(item => (
                <ResultCountriesItem {...item} toggle={toggle} key={item.name} />
            ))}
        </Box>
        <Box sx={{ p: 1.5, textAlign: 'center', borderTop: `1px solid ${alpha('#fff', 0.08)}` }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 400 }}>
                <strong>Double click</strong> select or deselect all
            </Typography>
        </Box>
    </Box>
    </Slide>
));

export default ResultCountries;
