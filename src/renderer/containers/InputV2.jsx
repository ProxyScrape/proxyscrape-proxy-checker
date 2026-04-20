import React, { useRef, useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import { applyParsedResult, clearInput } from '../actions/InputActions';
import { toggleOption } from '../actions/CoreActions';
import { showError } from '../store/reducers/app';
import { chooseMultiTxtFiles } from '../misc/filePicker';
import { splitByKK } from '../misc/text';
import { trackAction } from '../misc/analytics';
import { getGuestLimits } from '../misc/mode';
import { openPsLink } from '../misc/links';
import { psUrl } from '../misc/other';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon } from '../components/ui/HelpTip';
import DropDocIcon from '../components/ui/DropDocIcon';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Collapse from '@mui/material/Collapse';
import { alpha } from '@mui/material/styles';
import { blueBrand, palette } from '../theme/palette';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARSE_DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Helpers (inlined from InputActions — not exported there)
// ---------------------------------------------------------------------------

const pathBasename = (p) => (p ? p.replace(/^.*[\\/]/, '') : '');
const getFilePath  = (file) => window.__ELECTRON__?.getPathForFile(file) ?? '';

// ---------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------

const ChevronIcon = ({ open }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
        style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
);

const ClearIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

const BrowseIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
    </svg>
);

const ClipboardIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GuestProxyLimitWarning = ({ proxyCount, limit }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        px: 1.5,
        py: 1.25,
        bgcolor: 'rgba(255, 152, 0, 0.08)',
        border: '1px solid rgba(255, 152, 0, 0.3)',
        borderRadius: 2,
    }}>
        <Typography sx={{ fontSize: '1rem', lineHeight: 1, mt: '1px', flexShrink: 0 }}>⚠</Typography>
        <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main', fontSize: '0.8rem' }}>
                Too many proxies for guest mode
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, lineHeight: 1.5 }}>
                You've imported {proxyCount.toLocaleString()} proxies but guest mode supports up to {limit.toLocaleString()} per run.{' '}
                <Box
                    component="a"
                    href={psUrl('/proxy-checker', 'guest-limit-warning')}
                    onClick={openPsLink}
                    sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
                >
                    Download the desktop app
                </Box>
                {' '}for unlimited proxies.
            </Typography>
        </Box>
    </Box>
);

