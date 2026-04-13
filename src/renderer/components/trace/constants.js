export const KIND_META = {
    syn:                { label: 'SYN',             color: '#4888C7', group: 'tcp'   },
    syn_ack:            { label: 'SYN-ACK',         color: '#6DA0D2', group: 'tcp'   },
    fin:                { label: 'FIN',             color: '#6DA0D2', group: 'tcp'   },
    fin_ack:            { label: 'FIN-ACK',         color: '#6DA0D2', group: 'tcp'   },
    rst:                { label: 'RST',             color: '#e74856', group: 'error' },
    retransmit:         { label: 'Retransmit',      color: '#e74856', group: 'error' },
    tcp_failed:         { label: 'TCP Failed',      color: '#e74856', group: 'error' },
    tls_failed:         { label: 'TLS Failed',      color: '#e74856', group: 'error' },
    tunnel_failed:      { label: 'Tunnel Failed',   color: '#e74856', group: 'error' },
    tunnel_rejected:    { label: 'Tunnel Rejected', color: '#e74856', group: 'error' },
    request_failed:     { label: 'Request Failed',  color: '#e74856', group: 'error' },
    data_out:           { label: 'Data Out',        color: '#00B70B', group: 'data'  },
    data_in:            { label: 'Data In',         color: '#A1D0FF', group: 'data'  },
    dial_start:         { label: 'Dial Start',      color: '#9CA3AF', group: 'app'   },
    tcp_connected:      { label: 'TCP Connected',   color: '#00B70B', group: 'app'   },
    tls_start:          { label: 'TLS Start',       color: '#9CA3AF', group: 'app'   },
    tls_done:           { label: 'TLS Done',        color: '#00B70B', group: 'app'   },
    tunnel_established: { label: 'Tunnel OK',       color: '#00B70B', group: 'app'   },
    request_sent:       { label: 'Request Sent',    color: '#9CA3AF', group: 'app'   },
    response_start:     { label: 'Response Start',  color: '#9CA3AF', group: 'app'   },
    done:               { label: 'Done',            color: '#00B70B', group: 'app'   },
    attempt_start:      { label: 'Retry',           color: '#f0a040', group: 'retry' },
};

export const TCP_GROUPS = new Set(['tcp', 'data', 'error']);

export const getKindMeta = kind => KIND_META[kind] || { label: kind, color: '#9CA3AF', group: 'app' };
