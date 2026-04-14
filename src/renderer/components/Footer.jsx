import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import { version as currentVersion } from '../../../package.json';
import { openLink, psUrl } from '../misc/other';
import GitIcon from '../components/ui/GitIcon';
import DocIcon from '../components/ui/DocIcon';
import LicenseIcon from '../components/ui/LicenseIcon';
import SupportIcon from '../components/ui/SupportIcon';
import WhiteLogo from "../../../public/icons/Logo-ProxyScrape-white.png";
import { FOOTER_BACKGROUND, blueBrand } from '../theme/palette';
import { openIntercom } from '../misc/intercom';
import CanaryBanner from './CanaryBanner';
import { IS_CANARY } from '@shared/AppConstants';

const footerLinkSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    color: 'text.secondary',
    textDecoration: 'none',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'color 0.2s',
    '&:hover': { color: 'text.primary' },
    '& svg': { width: 14, height: 14, fill: 'currentColor' },
};

const Footer = ({ toggleModal, closeDrawer }) => (
    <Box
        component="footer"
        sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            bgcolor: FOOTER_BACKGROUND,
            borderRadius: '24px 24px 0 0',
            zIndex: 100,
        }}
    >
        <Stack
            direction="row"
            spacing={3}
            sx={{ py: 1, alignItems: 'center', justifyContent: 'center' }}
        >
            <Box component="a" href="https://github.com/ProxyScrape/proxy-checker" title="Github Page" onClick={openLink} sx={footerLinkSx}>
                <GitIcon />
                <span>Github</span>
            </Box>
            <Box component="a" href={psUrl('/proxy-checker', 'documentation')} title="Official Documentation" onClick={openLink} sx={footerLinkSx}>
                <DocIcon />
                <span>Documentation</span>
            </Box>
            <Box component="a" href="#" title="License" onClick={toggleModal} sx={footerLinkSx}>
                <LicenseIcon />
                <span>License</span>
            </Box>
            <Box component="a" href="#" title="Live Support" onClick={(e) => { e.preventDefault(); if (closeDrawer) closeDrawer(); openIntercom(); }} sx={footerLinkSx}>
                <SupportIcon />
                <span>Support</span>
            </Box>
        </Stack>
        <Box sx={{
            textAlign: 'center',
            py: 0.5,
            fontSize: '0.75rem',
            color: 'text.secondary',
        }}>
            <Typography variant="body2" component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                We have 40 000 premium datacenter proxies.{' '}
            </Typography>
            <Box
                component="a"
                href={psUrl('/premium', 'premium-upsell')}
                onClick={openLink}
                sx={{
                    color: blueBrand[300],
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    transition: 'opacity 0.2s',
                    '&:hover': { textDecoration: 'underline', opacity: 0.85 },
                }}
            >
                Get it all
            </Box>
        </Box>
        {IS_CANARY && <CanaryBanner />}
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 1.25,
                borderTop: `1px solid ${alpha('#fff', 0.08)}`,
                '&::after': {
                    content: `"v${currentVersion}"`,
                    position: 'absolute',
                    right: 12,
                    fontSize: '0.65rem',
                    color: alpha('#fff', 0.25),
                },
                position: 'relative',
            }}
        >
            <Box
                component="a"
                href={psUrl('/', 'branding')}
                title="Official Website"
                onClick={openLink}
                sx={{ cursor: 'pointer', lineHeight: 0, transition: 'opacity 0.2s', '&:hover': { opacity: 0.8 } }}
            >
                <img src={WhiteLogo} width="120" height="15.25"/>
            </Box>
        </Box>
    </Box>
);

export default Footer;
