import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import TimeIcon from './ui/TimeIcon';
import SortIcon from './ui/SortIcon';

const SortSVG = ({ reverse }) =>
    reverse ? (
        <svg style={{ width: 10, height: 10, fill: 'currentColor', marginLeft: 4 }} viewBox="0 0 612 612">
            <path d="M590.927,517.491H337.79c-11.645,0-21.095,9.45-21.095,21.116c0,11.665,9.45,21.115,21.095,21.115l253.137-0.611     c11.645,0,21.095-8.839,21.095-20.504C612.021,526.941,602.592,517.491,590.927,517.491z M295.601,52.88l295.326-0.042     c11.645,0,21.095-9.408,21.095-21.074s-9.45-21.116-21.095-21.116H295.601c-11.645,0-21.095,9.45-21.095,21.116     S283.956,52.88,295.601,52.88z M331.188,396.745c-8.27-8.312-21.686-8.312-29.955,0L190.127,524.6V10.648h-42.189v514.711     L36.156,396.745c-8.269-8.312-21.686-8.312-29.954,0c-8.27,8.312-8.27,21.77,0,30.06l146.439,168.526     c4.409,4.43,10.273,6.307,16.032,6.012c5.779,0.295,11.623-1.582,16.031-6.012l146.44-168.526     C339.457,418.515,339.457,405.057,331.188,396.745z M590.927,137.364H295.601c-11.645,0-21.095,9.451-21.095,21.116     c0,11.666,9.45,20.926,21.095,20.926h295.326c11.645,0,21.095-9.261,21.095-20.926     C612.021,146.815,602.592,137.364,590.927,137.364z M590.927,264.059H295.601c-11.645,0-21.095,9.451-21.095,21.116     c0,11.666,9.45,20.778,21.095,20.778l295.326,0.338c11.645,0,21.095-9.451,21.095-21.116     C612.021,273.531,602.592,264.059,590.927,264.059z M590.927,390.775H422.169c-11.645,0-21.095,9.45-21.095,21.115     c0,11.666,9.45,20.652,21.095,20.652h168.758c11.645,0,21.095-8.986,21.095-20.652     C612.021,400.226,602.592,390.775,590.927,390.775z" />
        </svg>
    ) : (
        <svg style={{ width: 10, height: 10, fill: 'currentColor', marginLeft: 4 }} viewBox="0 0 612 612">
            <path d="M590.905,559.173H295.58c-11.644,0-21.095,9.408-21.095,21.073c0,11.666,9.451,21.116,21.095,21.116h295.326     c11.645,0,21.095-9.45,21.095-21.116C612,568.581,602.57,559.173,590.905,559.173z M331.166,215.266     c8.27-8.312,8.27-21.77,0-30.061L184.727,16.68c-4.409-4.43-10.273-6.308-16.032-6.012c-5.78-0.296-11.623,1.582-16.032,6.012     L6.202,185.185c-8.269,8.312-8.269,21.77,0,30.06c8.27,8.29,21.686,8.312,29.955,0L147.938,86.63v514.712h42.189V87.41     l111.105,127.855C309.48,223.556,322.896,223.556,331.166,215.266z M337.769,95.089h253.137c11.645,0,21.095-10.02,21.095-21.686     c0-11.665-9.45-21.115-21.095-21.115H337.769c-11.645,0-21.095,9.45-21.095,21.115C316.674,85.069,326.124,95.089,337.769,95.089     z M590.905,432.415H295.58c-11.644,0-21.095,9.45-21.095,21.115c0,11.666,9.451,21.116,21.095,21.116h295.326     c11.645,0,21.095-9.45,21.095-21.116C612,441.865,602.57,432.415,590.905,432.415z M590.905,305.698H295.58     c-11.644,0-21.095,9.451-21.095,21.116c0,11.666,9.451,21.116,21.095,21.116h295.326c11.645,0,21.095-9.45,21.095-21.116     C612,315.149,602.57,305.698,590.905,305.698z M590.905,178.982l-168.758,0.464c-11.645,0-21.095,8.986-21.095,20.652     c0,11.665,9.45,21.537,21.095,21.537l168.758-0.422c11.645,0,21.095-9.45,21.095-21.115     C612,188.433,602.57,178.982,590.905,178.982z" />
        </svg>
    );

export default class ResultItemsHeader extends React.PureComponent {
    sortResults = this.props.sortResults;

    sortBy = {
        ip: () => this.sortResults('ip'),
        port: () => this.sortResults('port'),
        protocols: () => this.sortResults('protocols'),
        anon: () => this.sortResults('anon'),
        country: () => this.sortResults('country'),
        blacklist: () => this.sortResults('blacklist'),
        keepAlive: () => this.sortResults('keep-alive'),
        server: () => this.sortResults('server'),
        timeout: () => this.sortResults('timeout')
    };

    render = () => {
        const { inBlacklists, captureServer, keepAlive, sorting } = this.props;

        const headerSx = {
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
            fontWeight: 600,
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            '&:hover': { color: 'text.primary' },
        };

        return (
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                py: 1,
                px: 1,
                borderBottom: `1px solid ${alpha('#fff', 0.1)}`,
                mb: 0.5,
                '& svg': { width: 10, height: 10, fill: 'currentColor' },
            }}>
                <Box sx={{ width: 40, ...headerSx }}><SortIcon /></Box>
                <Box sx={{ flex: '2 0 0', ...headerSx }} onClick={this.sortBy.ip}>
                    <span>Host</span><SortSVG {...sorting} />
                </Box>
                <Box sx={{ flex: '1 0 0', ...headerSx }} onClick={this.sortBy.port}>
                    <span>Port</span><SortSVG {...sorting} />
                </Box>
                <Box sx={{ flex: '1.5 0 0', ...headerSx }} onClick={this.sortBy.protocols}>
                    <span>Protocols</span><SortSVG {...sorting} />
                </Box>
                <Box sx={{ flex: '1 0 0', ...headerSx }} onClick={this.sortBy.anon}>
                    <span>Anon</span><SortSVG {...sorting} />
                </Box>
                <Box sx={{ flex: '1.5 0 0', ...headerSx }} onClick={this.sortBy.country}>
                    <span>Country</span><SortSVG {...sorting} />
                </Box>
                <Box sx={{ width: 30 }} />
                {keepAlive && <Box sx={{ width: 30 }} />}
                {captureServer && (
                    <Box sx={{ flex: '1 0 0', ...headerSx }} onClick={this.sortBy.server}>
                        <span>Server</span><SortSVG {...sorting} />
                    </Box>
                )}
                <Box sx={{ width: 70, ...headerSx, justifyContent: 'flex-end' }} onClick={this.sortBy.timeout}>
                    <TimeIcon />
                </Box>
            </Box>
        );
    };
}
