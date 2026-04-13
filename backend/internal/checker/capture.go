package checker

import (
	"fmt"
	"net"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

// openHandleOnIface opens a BPF-filtered pcap handle on a single named interface.
// A 10ms read timeout is used instead of pcap.BlockForever so that drain
// goroutines can exit promptly when Close() is called (gopacket issues #862, #1089).
func openHandleOnIface(iface, filter string) (*pcap.Handle, error) {
	h, err := pcap.OpenLive(iface, 65535, false, 10*time.Millisecond)
	if err != nil {
		return nil, err
	}
	if err := h.SetBPFFilter(filter); err != nil {
		h.Close()
		return nil, fmt.Errorf("set BPF filter on %s: %w", iface, err)
	}
	return h, nil
}

// openCaptureHandles opens BPF-filtered pcap handles for targetIP:port.
//
// It always opens a handle on the outgoing network interface detected by a UDP
// probe. On macOS it additionally opens handles on every utun* and ipsec*
// virtual interface, because macOS Network Extensions (NECP / VPNs) can
// silently redirect TCP connections through those virtual interfaces while the
// UDP probe still leaves via the physical interface. Without the extra handles,
// traffic routed through utun* would never appear in the capture.
//
// The caller must call closeAllHandles on the returned slice when done.
func openCaptureHandles(targetIP string, port int) ([]*pcap.Handle, error) {
	// Use both IPv4 and IPv6 host matchers so proxies reachable over IPv6 are
	// captured correctly. The plain "host X" filter only matches IPv4.
	filter := fmt.Sprintf("(host %s or ip6 host %s) and tcp port %d", targetIP, targetIP, port)

	iface, err := outgoingInterface(targetIP)
	if err != nil {
		return nil, fmt.Errorf("detect interface: %w", err)
	}

	var handles []*pcap.Handle

	if h, err := openHandleOnIface(iface, filter); err == nil {
		handles = append(handles, h)
	}

	// macOS: NECP / VPN extensions route TCP through utun*/ipsec* virtual
	// interfaces even when UDP probes still leave via the physical interface.
	// Open extra handles on those virtual interfaces so we catch all traffic.
	if runtime.GOOS == "darwin" {
		devs, _ := pcap.FindAllDevs()
		for _, dev := range devs {
			if dev.Name == iface {
				continue
			}
			if strings.HasPrefix(dev.Name, "utun") || strings.HasPrefix(dev.Name, "ipsec") {
				if h, err := openHandleOnIface(dev.Name, filter); err == nil {
					handles = append(handles, h)
				}
			}
		}
	}

	if len(handles) == 0 {
		return nil, fmt.Errorf("could not open any pcap handle for %s:%d", targetIP, port)
	}
	return handles, nil
}

// closeAllHandles closes every handle in the slice.
func closeAllHandles(handles []*pcap.Handle) {
	for _, h := range handles {
		h.Close()
	}
}

// outgoingInterface returns the name of the network interface used to reach ip.
// It works by dialing a UDP "connection" (no traffic sent) and letting the OS
// pick the source IP, then matching that IP to a local interface.
func outgoingInterface(ip string) (string, error) {
	conn, err := net.Dial("udp", net.JoinHostPort(ip, "80"))
	if err != nil {
		return "", fmt.Errorf("udp probe: %w", err)
	}
	localIP := conn.LocalAddr().(*net.UDPAddr).IP
	conn.Close()

	ifaces, err := net.Interfaces()
	if err != nil {
		return "", fmt.Errorf("list interfaces: %w", err)
	}
	for _, iface := range ifaces {
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			var ifIP net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ifIP = v.IP
			case *net.IPAddr:
				ifIP = v.IP
			}
			if ifIP != nil && ifIP.Equal(localIP) {
				return iface.Name, nil
			}
		}
	}
	return "", fmt.Errorf("no interface found for local IP %s", localIP)
}

// capturedPacket is a raw TCP packet event that carries its local and remote
// port so it can be attributed to a specific protocol connection later.
type capturedPacket struct {
	TraceEvent
	srcPort uint16
	dstPort uint16
}