const ParseErrorList = ({ errors }) => {
    const [showAll, setShowAll] = useState(false);
    const displayed = showAll ? errors : errors.slice(0, 50);
    const hasMore   = errors.length > 50;

    const copyErrors = () => {
        navigator.clipboard.writeText(errors.map(e => e.line).join('\r\n'));
    };

    return (
        <Box sx={{ mt: 1 }}>
            <Box sx={{ maxHeight: 280, overflow: 'auto', borderRadius: 2, bgcolor: alpha('#000', 0.2) }}>
                {displayed.map((err, i) => (
                    <Box key={i} sx={{
                        display: 'flex',
                        gap: 1.5,
                        px: 1.5,
                        py: 0.75,
                        borderBottom: i < displayed.length - 1 ? `1px solid ${alpha('#fff', 0.04)}` : 'none',
                        '&:hover': { bgcolor: alpha('#fff', 0.02) },
                    }}>
                        <Typography variant="caption" sx={{
                            color: 'text.disabled', fontSize: '0.65rem', fontWeight: 500,
                            minWidth: 24, textAlign: 'right', pt: '1px', flexShrink: 0, userSelect: 'none',
                        }}>
                            {i + 1}
                        </Typography>
                        <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                            <Typography variant="caption" sx={{
                                fontFamily: '"Roboto Mono", monospace', fontSize: '0.7rem',
                                color: 'error.main', display: 'block',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {err.line}
                            </Typography>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', display: 'block' }}>
                                {err.reason}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                {hasMore && !showAll
                    ? <Typography variant="caption" onClick={() => setShowAll(true)}
                        sx={{ color: 'text.secondary', fontSize: '0.7rem', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}>
                        Show all {errors.length} errors
                      </Typography>
                    : <Box />}
                <Typography variant="caption" onClick={copyErrors}
                    sx={{ color: 'text.secondary', fontSize: '0.7rem', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}>
                    Copy all
                </Typography>
            </Box>
        </Box>
    );
};

// ---------------------------------------------------------------------------
// ActionButton — small header button used for Browse / Paste
// ---------------------------------------------------------------------------

const ActionButton = ({ onClick, icon, label }) => (
    <Box
        onClick={onClick}
        sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: blueBrand[300],
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            transition: 'color 0.15s, background-color 0.15s',
            userSelect: 'none',
            '&:hover': { color: '#fff', bgcolor: alpha(blueBrand[500], 0.12) },
        }}
    >
        {icon}
        <span>{label}</span>
    </Box>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const InputV2 = ({
    // Redux state
    loaded, list, errors, unique, proxyCount, shuffle,
    // Redux actions
    applyParsedResult, clearInput, showError, toggleOption,
}) => {
    const limits   = getGuestLimits();
    const overLimit = limits !== null && proxyCount > limits.inFlightProxies;

    // ── Refs ──────────────────────────────────────────────────────────────
    const textareaRef    = useRef(null);
    const workerRef      = useRef(null);
    const requestIdRef   = useRef(0);
    const parseTimerRef  = useRef(null);
    const sourceMetaRef  = useRef({ name: 'Manual Input', sourceType: 'textarea' });
    // Stable ref to the message handler so we can update it without
    // re-creating the worker when Redux props change.
    const handlerRef     = useRef(null);

    // ── Local state ───────────────────────────────────────────────────────
    const [lineCount,      setLineCount]      = useState(0);
    const [isDragOver,     setIsDragOver]     = useState(false);
    const [isParsing,      setIsParsing]      = useState(false);
    const [errorsExpanded, setErrorsExpanded] = useState(false);
    const [isEmpty,        setIsEmpty]        = useState(true);

    // ── Core parse trigger (immediate) ────────────────────────────────────
    const triggerParseNow = useCallback(() => {
        clearTimeout(parseTimerRef.current);
        if (!textareaRef.current || !workerRef.current) return;

        const text  = textareaRef.current.value;
        const lines = text.split(/\r?\n/).filter(Boolean);

        setLineCount(lines.length);
        setIsEmpty(lines.length === 0);

        if (lines.length === 0) {
            setIsParsing(false);
            clearInput();
            return;
        }

        setIsParsing(true);
        const id = ++requestIdRef.current;
        workerRef.current.postMessage({ id, lines });
    }, [clearInput]);

    // ── Debounced parse trigger (for typing) ──────────────────────────────
    const scheduleParse = useCallback(() => {
        clearTimeout(parseTimerRef.current);
        parseTimerRef.current = setTimeout(triggerParseNow, PARSE_DEBOUNCE_MS);
    }, [triggerParseNow]);

    // ── Worker message handler ─────────────────────────────────────────────
    const handleWorkerMessage = useCallback(({ data }) => {
        // Discard stale responses from superseded requests
        if (data.id !== requestIdRef.current) return;

        setIsParsing(false);
        setErrorsExpanded(false);

        if (!data.list.length) {
            clearInput();
            return;
        }

        const text = textareaRef.current?.value ?? '';
        applyParsedResult({
            loaded:       true,
            list:         data.list,
            errors:       data.errors,
            total:        text.split(/\r?\n/).filter(Boolean).length,
            unique:       data.unique,
            name:         sourceMetaRef.current.name,
            size:         text.length,
            hasProtocols: data.hasProtocols,
            sourceType:   sourceMetaRef.current.sourceType,
        });

        trackAction('proxy_list_imported', {
            source:        sourceMetaRef.current.sourceType,
            proxy_count:   data.list.length,
            unique_count:  data.unique,
            error_count:   data.errors.length,
        });
    }, [applyParsedResult, clearInput]);

    // Keep the handler ref current so the worker listener always calls the
    // latest version without needing to be re-registered.
    useEffect(() => { handlerRef.current = handleWorkerMessage; }, [handleWorkerMessage]);

    // ── Worker lifecycle ───────────────────────────────────────────────────
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/parseWorker.js', import.meta.url),
            { type: 'module' }
        );
        worker.onmessage = (e) => handlerRef.current(e);
        workerRef.current = worker;

        return () => {
            worker.terminate();
            clearTimeout(parseTimerRef.current);
        };
    }, []);

    // ── Extension deep-link listener (Option A) ────────────────────────────
    // Main.jsx dispatches this event when a deep link arrives and the
    // textarea input is active — populates the textarea so the user can
    // review before checking.
    useEffect(() => {
        const handler = (e) => {
            const { lines, meta } = e.detail;
            if (!textareaRef.current) return;
            textareaRef.current.value = lines.join('\n');
            setIsEmpty(false);
            sourceMetaRef.current = meta ?? { name: 'Extension', sourceType: 'extension' };
            triggerParseNow();
        };
        window.addEventListener('proxy-checker:load-lines', handler);
        return () => window.removeEventListener('proxy-checker:load-lines', handler);
    }, [triggerParseNow]);

    // ── Textarea event handlers ───────────────────────────────────────────

    const handleChange = useCallback(() => {
        if (!textareaRef.current) return;
        const text = textareaRef.current.value;
        setIsEmpty(!text);
        setLineCount(text ? text.split(/\r?\n/).filter(Boolean).length : 0);
        sourceMetaRef.current = { name: 'Manual Input', sourceType: 'textarea' };
        scheduleParse();
    }, [scheduleParse]);

    // Intercept native paste: use setRangeText so the browser's spellchecker
    // never sees the full text before we insert it.
    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;
        const { selectionStart, selectionEnd } = textareaRef.current;
        textareaRef.current.setRangeText(text, selectionStart, selectionEnd, 'end');
        setIsEmpty(false);
        sourceMetaRef.current = { name: 'Clipboard', sourceType: 'clipboard' };
        triggerParseNow();
    }, [triggerParseNow]);

    // ── Drag and drop ─────────────────────────────────────────────────────

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!e.dataTransfer.files.length) return;

        try {
            let text  = '';
            const names = [];

            for (const file of e.dataTransfer.files) {
                if (window.__ELECTRON__?.readFile) {
                    const filePath = getFilePath(file);
                    text += await window.__ELECTRON__.readFile(filePath);
                    names.push(pathBasename(filePath));
                } else {
                    text += await file.text();
                    names.push(file.name);
                }
            }

            if (!textareaRef.current) return;
            textareaRef.current.value = text;
            setIsEmpty(!text);
            sourceMetaRef.current = { name: names.join(', '), sourceType: 'drag_drop' };
            triggerParseNow();
        } catch (err) {
            showError(err.message);
        }
    }, [triggerParseNow, showError]);

    // ── Toolbar actions ───────────────────────────────────────────────────

    const handleBrowseFile = useCallback(async () => {
        try {
            const fileEntries = await chooseMultiTxtFiles();
            if (!fileEntries?.length) return;

            let text  = '';
            const names = [];
            for (const entry of fileEntries) {
                text  += entry.text;
                names.push(entry.name);
            }

            if (!textareaRef.current) return;
            textareaRef.current.value = text;
            setIsEmpty(!text);
            sourceMetaRef.current = { name: names.join(', '), sourceType: 'file' };
            triggerParseNow();
        } catch (err) {
            showError(err.message);
        }
    }, [triggerParseNow, showError]);

    const handleClipboardPaste = useCallback(async () => {
        try {
            const text = window.__ELECTRON__?.readClipboard
                ? await window.__ELECTRON__.readClipboard()
                : await navigator.clipboard.readText();

            if (!textareaRef.current) return;
            textareaRef.current.value = text ?? '';
            setIsEmpty(!text);
            sourceMetaRef.current = { name: 'Clipboard', sourceType: 'clipboard' };
            triggerParseNow();
        } catch (err) {
            showError(err.message);
        }
    }, [triggerParseNow, showError]);

    const handleClear = useCallback(() => {
        if (!textareaRef.current) return;
        textareaRef.current.value = '';
        setIsEmpty(true);
        setLineCount(0);
        setIsParsing(false);
        setErrorsExpanded(false);
        requestIdRef.current++;          // invalidate any in-flight worker result
        sourceMetaRef.current = { name: 'Manual Input', sourceType: 'textarea' };
        clearInput();
    }, [clearInput]);

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <Box>
            <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, p: 3, pb: 2 }}>

                {/* ── Header ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Proxy List
                        <InfoIcon title={
                            "Supported formats (one proxy per line):\n" +
                            "• ip:port\n• user:pass@ip:port\n• ip:port:user:pass\n" +
                            "• protocol://ip:port\n• protocol://user:pass@ip:port\n\n" +
                            "Type, paste, drag & drop a .txt file, or use the buttons above."
                        } />
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ActionButton onClick={handleBrowseFile}        icon={<BrowseIcon />}    label="Browse"  />
                        <ActionButton onClick={handleClipboardPaste}    icon={<ClipboardIcon />} label="Paste"   />
                    </Box>
                </Box>

                {/* ── Textarea + overlays ── */}
                <Box
                    sx={{ position: 'relative', borderRadius: 2 }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Box
                        component="textarea"
                        ref={textareaRef}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        placeholder=""
                        onChange={handleChange}
                        onPaste={handlePaste}
                        sx={{
                            display: 'block',
                            width: '100%',
                            minHeight: 200,
                            resize: 'vertical',
                            boxSizing: 'border-box',
                            bgcolor: alpha('#000', 0.2),
                            color: 'text.primary',
                            border: `2px dashed ${isDragOver ? blueBrand[500] : alpha('#fff', 0.12)}`,
                            borderRadius: 2,
                            p: 1.5,
                            fontFamily: '"Roboto Mono", monospace',
                            fontSize: '0.75rem',
                            lineHeight: 1.6,
                            outline: 'none',
                            transition: 'border-color 0.15s',
                            overflowY: 'auto',
                            '&:focus': {
                                borderColor: isDragOver ? blueBrand[500] : alpha('#fff', 0.25),
                                borderStyle: 'solid',
                            },
                        }}
                    />

                    {/* Empty-state ghost — pointer-events none so clicks go to textarea */}
                    {isEmpty && !isDragOver && (
                        <Box sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.75,
                            pointerEvents: 'none',
                            userSelect: 'none',
                        }}>
                            <Box sx={{ '& svg': { fill: alpha('#fff', 0.2) } }}>
                                <DropDocIcon scale="50" />
                            </Box>
                            <Typography variant="body2" sx={{ color: alpha('#fff', 0.25), fontSize: '0.8rem' }}>
                                Type or paste proxies, one per line
                            </Typography>
                            <Typography variant="caption" sx={{ color: alpha('#fff', 0.15) }}>
                                or drag & drop a .txt file
                            </Typography>
                        </Box>
                    )}

                    {/* Drag-over overlay */}
                    {isDragOver && (
                        <Box sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 0.75,
                            bgcolor: alpha(blueBrand[500], 0.12),
                            borderRadius: 2,
                            pointerEvents: 'none',
                            userSelect: 'none',
                        }}>
                            <Box sx={{ '& svg': { fill: blueBrand[300] } }}>
                                <DropDocIcon scale="50" />
                            </Box>
                            <Typography variant="body2" sx={{ color: blueBrand[300], fontWeight: 600 }}>
                                Drop to load proxies
                            </Typography>
                        </Box>
                    )}
                </Box>

                {/* ── Footer: line count + status + clear ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, minHeight: 28 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                            {splitByKK(lineCount)} {lineCount === 1 ? 'line' : 'lines'}
                        </Typography>

                        {isParsing && (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                                · parsing…
                            </Typography>
                        )}

                        {!isParsing && loaded && !isEmpty && (
                            <>
                                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                <Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {splitByKK(list.length)} valid
                                </Typography>
                                {errors.length > 0 && (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                        <Typography variant="caption" sx={{ color: 'error.main', fontSize: '0.72rem', fontWeight: 600 }}>
                                            {splitByKK(errors.length)} errors
                                        </Typography>
                                    </>
                                )}
                                {unique != null && lineCount - unique > 0 && (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>
                                            {splitByKK(lineCount - unique)} dupes removed
                                        </Typography>
                                    </>
                                )}
                            </>
                        )}
                    </Box>

                    {!isEmpty && (
                        <Box
                            onClick={handleClear}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: 'text.secondary',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                transition: 'color 0.15s, background-color 0.15s',
                                '&:hover': { color: 'error.main', bgcolor: alpha('#f44', 0.08) },
                            }}
                        >
                            <ClearIcon />
                            <span>Clear</span>
                        </Box>
                    )}
                </Box>

                {/* ── Parse errors (expandable) ── */}
                {!isEmpty && loaded && errors.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                        <Box
                            onClick={() => setErrorsExpanded(v => !v)}
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                borderRadius: 1.5,
                                mx: -1,
                                px: 1,
                                py: 0.5,
                                transition: 'background-color 0.15s',
                                '&:hover': { bgcolor: alpha(palette.error.main, 0.08) },
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <ChevronIcon open={errorsExpanded} />
                                <Typography variant="body2" sx={{ color: 'error.main' }}>Parse Errors</Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                                {errors.length}
                            </Typography>
                        </Box>
                        <Collapse in={errorsExpanded}>
                            <ParseErrorList errors={errors} />
                        </Collapse>
                    </Box>
                )}

                {/* ── Guest limit warning ── */}
                {loaded && overLimit && (
                    <Box sx={{ mt: 1.5 }}>
                        <GuestProxyLimitWarning proxyCount={proxyCount} limit={limits.inFlightProxies} />
                    </Box>
                )}

                {/* ── Shuffle ── */}
                <Box sx={{ mt: 1.5 }}>
                    <Checkbox
                        id="core-shuffle"
                        name="shuffle"
                        checked={shuffle}
                        onChange={toggleOption}
                        text="Shuffle"
                        tip="Randomize the order of proxies before checking begins"
                    />
                </Box>
            </Box>
        </Box>
    );
};

// ---------------------------------------------------------------------------
// Redux wiring
// ---------------------------------------------------------------------------

const mapStateToProps = state => ({
    loaded:     state.input.loaded,
    list:       state.input.list,
    errors:     state.input.errors,
    unique:     state.input.unique,
    proxyCount: state.input.list.length,
    shuffle:    state.core.shuffle,
});

const mapDispatchToProps = {
    applyParsedResult,
    clearInput,
    showError,
    toggleOption,
};

export default connect(mapStateToProps, mapDispatchToProps)(InputV2);
