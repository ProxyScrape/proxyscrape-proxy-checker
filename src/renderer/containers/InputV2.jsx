import React, { useRef, useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { applyParsedResult, clearInput } from '../actions/InputActions';
import { toggleOption } from '../actions/CoreActions';
import { CORE_TOGGLE_OPTION } from '../constants/ActionTypes';
import { showError } from '../store/reducers/app';
import { chooseMultiTxtFiles } from '../misc/filePicker';
import { splitByKK } from '../misc/text';
import { trackAction } from '../misc/analytics';
import { getGuestLimits } from '../misc/mode';
import { openPsLink } from '../misc/links';
import { psUrl } from '../misc/other';
import Checkbox from '../components/ui/Checkbox';
import { InfoIcon, HelpTip } from '../components/ui/HelpTip';
import DropDocIcon from '../components/ui/DropDocIcon';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import { alpha } from '@mui/material/styles';
import { blueBrand, palette } from '../theme/palette';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARSE_DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pathBasename = (p) => (p ? p.replace(/^.*[\\/]/, '') : '');
const getFilePath  = (file) => window.__ELECTRON__?.getPathForFile(file) ?? '';

// ---------------------------------------------------------------------------
// Icons
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

const ActionButton = ({ onClick, icon, label }) => (
    <Box
        onClick={onClick}
        sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            color: blueBrand[300], cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 500,
            px: 1, py: 0.5, borderRadius: 1,
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
    loaded, list, errors, unique, total, shuffle, rotatingEnabled,
    applyParsedResult, clearInput, showError, toggleOption, enableRotating,
    fillHeight,  // when true: stretch to fill the parent grid cell (desktop layout)
}) => {
    const limits    = getGuestLimits();
    const overLimit = limits !== null && list.length > limits.inFlightProxies;

    // ── Refs ──────────────────────────────────────────────────────────────
    const editorContainerRef = useRef(null);   // DOM node CodeMirror mounts into
    const editorViewRef      = useRef(null);   // CodeMirror EditorView instance
    const workerRef          = useRef(null);
    const requestIdRef       = useRef(0);
    const parseTimerRef      = useRef(null);
    const sourceMetaRef      = useRef({ name: 'Manual Input', sourceType: 'textarea' });
    const handlerRef         = useRef(null);   // stable ref to worker message handler
    // Stable refs for CM extension closures — avoids stale-closure bugs
    const triggerParseNowRef = useRef(null);
    const scheduleParseRef   = useRef(null);

    // ── Local state ───────────────────────────────────────────────────────
    const [lineCount,      setLineCount]      = useState(0);
    const [isDragOver,     setIsDragOver]     = useState(false);
    const [isParsing,      setIsParsing]      = useState(false);
    const [errorsExpanded, setErrorsExpanded] = useState(false);
    const [isEmpty,        setIsEmpty]        = useState(true);
    // Tracks whether the user has removed duplicates, so we can offer Restore.
    const [isDeduped,      setIsDeduped]      = useState(false);

    // ── Dedup refs ────────────────────────────────────────────────────────
    // Unique source-line strings from the last worker result — used to update
    // the editor when the user clicks Remove.
    const uniqueLinesRef    = useRef([]);
    // The original editor text saved at Remove time — used to restore.
    const originalTextRef   = useRef(null);
    // Signals to handleWorkerMessage that this parse was triggered by Remove,
    // so we don't reset the isDeduped state when the re-parse result arrives.
    const removePendingRef  = useRef(false);

    // ── Reset helper ──────────────────────────────────────────────────────
    const clearInputAndState = useCallback(() => {
        setIsParsing(false);
        setIsEmpty(true);
        setLineCount(0);
        clearInput();
    }, [clearInput]);

    // ── Core parse trigger ────────────────────────────────────────────────
    // rawText is the clipboard/file string when available (avoids doc.toString()
    // on the main thread for large documents).
    const triggerParseNow = useCallback((rawText) => {
        clearTimeout(parseTimerRef.current);
        if (!workerRef.current) return;

        const text = rawText !== undefined
            ? rawText
            : (editorViewRef.current?.state.doc.toString() ?? '');

        if (!text.trim()) { clearInputAndState(); return; }

        setIsEmpty(false);
        setIsParsing(true);

        const id = ++requestIdRef.current;
        // Encode to UTF-8 bytes and transfer zero-copy to the worker.
        // The worker does the split/dedup/parse entirely off the main thread.
        const buffer = new TextEncoder().encode(text).buffer;
        workerRef.current.postMessage({ id, buffer }, [buffer]);
    }, [clearInputAndState]);

    useEffect(() => { triggerParseNowRef.current = triggerParseNow; }, [triggerParseNow]);

    // ── Debounced parse trigger (for typing) ──────────────────────────────
    const scheduleParse = useCallback(() => {
        clearTimeout(parseTimerRef.current);
        parseTimerRef.current = setTimeout(
            () => triggerParseNowRef.current?.(),
            PARSE_DEBOUNCE_MS,
        );
    }, []);

    useEffect(() => { scheduleParseRef.current = scheduleParse; }, [scheduleParse]);

    // ── Worker message handler ─────────────────────────────────────────────
    const handleWorkerMessage = useCallback(({ data }) => {
        if (data.id !== requestIdRef.current) return; // stale result

        setIsParsing(false);
        setErrorsExpanded(false);

        // Keep the latest unique line strings for the Remove editor update.
        uniqueLinesRef.current = data.uniqueLines;

        // Any parse that was NOT triggered by Remove means the user changed
        // the content — reset the dedup state so Remove/Restore is fresh.
        if (removePendingRef.current) {
            removePendingRef.current = false;
        } else {
            setIsDeduped(false);
            originalTextRef.current = null;
        }

        // Only clear when there is genuinely nothing to show — no valid proxies
        // AND no parse errors. If there are errors but no valid proxies (e.g. the
        // user pasted only invalid lines) we still want to display those errors.
        if (!data.fullList.length && !data.errors.length) {
            clearInput();
            return;
        }

        applyParsedResult({
            loaded:       true,
            list:         data.fullList,
            errors:       data.errors,
            total:        data.totalLines,
            unique:       data.unique,
            name:         sourceMetaRef.current.name,
            size:         data.byteLength,
            hasProtocols: data.hasProtocols,
            sourceType:   sourceMetaRef.current.sourceType,
        });

        trackAction('proxy_list_imported', {
            source:       sourceMetaRef.current.sourceType,
            proxy_count:  data.fullList.length,
            unique_count: data.uniqueLines.length,
            error_count:  data.errors.length,
        });
    }, [applyParsedResult, clearInput]);

    useEffect(() => { handlerRef.current = handleWorkerMessage; }, [handleWorkerMessage]);

    // ── Worker lifecycle ───────────────────────────────────────────────────
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/parseWorker.js', import.meta.url),
            { type: 'module' },
        );
        worker.onmessage = (e) => handlerRef.current(e);
        workerRef.current = worker;
        return () => { worker.terminate(); clearTimeout(parseTimerRef.current); };
    }, []);

    // ── CodeMirror lifecycle ───────────────────────────────────────────────
    useEffect(() => {
        if (!editorContainerRef.current) return;

        const view = new EditorView({
            state: EditorState.create({
                doc: '',
                extensions: [
                    history(),
                    drawSelection(),
                    keymap.of([...defaultKeymap, ...historyKeymap]),

                    // Disable browser spell-check / autocorrect on the editor surface
                    EditorView.contentAttributes.of({
                        autocomplete:    'off',
                        autocorrect:     'off',
                        autocapitalize:  'off',
                        spellcheck:      'false',
                    }),

                    // React to typing — update line count and schedule a re-parse.
                    // Programmatic dispatches (paste handler, file load, clear) are
                    // NOT user events, so they won't double-trigger the parse.
                    EditorView.updateListener.of((update) => {
                        if (!update.docChanged) return;
                        const doc   = update.state.doc;
                        const empty = doc.length === 0;
                        setIsEmpty(empty);
                        setLineCount(empty ? 0 : doc.lines);

                        if (update.transactions.some(
                            tr => tr.isUserEvent('input')  ||
                                  tr.isUserEvent('delete') ||
                                  tr.isUserEvent('undo')   ||
                                  tr.isUserEvent('redo'),
                        )) {
                            sourceMetaRef.current = { name: 'Manual Input', sourceType: 'textarea' };
                            scheduleParseRef.current?.();
                        }
                    }),

                    // Intercept Cmd+V / right-click paste.
                    // Always read the full doc after dispatch — pasting into an editor
                    // that already has content would otherwise send only the clipboard
                    // fragment to the worker, causing a stale duplicate count until the
                    // next keystroke.
                    EditorView.domEventHandlers({
                        paste(event, view) {
                            event.preventDefault();
                            const text = event.clipboardData?.getData('text/plain') ?? '';
                            if (!text) return true;

                            const { from, to } = view.state.selection.main;
                            // updateListener fires synchronously here, updating isEmpty + lineCount.
                            view.dispatch({
                                changes:   { from, to, insert: text },
                                selection: { anchor: from + text.length },
                            });

                            sourceMetaRef.current = { name: 'Clipboard', sourceType: 'clipboard' };
                            // Use the full doc content (post-dispatch) so the worker sees
                            // existing content + the pasted fragment together.
                            triggerParseNowRef.current?.(view.state.doc.toString());
                            return true;
                        },
                    }),
                ],
            }),
            parent: editorContainerRef.current,
        });

        editorViewRef.current = view;
        return () => { view.destroy(); editorViewRef.current = null; };
    }, []); // intentionally run once — extensions use refs for fresh callbacks

    // ── Extension deep-link listener (Option A) ────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            const { lines, meta } = e.detail;
            const view = editorViewRef.current;
            if (!view) return;
            const text = lines.join('\n');
            // updateListener fires synchronously here, updating isEmpty + lineCount.
            view.dispatch({
                changes:   { from: 0, to: view.state.doc.length, insert: text },
                selection: { anchor: text.length },
            });
            sourceMetaRef.current = meta ?? { name: 'Extension', sourceType: 'extension' };
            triggerParseNowRef.current?.(text);
        };
        window.addEventListener('proxy-checker:load-lines', handler);
        return () => window.removeEventListener('proxy-checker:load-lines', handler);
    }, []);

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

            const view = editorViewRef.current;
            if (!view || !text) return;
            // updateListener fires synchronously here, updating isEmpty + lineCount.
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
            sourceMetaRef.current = { name: names.join(', '), sourceType: 'drag_drop' };
            triggerParseNowRef.current?.(text);
        } catch (err) {
            showError(err.message);
        }
    }, [showError]);

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

            const view = editorViewRef.current;
            if (!view) return;
            // updateListener fires synchronously here, updating isEmpty + lineCount.
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
            sourceMetaRef.current = { name: names.join(', '), sourceType: 'file' };
            triggerParseNowRef.current?.(text);
        } catch (err) {
            showError(err.message);
        }
    }, [showError]);

    const handleClipboardPaste = useCallback(async () => {
        try {
            const text = window.__ELECTRON__?.readClipboard
                ? await window.__ELECTRON__.readClipboard()
                : await navigator.clipboard.readText();

            const view = editorViewRef.current;
            if (!view || !text) return;
            // updateListener fires synchronously here, updating isEmpty + lineCount.
            view.dispatch({
                changes:   { from: 0, to: view.state.doc.length, insert: text ?? '' },
                selection: { anchor: (text ?? '').length },
            });
            sourceMetaRef.current = { name: 'Clipboard', sourceType: 'clipboard' };
            triggerParseNowRef.current?.(text ?? '');
        } catch (err) {
            showError(err.message);
        }
    }, [showError]);

    const handleClear = useCallback(() => {
        const view = editorViewRef.current;
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
        setIsEmpty(true);
        setLineCount(0);
        setIsParsing(false);
        setErrorsExpanded(false);
        setIsDeduped(false);
        originalTextRef.current  = null;
        removePendingRef.current = false;
        requestIdRef.current++;    // invalidate any in-flight worker result
        sourceMetaRef.current = { name: 'Manual Input', sourceType: 'textarea' };
        clearInput();
    }, [clearInput]);

    // Replaces editor content with deduplicated lines and re-parses so all
    // Redux state (list, total, unique) stays consistent with the editor.
    const handleRemoveDuplicates = useCallback(() => {
        const view = editorViewRef.current;
        const lines = uniqueLinesRef.current;
        if (!view || !lines.length) return;

        originalTextRef.current  = view.state.doc.toString();
        removePendingRef.current = true;
        setIsDeduped(true);

        const newText = lines.join('\n');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newText } });
        triggerParseNowRef.current?.(newText);
    }, []);

    // Restores the original editor content (including duplicates) and re-parses.
    const handleRestoreDuplicates = useCallback(() => {
        const view         = editorViewRef.current;
        const originalText = originalTextRef.current;
        if (!view || !originalText) return;

        originalTextRef.current = null;
        setIsDeduped(false);

        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: originalText } });
        triggerParseNowRef.current?.(originalText);
    }, []);

    // Removes duplicates from the editor and simultaneously enables the Rotating
    // option if it isn't already on — called from the tooltip action link.
    const handleRemoveAndEnableRotating = useCallback(() => {
        handleRemoveDuplicates();
        if (!rotatingEnabled) enableRotating();
    }, [handleRemoveDuplicates, rotatingEnabled, enableRotating]);

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <Box sx={fillHeight ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : {}}>
            <Box sx={{
                bgcolor: 'background.paper', borderRadius: 3, p: 3, pb: 2,
                // minHeight:0 overrides the CSS default min-height:auto on flex items,
                // which would otherwise let the card grow to fit its content instead of
                // being capped at the flex allocation (the sidebar row height).
                ...(fillHeight ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}),
            }}>

                {/* ── Header ── */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexShrink: 0 }}>
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
                        <ActionButton onClick={handleBrowseFile}     icon={<BrowseIcon />}    label="Browse" />
                        <ActionButton onClick={handleClipboardPaste} icon={<ClipboardIcon />} label="Paste"  />
                    </Box>
                </Box>

                {/* ── CodeMirror editor + overlays ── */}
                <Box
                    sx={{
                        position: 'relative',
                        // fillHeight: flex:1 expands the editor to fill the remaining card
                        // space so it aligns with the sidebar bottom on the desktop grid.
                        // Default: fixed 266px (33% more than the original 200px baseline).
                        // resize:vertical lets users drag to a custom height in either mode.
                        ...(fillHeight
                            // minHeight:0 is essential here: without it, flex items keep
                            // min-height:auto and grow to fit CodeMirror's content instead
                            // of staying at the flex-allocated height. With minHeight:0,
                            // the box gets a definite height from flex layout, so
                            // cm-scroller's height:100% resolves correctly and scrolls.
                            ? { flex: 1, minHeight: 0 }
                            : { height: 266 }
                        ),
                        resize: 'vertical',
                        overflow: 'hidden',
                        borderRadius: 2,
                        // Border reacts to drag-over and focus-within
                        border: isDragOver
                            ? `2px solid ${blueBrand[500]}`
                            : `2px dashed ${alpha('#fff', 0.12)}`,
                        bgcolor: alpha('#000', 0.2),
                        transition: 'border-color 0.15s',
                        '&:focus-within': {
                            borderColor: isDragOver ? blueBrand[500] : alpha('#fff', 0.25),
                            borderStyle: 'solid',
                        },
                        // ── CodeMirror inner styling ──────────────────────
                        '& .cm-editor': {
                            height: '100%',
                            outline: 'none',
                        },
                        '& .cm-scroller': {
                            height: '100%',
                            overflow: 'auto',
                            fontFamily: '"Roboto Mono", monospace',
                            fontSize: '0.75rem',
                            lineHeight: '1.6',
                        },
                        '& .cm-content': {
                            padding: '12px',
                            caretColor: '#fff',
                            // fillHeight: must be 0 so cm-content doesn't push the editor
                            // box taller than its flex allocation. minHeight:0 on the
                            // wrapper alone is insufficient — cm-content and cm-gutter also
                            // have intrinsic min-height that causes CodeMirror to expand to
                            // fit all lines instead of scrolling. (source: CM6 forum)
                            // Default: 262px keeps the click target tall when empty.
                            minHeight: fillHeight ? 0 : '262px',
                        },
                        '& .cm-gutter': {
                            minHeight: fillHeight ? 0 : undefined,
                        },
                        '& .cm-line': { padding: '0' },
                        '& .cm-cursor, & .cm-dropCursor': {
                            borderLeftColor: 'rgba(255,255,255,0.8)',
                        },
                        // Selection background (drawSelection extension)
                        '& .cm-selectionBackground': {
                            backgroundColor: 'rgba(99,136,210,0.3) !important',
                        },
                        '& .cm-focused .cm-selectionBackground': {
                            backgroundColor: 'rgba(99,136,210,0.45) !important',
                        },
                        // No active-line highlight — keeps it looking like a plain textarea
                        '& .cm-activeLine': { backgroundColor: 'transparent' },
                        '& .cm-focused': { outline: 'none' },
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* CodeMirror mounts here */}
                    <div ref={editorContainerRef} style={{ height: '100%' }} />

                    {/* Empty-state ghost — pointer-events none so clicks reach the editor */}
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

                        {!isParsing && loaded && list.length > 0 && (
                            <>
                                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                <Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {splitByKK(list.length)} valid
                                </Typography>
                            </>
                        )}

                        {/* Error count is independent of the valid-count block so it shows
                            even when the entire list failed to parse (list.length === 0). */}
                        {!isParsing && loaded && errors.length > 0 && (
                            <>
                                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                <Typography variant="caption" sx={{ color: 'error.main', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {splitByKK(errors.length)} errors
                                </Typography>
                            </>
                        )}

                        {!isParsing && loaded && list.length > 0 && (
                            <>
                                {isDeduped ? (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                        <HelpTip title="Restore the original list, including all duplicates">
                                            <Typography
                                                variant="caption"
                                                onClick={handleRestoreDuplicates}
                                                sx={{
                                                    color: blueBrand[300],
                                                    fontSize: '0.72rem',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                    px: 0.75, py: 0.25, borderRadius: 1,
                                                    transition: 'color 0.15s, background-color 0.15s',
                                                    '&:hover': { color: '#fff', bgcolor: alpha(blueBrand[500], 0.12) },
                                                }}
                                            >
                                                Restore duplicates
                                            </Typography>
                                        </HelpTip>
                                    </>
                                ) : (total > unique) && (
                                    <>
                                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem' }}>·</Typography>
                                        <HelpTip title={
                                            <>
                                                <Box component="span" sx={{ display: 'block', opacity: 0.8, mb: 0.75 }}>
                                                    Each duplicate is checked independently. If you want structured rotating proxy testing across identical proxies, consider enabling the Rotating option.
                                                </Box>
                                                <Box
                                                    component="span"
                                                    onClick={handleRemoveAndEnableRotating}
                                                    sx={{
                                                        display: 'block',
                                                        color: blueBrand[300],
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                        transition: 'color 0.15s',
                                                        '&:hover': { color: '#fff' },
                                                    }}
                                                >
                                                    ↻ Remove duplicates &amp; enable Rotating
                                                </Box>
                                            </>
                                        }>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: 'text.disabled',
                                                    fontSize: '0.72rem',
                                                    cursor: 'help',
                                                    textDecoration: 'underline dotted',
                                                    textUnderlineOffset: '2px',
                                                    transition: 'color 0.15s',
                                                    '&:hover': { color: 'text.secondary' },
                                                }}
                                            >
                                                {splitByKK(total - unique)} duplicates
                                            </Typography>
                                        </HelpTip>
                                        <HelpTip title="Remove duplicate lines, keeping one occurrence of each proxy">
                                            <Typography
                                                variant="caption"
                                                onClick={handleRemoveDuplicates}
                                                sx={{
                                                    color: blueBrand[300],
                                                    fontSize: '0.72rem',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                    px: 0.75, py: 0.25, borderRadius: 1,
                                                    transition: 'color 0.15s, background-color 0.15s',
                                                    '&:hover': { color: '#fff', bgcolor: alpha(blueBrand[500], 0.12) },
                                                }}
                                            >
                                                · Remove
                                            </Typography>
                                        </HelpTip>
                                    </>
                                )}
                            </>
                        )}
                    </Box>

                    {!isEmpty && (
                        <Box
                            onClick={handleClear}
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                color: 'text.secondary', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 500,
                                px: 1, py: 0.5, borderRadius: 1,
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
                {loaded && errors.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                        <Box
                            onClick={() => setErrorsExpanded(v => !v)}
                            sx={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', cursor: 'pointer',
                                borderRadius: 1.5, mx: -1, px: 1, py: 0.5,
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
                        <GuestProxyLimitWarning proxyCount={list.length} limit={limits.inFlightProxies} />
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
    loaded:          state.input.loaded,
    list:            state.input.list,
    errors:          state.input.errors,
    unique:          state.input.unique,
    total:           state.input.total,
    shuffle:         state.core?.shuffle,
    rotatingEnabled: state.core?.rotatingEnabled ?? false,
});

const mapDispatchToProps = {
    applyParsedResult,
    clearInput,
    showError,
    toggleOption,
    enableRotating: () => ({ type: CORE_TOGGLE_OPTION, target: 'rotatingEnabled' }),
};

export default connect(mapStateToProps, mapDispatchToProps)(InputV2);
