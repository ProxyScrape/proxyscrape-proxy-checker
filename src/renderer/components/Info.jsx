import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { openLink, psUrl } from '../misc/other';
import WhiteLogo from '../../../public/icons/Logo-ProxyScrape-white.png';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FOOTER_BACKGROUND, CARD_BACKGROUND, blueBrand } from '../theme/palette';
import { openIntercom } from '../misc/intercom';
import SideDrawer from './ui/SideDrawer';

const FacebookIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);

const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const LinkedInIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);

const RedditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
);

const TelegramIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

const socialLinkSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    color: 'text.secondary',
    textDecoration: 'none',
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'color 0.2s',
    '&:hover': { color: 'text.primary' },
    '& svg': { flexShrink: 0 },
};

const linkSx = {
    color: blueBrand[300],
    textDecoration: 'none',
    fontSize: '0.85rem',
    transition: 'opacity 0.2s',
    '&:hover': { textDecoration: 'underline', opacity: 0.85 },
};

const sectionLabelSx = {
    fontWeight: 600,
    color: 'text.secondary',
    textTransform: 'uppercase',
    letterSpacing: 1,
    display: 'block',
    mb: 1,
};

const Info = memo(({ show, releases, toggleInfo }) => {
    const releaseList = releases || [];

    const shareUrl = encodeURIComponent(psUrl('/proxy-checker', 'social-share'));

    const followLinks = [
        { href: 'https://www.facebook.com/ProxyScrape-2293011407635184/', label: 'Facebook', icon: <FacebookIcon /> },
        { href: 'https://x.com/proxyscrape_off', label: 'X (Twitter)', icon: <XIcon /> },
        { href: 'https://www.linkedin.com/company/proxyscrape/', label: 'LinkedIn', icon: <LinkedInIcon /> },
    ];

    const shareLinks = [
        { href: 'https://facebook.com/sharer/sharer.php?u=' + shareUrl, label: 'Facebook', icon: <FacebookIcon /> },
        { href: 'https://x.com/intent/tweet/?url=' + shareUrl, label: 'X (Twitter)', icon: <XIcon /> },
        { href: 'https://reddit.com/submit/?url=' + shareUrl + '&title=ProxyScrape%20Proxy%20Checker', label: 'Reddit', icon: <RedditIcon /> },
        { href: 'https://telegram.me/share/url?text=ProxyScrape%20Proxy%20Checker&url=' + shareUrl, label: 'Telegram', icon: <TelegramIcon /> },
    ];

    return (
        <SideDrawer
            open={show}
            onClose={toggleInfo}
            width={440}
            zIndex={1200}
            panelSx={{ maxWidth: { xs: '100vw', sm: '85vw' } }}
            headerLeft={
                <Box component="a" href={psUrl('/', 'branding')} onClick={openLink} sx={{ lineHeight: 0 }}>
                    <img src={WhiteLogo} width="150" height="19"/>
                </Box>
            }
        >
            <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
                <Box sx={{
                    bgcolor: CARD_BACKGROUND,
                    borderRadius: 2,
                    p: 2,
                    mb: 2.5,
                    border: `1px solid ${FOOTER_BACKGROUND}`,
                }}>
                    <Typography variant="body2" sx={{ color: 'text.primary', mb: 1, lineHeight: 1.6 }}>
                        Need help? Contact us via our{' '}
                        <Box component="a" href="#" onClick={(e) => { e.preventDefault(); toggleInfo(); openIntercom(); }} sx={linkSx}>
                            24/7 live chat
                        </Box>
                        {' '}or via{' '}
                        <Box component="a" href={psUrl('/contact', 'support')} onClick={openLink} sx={linkSx}>
                            email
                        </Box>
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary', mb: 1, lineHeight: 1.6 }}>
                        We are happy to help you with all your proxy needs!
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.6 }}>
                        Looking for datacenter proxies with 99% uptime?{' '}
                        <Box component="a" href={psUrl('/premium', 'premium-upsell')} onClick={openLink}
                            sx={{ ...linkSx, fontWeight: 600 }}>
                            Try ProxyScrape Premium
                        </Box>
                    </Typography>
                </Box>

                <Box sx={{ mb: 2.5 }}>
                    <Typography variant="caption" sx={sectionLabelSx}>
                        Follow Us
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
                        {followLinks.map(link => (
                            <Box key={link.label} component="a" href={link.href} onClick={openLink} sx={socialLinkSx}>
                                {link.icon}
                                <span>{link.label}</span>
                            </Box>
                        ))}
                    </Box>
                </Box>

                <Box sx={{ mb: 2.5 }}>
                    <Typography variant="caption" sx={sectionLabelSx}>
                        Share the Checker
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
                        {shareLinks.map(link => (
                            <Box key={link.label} component="a" href={link.href} onClick={openLink} sx={socialLinkSx}>
                                {link.icon}
                                <span>{link.label}</span>
                            </Box>
                        ))}
                    </Box>
                </Box>

                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 1.5, mt: 1 }}>
                    Releases
                </Typography>
                <Box>
                    {releaseList.length === 0 && (
                        <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>
                            No releases found.
                        </Typography>
                    )}
                    {releaseList.map(release => (
                        <Box key={release.tagName} sx={{
                            mb: 2,
                            pb: 2,
                            borderBottom: `1px solid ${FOOTER_BACKGROUND}`,
                            '&:last-child': { borderBottom: 'none', mb: 0, pb: 0 },
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: blueBrand[300] }}>
                                    {release.tagName}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                    {new Date(release.publishedAt).toLocaleDateString()}
                                </Typography>
                            </Box>
                            <Box sx={{
                                '& p': { m: 0, mb: 0.5, fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.6 },
                                '& ul': { pl: 2.5, m: 0, mb: 0.5 },
                                '& li': { fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.7 },
                                '& h1, & h2, & h3': { fontSize: '0.85rem', fontWeight: 600, color: 'text.primary', mt: 1, mb: 0.5 },
                                '& a': { color: blueBrand[300], textDecoration: 'none' },
                                '& code': {
                                    bgcolor: FOOTER_BACKGROUND,
                                    px: 0.5,
                                    py: 0.25,
                                    borderRadius: 0.5,
                                    fontSize: '0.75rem',
                                    fontFamily: '"Roboto Mono", monospace',
                                    color: 'text.primary',
                                },
                            }}>
                                {release.body
                                    ? <ReactMarkdown>{release.body}</ReactMarkdown>
                                    : <Typography variant="body2" component="a" href={release.htmlUrl} onClick={openLink} sx={{ fontSize: '0.8rem', color: blueBrand[300] }}>View on GitHub</Typography>
                                }
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </SideDrawer>
    );
});

export default Info;