// drainPackets reads packets from a single handle until it is closed, converting
// raw TCP packets into capturedPackets relative to start. proxyPort is used to
// distinguish inbound (data_in) from outbound (data_out) data segments.
func drainPackets(handle *pcap.Handle, start time.Time, proxyPort uint16) []capturedPacket {
	var packets []capturedPacket
	seenSeqs := make(map[uint32]bool)

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	source.NoCopy = true

	for packet := range source.Packets() {
		tcpLayer := packet.Layer(layers.LayerTypeTCP)
		if tcpLayer == nil {
			continue
		}
		tcp, _ := tcpLayer.(*layers.TCP)
		offsetMs := packet.Metadata().Timestamp.Sub(start).Milliseconds()
		fromProxy := uint16(tcp.SrcPort) == proxyPort

		var evt TraceEvent
		switch {
		case tcp.RST:
			detail := "connection refused"
			if fromProxy {
				detail = "reset by proxy"
			}
			evt = TraceEvent{Kind: "rst", OffsetMs: offsetMs, Detail: detail}

		case tcp.SYN && tcp.ACK:
			evt = TraceEvent{Kind: "syn_ack", OffsetMs: offsetMs}

		case tcp.SYN && !tcp.ACK:
			evt = TraceEvent{Kind: "syn", OffsetMs: offsetMs}

		case tcp.FIN:
			kind := "fin"
			if fromProxy {
				kind = "fin_ack"
			}
			evt = TraceEvent{Kind: kind, OffsetMs: offsetMs}

		case len(tcp.Payload) > 0:
			if seenSeqs[tcp.Seq] {
				evt = TraceEvent{
					Kind:     "retransmit",
					OffsetMs: offsetMs,
					Detail:   fmt.Sprintf("seq %d", tcp.Seq),
				}
			} else {
				seenSeqs[tcp.Seq] = true
				kind := "data_out"
				if fromProxy {
					kind = "data_in"
				}
				evt = TraceEvent{
					Kind:     kind,
					OffsetMs: offsetMs,
					Bytes:    len(tcp.Payload),
				}
			}
		default:
			continue
		}

		packets = append(packets, capturedPacket{
			TraceEvent: evt,
			srcPort:    uint16(tcp.SrcPort),
			dstPort:    uint16(tcp.DstPort),
		})
	}

	return packets
}

// packetKey uniquely identifies a captured packet for deduplication when the
// same physical packet is seen on multiple interfaces simultaneously.
type packetKey struct {
	offsetMs int64
	srcPort  uint16
	dstPort  uint16
	kind     string
}

// drainAllHandles drains packets from all handles concurrently until each is
// closed, then merges and deduplicates the results. Duplicates arise when the
// same packet is visible on more than one interface (e.g. both en0 and a utun
// bridge). The deduplication key is (offsetMs, srcPort, dstPort, kind), which
// is sufficient because the BPF filter scopes all handles to the same proxy
// IP:port and the same physical packet always produces the same timestamp.
func drainAllHandles(handles []*pcap.Handle, start time.Time, proxyPort uint16) []capturedPacket {
	results := make([][]capturedPacket, len(handles))

	var wg sync.WaitGroup
	for i, h := range handles {
		wg.Add(1)
		go func(idx int, handle *pcap.Handle) {
			defer wg.Done()
			results[idx] = drainPackets(handle, start, proxyPort)
		}(i, h)
	}
	wg.Wait()

	seen := make(map[packetKey]bool)
	var merged []capturedPacket
	for _, pkts := range results {
		for _, p := range pkts {
			key := packetKey{p.OffsetMs, p.srcPort, p.dstPort, p.Kind}
			if !seen[key] {
				seen[key] = true
				merged = append(merged, p)
			}
		}
	}

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].OffsetMs < merged[j].OffsetMs
	})
	return merged
}

// filterPacketsByPorts returns the TraceEvents from packets whose source or
// destination port matches one of localPorts. When localPorts is empty (no
// successful TCP connection was recorded for this protocol), all packets are
// returned so that failed-connection events (SYN, RST) are still visible.
func filterPacketsByPorts(packets []capturedPacket, localPorts []uint16) []TraceEvent {
	if len(localPorts) == 0 {
		out := make([]TraceEvent, len(packets))
		for i, p := range packets {
			out[i] = p.TraceEvent
		}
		return out
	}

	portSet := make(map[uint16]bool, len(localPorts))
	for _, p := range localPorts {
		portSet[p] = true
	}

	var out []TraceEvent
	for _, pkt := range packets {
		if portSet[pkt.srcPort] || portSet[pkt.dstPort] {
			out = append(out, pkt.TraceEvent)
		}
	}
	return out
}
