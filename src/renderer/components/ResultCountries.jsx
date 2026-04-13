import React, { memo } from 'react';
import ResultCountriesItem from './ResultCountriesItem';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { blueBrand } from '../theme/palette';
import SideDrawer from './ui/SideDrawer';

const ResultCountries = memo(({ items, active, toggle, toggleCountries, activeCount }) => {
    const allSelected = activeCount === items.length;
    const noneSelected = activeCount === 0;

    const handleSelectAll = () => {
        if (!allSelected) toggle(null, true, true);
    };

    const handleDeselectAll = () => {
        if (!noneSelected) toggle(null, true, false);
    };

    return (
        <SideDrawer
            open={active}
            onClose={toggleCountries}
            width={320}
            zIndex={1100}
            headerLeft={
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Countries
                </Typography>
            }
        >
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2, py: 1.5,
                borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
            }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                    <Box component="span" sx={{ color: activeCount > 0 ? blueBrand[400] : 'text.secondary', fontWeight: 600 }}>{activeCount}</Box> of {items.length} selected
                </Typography>
                <Box sx={{
                    display: 'flex',
                    border: `1px solid ${alpha('#fff', 0.1)}`,
                    borderRadius: 1.5,
                    overflow: 'hidden',
                }}>
                    <Typography
                        variant="caption"
                        onClick={handleSelectAll}
                        sx={{
                            cursor: allSelected ? 'default' : 'pointer',
                            px: 1.25, py: 0.5,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: allSelected ? 'text.disabled' : blueBrand[400],
                            transition: 'color 0.2s, background-color 0.2s',
                            '&:hover': allSelected ? {} : {
                                color: blueBrand[300],
                                bgcolor: alpha('#fff', 0.06),
                            },
                        }}
                    >
                        All
                    </Typography>
                    <Box sx={{ width: '1px', bgcolor: alpha('#fff', 0.1), flexShrink: 0 }} />
                    <Typography
                        variant="caption"
                        onClick={handleDeselectAll}
                        sx={{
                            cursor: noneSelected ? 'default' : 'pointer',
                            px: 1.25, py: 0.5,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: noneSelected ? 'text.disabled' : blueBrand[400],
                            transition: 'color 0.2s, background-color 0.2s',
                            '&:hover': noneSelected ? {} : {
                                color: blueBrand[300],
                                bgcolor: alpha('#fff', 0.06),
                            },
                        }}
                    >
                        None
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
                {items.map(item => (
                    <ResultCountriesItem {...item} toggle={toggle} key={item.name} />
                ))}
            </Box>
        </SideDrawer>
    );
});

export default ResultCountries;
