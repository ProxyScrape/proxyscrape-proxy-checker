import React from 'react';

export const ArrowRightIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'currentColor' }}>
        <path d="M5 13h11.17l-4.88 4.88c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l6.59-6.59a.996.996 0 000-1.42L12.7 4.7a.996.996 0 00-1.41 0 .996.996 0 000 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z" />
    </svg>
);

export const ArrowLeftIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'currentColor' }}>
        <path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42a.996.996 0 00-1.41 0l-6.59 6.59a.996.996 0 000 1.42l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.03 0-1.42L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" />
    </svg>
);

export const NetworkIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'currentColor' }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
);

export const DotIcon = () => (
    <svg viewBox="0 0 24 24" style={{ width: 7, height: 7, fill: 'currentColor' }}>
        <circle cx="12" cy="12" r="6" />
    </svg>
);

export const KindIcon = ({ group, kind }) => {
    if (group === 'data') return kind === 'data_out' ? <ArrowRightIcon /> : <ArrowLeftIcon />;
    if (group === 'tcp') return <NetworkIcon />;
    return <DotIcon />;
};
