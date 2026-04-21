// ==UserScript==
// @name         Douyin Downloader
// @namespace    https://github.com/W-ArcherEmiya
// @version      3.6.4
// @description  Download the current Douyin video or batch-download videos from a profile page.
// @author       ArcherEmiya
// @match        *://*.douyin.com/*
// @match        *://douyin.com/*
// @match        *://*.iesdouyin.com/*
// @exclude      *://lf-zt.douyin.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @connect      *
// @license      MIT License
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Core identifiers and behavior tuning.
    const SCRIPT_ID = 'douyin-downloader';
    const PANEL_ID = `${SCRIPT_ID}-panel`;
    const PANEL_TOGGLE_ID = `${SCRIPT_ID}-toggle`;
    const PANEL_STATUS_ID = `${SCRIPT_ID}-status`;
    const BATCH_MODAL_ID = `${SCRIPT_ID}-batch-modal`;
    const BATCH_MODAL_LIST_ID = `${SCRIPT_ID}-batch-list`;
    const BATCH_MODAL_SUMMARY_ID = `${SCRIPT_ID}-batch-summary`;
    const BATCH_SEARCH_ID = `${SCRIPT_ID}-batch-search`;
    const BATCH_SELECT_ALL_ID = `${SCRIPT_ID}-batch-select-all`;
    const BATCH_CLEAR_ALL_ID = `${SCRIPT_ID}-batch-clear-all`;
    const BATCH_START_ID = `${SCRIPT_ID}-batch-start`;
    const BATCH_CLOSE_ID = `${SCRIPT_ID}-batch-close`;
    const SHORTCUT_KEY = 'q';
    const TITLE_FALLBACK = 'douyin-video';
    const AUTHOR_FALLBACK = 'unknown-author';
    const MAX_NAME_LENGTH = 80;
    const TITLE_FILENAME_MAX_LENGTH = 28;
    const AUTHOR_FILENAME_MAX_LENGTH = 16;
    const BATCH_DELAY_MS = 700;
    const SCAN_DELAY_MS = 900;
    const ACTION_STATUS_HIDE_DELAY_MS = 1500;
    const ACTION_REFRESH_DELAY_MS = 1700;
    const MAX_SCROLL_ROUNDS = 45;
    const MAX_STABLE_SCROLL_ROUNDS = 4;
    const REFRESH_DEBOUNCE_MS = 180;
    const PANEL_POSITION_KEY = `${SCRIPT_ID}-panel-top`;
    const PANEL_EDGE_OFFSET = 16;
    const PANEL_TOGGLE_SIZE = 46;
    const PANEL_DRAG_THRESHOLD = 6;

    const state = {
        mode: 'idle',
        observer: null,
        historyPatched: false,
        refreshTimer: null,
        panelTop: null,
        pointerDrag: null,
        batchEntries: [],
        batchModalOpen: false,
        batchSearchTerm: '',
        batchModalLoading: false,
        batchLoadingMessage: '',
        toggleLabel: 'Download video',
        lastStatus: '',
        statusBubbleActive: false,
        statusHideTimer: null,
        networkHookInstalled: false,
        videoDataCache: new Map(),
        videoDataRecords: [],
    };

    const titleSelectors = [
        'h1',
        '[data-e2e="video-desc"]',
        '[data-e2e="feed-active-video-desc"]',
        'meta[property="og:title"]',
        'meta[name="description"]',
        '[class*="title"]',
        '[class*="desc"]',
        '[class*="detail"]',
    ];

    const authorSelectors = [
        '[data-e2e="video-author-name"]',
        '[data-e2e="feed-active-video-author-name"]',
        '[data-e2e="user-name"]',
        '[data-e2e="video-author-uniqueid"]',
        'meta[name="author"]',
        '[class*="account-name"]',
        '[class*="author"]',
        'a[href*="/user/"]',
    ];

    const genericTitlePatterns = [
        /\u6296\u97f3.*\u6296\u97f3/i,
        /\u6296\u97f3\u7cbe\u9009/i,
        /^\u6296\u97f3(?:\u7cbe\u9009)?$/i,
        /^douyin$/i,
        /^jingxuan$/i,
        /^\u641c\u7d22$/i,
        /^\u70b9\u51fb\u63a8\u8350$/i,
        /^\u53d1\u6765\u53cb\u597d\u7684\u5f39\u5e55\u5427$/i,
    ];

    const style = `
        #${PANEL_ID} {
            position: fixed;
            right: ${PANEL_EDGE_OFFSET}px;
            top: ${PANEL_EDGE_OFFSET}px;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: "Segoe UI", Arial, sans-serif;
        }

        #${PANEL_TOGGLE_ID} {
            width: ${PANEL_TOGGLE_SIZE}px;
            height: ${PANEL_TOGGLE_SIZE}px;
            border: none;
            border-radius: 999px;
            padding: 0;
            background: linear-gradient(135deg, #141414 0%, #303030 100%);
            color: #ffffff;
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34);
            cursor: grab;
            display: grid;
            place-items: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            touch-action: none;
        }

        #${PANEL_ID}[data-mode="single"] #${PANEL_TOGGLE_ID} {
            background: linear-gradient(135deg, #ff4d6d 0%, #ff8a3d 100%);
        }

        #${PANEL_ID}[data-mode="batch"] #${PANEL_TOGGLE_ID} {
            background: linear-gradient(135deg, #1877f2 0%, #31c1ff 100%);
        }

        #${PANEL_ID}[data-disabled="true"] #${PANEL_TOGGLE_ID} {
            opacity: 0.58;
            cursor: not-allowed;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.22);
        }

        #${PANEL_TOGGLE_ID}:hover {
            transform: scale(1.04);
            box-shadow: 0 16px 34px rgba(0, 0, 0, 0.4);
        }

        #${PANEL_TOGGLE_ID}:focus-visible {
            outline: 2px solid rgba(255, 255, 255, 0.78);
            outline-offset: 3px;
        }

        #${PANEL_ID}.is-dragging #${PANEL_TOGGLE_ID} {
            cursor: grabbing;
            transform: scale(1.03);
        }

        #${PANEL_TOGGLE_ID} svg {
            width: 19px;
            height: 19px;
            display: block;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.9;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        #${PANEL_STATUS_ID} {
            order: -1;
            min-width: 168px;
            max-width: min(320px, calc(100vw - ${PANEL_TOGGLE_SIZE + PANEL_EDGE_OFFSET + 40}px));
            padding: 10px 12px;
            border-radius: 14px;
            background: rgba(16, 16, 18, 0.9);
            color: #f7f7f7;
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.26);
            font-size: 12px;
            line-height: 1.45;
            white-space: pre-line;
            word-break: break-word;
            pointer-events: none;
            opacity: 0;
            transform: translateX(12px);
            transition: opacity 0.18s ease, transform 0.18s ease;
        }

        #${PANEL_STATUS_ID}.is-visible {
            opacity: 1;
            transform: translateX(0);
        }

        #${PANEL_ID}[data-mode="single"] #${PANEL_STATUS_ID} {
            background: rgba(45, 16, 22, 0.92);
        }

        #${PANEL_ID}[data-mode="batch"] #${PANEL_STATUS_ID} {
            background: rgba(14, 28, 48, 0.92);
        }

        #${BATCH_MODAL_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(6, 6, 6, 0.6);
            backdrop-filter: blur(10px);
        }

        #${BATCH_MODAL_ID}.is-open {
            display: flex;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog {
            width: min(760px, calc(100vw - 32px));
            max-height: min(82vh, 860px);
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 18px;
            border-radius: 20px;
            background: rgba(18, 18, 18, 0.97);
            color: #f7f7f7;
            box-shadow: 0 22px 60px rgba(0, 0, 0, 0.4);
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-subtitle {
            margin: 4px 0 0;
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-list {
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding-right: 4px;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-loading {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 14px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.82);
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-line;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-spinner {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.16);
            border-top-color: #31c1ff;
            animation: ${SCRIPT_ID}-spin 0.8s linear infinite;
            flex: 0 0 auto;
        }

        @keyframes ${SCRIPT_ID}-spin {
            to {
                transform: rotate(360deg);
            }
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item {
            display: grid;
            grid-template-columns: auto 1fr auto;
            gap: 12px;
            align-items: start;
            padding: 12px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.05);
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item.is-disabled {
            opacity: 0.56;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item input[type="checkbox"] {
            margin-top: 3px;
            width: 16px;
            height: 16px;
            accent-color: #31c1ff;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item-title {
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item-meta {
            margin-top: 4px;
            color: rgba(255, 255, 255, 0.68);
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-line;
            word-break: break-word;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item-status {
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            background: rgba(49, 193, 255, 0.16);
            color: #7edcff;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-item-status.is-error {
            background: rgba(255, 94, 94, 0.16);
            color: #ff9d9d;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-toolbar,
        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-toolbar {
            justify-content: space-between;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-toolbar-group {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            min-width: 0;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-dialog-actions {
            justify-content: space-between;
        }

        #${BATCH_SEARCH_ID} {
            width: min(280px, 100%);
            min-width: 180px;
            appearance: none;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.06);
            color: #ffffff;
            font-size: 13px;
            outline: none;
        }

        #${BATCH_SEARCH_ID}::placeholder {
            color: rgba(255, 255, 255, 0.45);
        }

        #${BATCH_SEARCH_ID}:focus {
            border-color: rgba(49, 193, 255, 0.55);
            box-shadow: 0 0 0 3px rgba(49, 193, 255, 0.12);
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-text-button,
        #${BATCH_MODAL_ID} .${SCRIPT_ID}-action-button {
            appearance: none;
            border: none;
            border-radius: 10px;
            padding: 10px 12px;
            color: #ffffff;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-text-button {
            background: rgba(255, 255, 255, 0.08);
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-action-button {
            background: linear-gradient(135deg, #1877f2 0%, #31c1ff 100%);
        }

        #${BATCH_MODAL_ID} .${SCRIPT_ID}-text-button:disabled,
        #${BATCH_MODAL_ID} .${SCRIPT_ID}-action-button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        #${BATCH_MODAL_SUMMARY_ID} {
            color: rgba(255, 255, 255, 0.74);
            font-size: 12px;
        }
    `;

    // Shared helpers.
    function addStyleBlock(cssText) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(cssText);
            return;
        }

        const styleElement = document.createElement('style');
        styleElement.textContent = cssText;
        document.head.appendChild(styleElement);
    }

    function wait(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function normalizeText(value) {
        return (value || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function readTextValue(value) {
        if (!value) {
            return '';
        }

        return normalizeText(
            typeof value === 'string'
                ? value
                : value.innerText || value.textContent || ''
        );
    }

    function readRawTextValue(value) {
        if (!value) {
            return '';
        }

        return typeof value === 'string'
            ? value
            : value.innerText || value.textContent || '';
    }

    function isGenericTitleText(text) {
        const value = normalizeText(text);
        if (!value) {
            return true;
        }

        return genericTitlePatterns.some((pattern) => pattern.test(value));
    }

    function isLikelyUiText(text) {
        const value = normalizeText(text);
        if (!value) {
            return true;
        }

        return /^(鎼滅储|鍙戦€亅璇勮|鐐硅禐|鏀惰棌|鍒嗕韩|娓呭睆|杩炴挱|鍊嶉€焲鍚姈闊硘鐐瑰嚮鎺ㄨ崘)$/.test(value);
    }

    function isBadProfileMetaText(text) {
        const value = normalizeText(text).toLowerCase();
        if (!value) {
            return true;
        }

        return [
            'batch download',
            'download selected',
            'select all',
            'clear all',
            'loading video list',
            '通用配置',
            '粉丝指数',
            'middleware',
            'perf',
            'snippet',
            'debug',
            'pc tab',
            'luckytrain',
        ].some((keyword) => value.includes(keyword));
    }

    function isLikelyCountText(text) {
        const value = normalizeText(text);
        if (!value) {
            return true;
        }

        return /^(?:\d+(?:\.\d+)?(?:w|k|\u4e07|\u4ebf)?|[\d.]+(?:\u4e07|\u4ebf)|\u521a\u521a\u770b\u8fc7)$/i.test(value);
    }

    function scoreTitleCandidate(text) {
        const value = normalizeText(text);
        if (!value || value.length < 4 || value.length > 140) {
            return -1;
        }

        if (isGenericTitleText(value) || isLikelyUiText(value) || isBadProfileMetaText(value) || isLikelyCountText(value)) {
            return -1;
        }

        let score = 0;

        if (/[\u4e00-\u9fff]/.test(value)) {
            score += 18;
        }

        if (/[#\uFF03]/.test(value)) {
            score += 10;
        }

        if (value.length >= 8 && value.length <= 70) {
            score += 14;
        }

        if (value.startsWith('@')) {
            score -= 30;
        }

        if (/^\d+(?:\.\d+)?(?:\u4e07|\u4ebf)?$/.test(value)) {
            score -= 30;
        }

        if (/\u7cbe\u9009|jingxuan|douyin/i.test(value)) {
            score -= 24;
        }

        return score;
    }

    function scoreAuthorCandidate(text) {
        const value = normalizeText(text);
        if (!value || value.length < 2 || value.length > 40) {
            return -1;
        }

        if (isGenericTitleText(value) || isLikelyUiText(value) || isBadProfileMetaText(value) || isLikelyCountText(value)) {
            return -1;
        }

        let score = 0;

        if (value.startsWith('@')) {
            score += 32;
        }

        if (/^[\w\u4e00-\u9fff@._-]+$/.test(value)) {
            score += 12;
        }

        if (/[\u4e00-\u9fff]/.test(value)) {
            score += 10;
        }

        if (!value.startsWith('@') && /^[A-Za-z0-9._-]+$/.test(value)) {
            score -= 18;
        }

        if (/^\d+(?:\.\d+)?(?:\u4e07|\u4ebf)?$/.test(value)) {
            score -= 25;
        }

        return score;
    }

    function sanitizeFilenamePart(value, fallback) {
        const cleaned = normalizeText(value)
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
            .replace(/\.+$/g, '')
            .slice(0, MAX_NAME_LENGTH)
            .trim();

        return cleaned || fallback;
    }

    function compactTitleForFilename(value) {
        const normalized = normalizeText(value)
            .replace(/\s*[#\uFF03][^\s#\uFF03]+/g, '')
            .replace(/[\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001,.!?:;]+$/g, '')
            .trim();

        return sanitizeFilenamePart(
            normalized.slice(0, TITLE_FILENAME_MAX_LENGTH),
            TITLE_FALLBACK
        );
    }

    function compactAuthorForFilename(value) {
        const normalized = normalizeText(value)
            .replace(/^@+/, '')
            .trim();

        return sanitizeFilenamePart(
            normalized.slice(0, AUTHOR_FILENAME_MAX_LENGTH),
            AUTHOR_FALLBACK
        );
    }

    function formatByteSize(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        let size = value;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }

        const digits = size >= 100 || unitIndex === 0 ? 0 : 1;
        return `${size.toFixed(digits)} ${units[unitIndex]}`;
    }

    function formatDownloadProgress(loaded, total) {
        const loadedText = formatByteSize(loaded);
        const totalValue = Number(total);

        if (Number.isFinite(totalValue) && totalValue > 0) {
            const percent = Math.max(0, Math.min(100, Math.round((Number(loaded) / totalValue) * 100)));
            return `${percent}% (${loadedText} / ${formatByteSize(totalValue)})`;
        }

        return `${loadedText} downloaded`;
    }

    function buildFallbackMeta() {
        return {
            title: TITLE_FALLBACK,
            author: AUTHOR_FALLBACK,
        };
    }

    function clearStatusHideTimer() {
        if (state.statusHideTimer) {
            window.clearTimeout(state.statusHideTimer);
            state.statusHideTimer = null;
        }
    }

    function activateStatusBubble() {
        clearStatusHideTimer();
        state.statusBubbleActive = true;
    }

    function scheduleStatusBubbleHide(delay = 2200) {
        clearStatusHideTimer();
        state.statusHideTimer = window.setTimeout(() => {
            state.statusHideTimer = null;
            state.statusBubbleActive = false;
            setStatus('');
        }, delay);
    }

    function setStatus(message) {
        state.lastStatus = message || '';

        const toggle = document.getElementById(PANEL_TOGGLE_ID);
        if (toggle) {
            const label = state.toggleLabel || 'Download';
            const title = [label, state.lastStatus].filter(Boolean).join('\n');
            toggle.title = title;
            toggle.setAttribute('aria-label', title);
        }

        const status = document.getElementById(PANEL_STATUS_ID);
        if (status) {
            status.textContent = state.lastStatus;
            status.classList.toggle('is-visible', Boolean(state.statusBubbleActive && state.lastStatus));
        }
    }

    function beginAction(mode, label, statusMessage) {
        setMode(mode);
        activateStatusBubble();
        setPrimaryButtonState(label, true, mode);
        setStatus(statusMessage);
    }

    function finishAction() {
        scheduleStatusBubbleHide(ACTION_STATUS_HIDE_DELAY_MS);
        setMode('idle');
        window.setTimeout(refreshUI, ACTION_REFRESH_DELAY_MS);
    }

    // Batch modal state.
    function getBatchModal() {
        return document.getElementById(BATCH_MODAL_ID);
    }

    function getBatchEntries() {
        return Array.isArray(state.batchEntries) ? state.batchEntries : [];
    }

    function getBatchSearchTerm() {
        return normalizeText(state.batchSearchTerm).toLowerCase();
    }

    function matchesBatchSearch(entry) {
        const searchTerm = getBatchSearchTerm();
        if (!searchTerm) {
            return true;
        }

        const haystack = [
            entry.meta.title,
            entry.meta.author,
            entry.pageUrl,
            entry.error,
        ].filter(Boolean).join(' ').toLowerCase();

        return haystack.includes(searchTerm);
    }

    function getFilteredBatchEntries() {
        return getBatchEntries().filter(matchesBatchSearch);
    }

    function getSelectedBatchEntries() {
        return getBatchEntries().filter((entry) => entry.selected && entry.available);
    }

    function setBatchModalLoading(loading, message = '') {
        state.batchModalLoading = Boolean(loading);
        state.batchLoadingMessage = message || '';

        const searchInput = document.getElementById(BATCH_SEARCH_ID);
        const selectAllButton = document.getElementById(BATCH_SELECT_ALL_ID);
        const clearAllButton = document.getElementById(BATCH_CLEAR_ALL_ID);
        const startButton = document.getElementById(BATCH_START_ID);

        if (searchInput) {
            searchInput.disabled = state.batchModalLoading;
        }

        if (selectAllButton) {
            selectAllButton.disabled = state.batchModalLoading;
        }

        if (clearAllButton) {
            clearAllButton.disabled = state.batchModalLoading;
        }

        if (startButton) {
            startButton.disabled = state.batchModalLoading || getSelectedBatchEntries().length === 0 || isBusy();
        }

        renderBatchModalList();
    }

    function updateBatchModalSummary() {
        const summary = document.getElementById(BATCH_MODAL_SUMMARY_ID);
        const startButton = document.getElementById(BATCH_START_ID);
        const entries = getBatchEntries();
        const filteredEntries = getFilteredBatchEntries();
        const selectableCount = entries.filter((entry) => entry.available).length;
        const selectedCount = getSelectedBatchEntries().length;
        const filteredSelectableCount = filteredEntries.filter((entry) => entry.available).length;
        const filteredSelectedCount = filteredEntries.filter((entry) => entry.selected && entry.available).length;

        if (summary) {
            if (state.batchModalLoading) {
                summary.textContent = state.batchLoadingMessage || 'Loading video list...';
            } else {
                summary.textContent = `Detected ${entries.length} videos, showing ${filteredEntries.length}, ${selectableCount} available, ${selectedCount} selected. Current filter: ${filteredSelectableCount} available, ${filteredSelectedCount} selected.`;
            }
        }

        if (startButton) {
            startButton.disabled = state.batchModalLoading || selectedCount === 0 || isBusy();
            startButton.textContent = selectedCount > 0 ? `Download selected (${selectedCount})` : 'Download selected';
        }
    }

    function renderBatchModalList() {
        const list = document.getElementById(BATCH_MODAL_LIST_ID);
        if (!list) {
            return;
        }

        list.replaceChildren();

        if (state.batchModalLoading) {
            const loading = document.createElement('div');
            loading.className = `${SCRIPT_ID}-loading`;

            const spinner = document.createElement('div');
            spinner.className = `${SCRIPT_ID}-spinner`;

            const text = document.createElement('div');
            text.textContent = state.batchLoadingMessage || 'Loading video list...';

            loading.appendChild(spinner);
            loading.appendChild(text);
            list.appendChild(loading);
            updateBatchModalSummary();
            return;
        }

        const filteredEntries = getFilteredBatchEntries();
        if (!filteredEntries.length) {
            const empty = document.createElement('div');
            empty.className = `${SCRIPT_ID}-item is-disabled`;
            empty.textContent = 'No videos match the current search.';
            list.appendChild(empty);
            updateBatchModalSummary();
            return;
        }

        for (const entry of filteredEntries) {
            const row = document.createElement('label');
            row.className = `${SCRIPT_ID}-item${entry.available ? '' : ' is-disabled'}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = Boolean(entry.selected && entry.available);
            checkbox.disabled = !entry.available || isBusy();
            checkbox.dataset.entryId = entry.id;

            const body = document.createElement('div');

            const title = document.createElement('div');
            title.className = `${SCRIPT_ID}-item-title`;
            title.textContent = entry.meta.title || TITLE_FALLBACK;

            const meta = document.createElement('div');
            meta.className = `${SCRIPT_ID}-item-meta`;
            meta.textContent = [
                `Author: ${entry.meta.author || AUTHOR_FALLBACK}`,
                entry.pageUrl,
                entry.error ? `Error: ${entry.error}` : '',
            ].filter(Boolean).join('\n');

            const status = document.createElement('div');
            status.className = `${SCRIPT_ID}-item-status${entry.available ? '' : ' is-error'}`;
            status.textContent = entry.available ? 'Ready' : 'Unavailable';

            body.appendChild(title);
            body.appendChild(meta);
            row.appendChild(checkbox);
            row.appendChild(body);
            row.appendChild(status);
            list.appendChild(row);
        }

        updateBatchModalSummary();
    }

    function setBatchEntries(entries) {
        state.batchEntries = Array.isArray(entries) ? entries : [];
        renderBatchModalList();
    }

    function setBatchModalOpen(open) {
        state.batchModalOpen = Boolean(open);
        const modal = getBatchModal();

        if (!modal) {
            return;
        }

        modal.classList.toggle('is-open', state.batchModalOpen);
        modal.setAttribute('aria-hidden', state.batchModalOpen ? 'false' : 'true');
    }

    function closeBatchModal() {
        setBatchModalOpen(false);
    }

    function openBatchModal(entries) {
        state.batchSearchTerm = '';
        const searchInput = document.getElementById(BATCH_SEARCH_ID);
        if (searchInput) {
            searchInput.value = '';
        }
        setBatchEntries(entries);
        setBatchModalOpen(true);
    }

    function updateBatchSelection(entryId, selected) {
        state.batchEntries = getBatchEntries().map((entry) => {
            if (entry.id !== entryId || !entry.available) {
                return entry;
            }

            return {
                ...entry,
                selected: Boolean(selected),
            };
        });

        updateBatchModalSummary();
    }

    function setAllBatchSelections(selected) {
        state.batchEntries = getBatchEntries().map((entry) => ({
            ...entry,
            selected: entry.available && matchesBatchSearch(entry) ? Boolean(selected) : entry.selected && entry.available,
        }));

        renderBatchModalList();
    }

    function setPrimaryButtonState(label, disabled, mode = 'single') {
        state.toggleLabel = label || 'Download';

        const panel = document.getElementById(PANEL_ID);
        const toggle = document.getElementById(PANEL_TOGGLE_ID);
        const nextDisabled = Boolean(disabled);

        if (panel) {
            panel.dataset.mode = mode;
            panel.dataset.disabled = nextDisabled ? 'true' : 'false';
        }

        if (toggle) {
            if (toggle.disabled !== nextDisabled) {
                toggle.disabled = nextDisabled;
            }

            const title = [state.toggleLabel, state.lastStatus].filter(Boolean).join('\n');
            toggle.title = title;
            toggle.setAttribute('aria-label', title || state.toggleLabel);
        }
    }

    // Network data capture.
    function shouldInspectNetworkPayload(url, contentType = '') {
        const urlText = String(url || '');
        const typeText = String(contentType || '').toLowerCase();

        if (!urlText.startsWith(location.origin)) {
            return false;
        }

        if (typeText.includes('json')) {
            return true;
        }

        return /(aweme|detail|feed|post|video|item)/i.test(urlText);
    }

    function installNetworkHooks() {
        if (state.networkHookInstalled) {
            return;
        }

        state.networkHookInstalled = true;

        const originalFetch = window.fetch.bind(window);
        window.fetch = async function () {
            const response = await originalFetch(...arguments);

            try {
                const request = arguments[0];
                const requestUrl = typeof request === 'string'
                    ? request
                    : request?.url || '';
                const contentType = response.headers?.get('content-type') || '';

                if (shouldInspectNetworkPayload(requestUrl, contentType)) {
                    response.clone().text().then((text) => {
                        maybeCacheStructuredDataResponse(text);
                    }).catch(() => {
                        // Ignore clone parsing failures.
                    });
                }
            } catch (error) {
                // Ignore hook failures.
            }

            return response;
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__douyinDownloaderUrl = url;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', function () {
                try {
                    const url = typeof this.__douyinDownloaderUrl === 'string' ? this.__douyinDownloaderUrl : '';
                    const contentType = this.getResponseHeader('content-type') || '';
                    if (!shouldInspectNetworkPayload(url, contentType)) {
                        return;
                    }

                    maybeCacheStructuredDataResponse(this.responseText || '');
                } catch (error) {
                    // Ignore hook failures.
                }
            });

            return originalSend.apply(this, arguments);
        };
    }

    // Floating action button and page observation.
    function setMode(mode) {
        state.mode = mode;
    }

    function isBusy() {
        return state.mode !== 'idle';
    }

    function getToggleIconMarkup() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10"></path><path d="M8.5 11.5 12 15l3.5-3.5"></path><path d="M6 18h12"></path></svg>';
    }

    function clampPanelTop(value) {
        const maxTop = Math.max(PANEL_EDGE_OFFSET, window.innerHeight - PANEL_TOGGLE_SIZE - PANEL_EDGE_OFFSET);
        return Math.min(Math.max(Math.round(value), PANEL_EDGE_OFFSET), maxTop);
    }

    function getDefaultPanelTop() {
        return clampPanelTop((window.innerHeight - PANEL_TOGGLE_SIZE) / 2);
    }

    function loadSavedPanelTop() {
        try {
            const raw = window.localStorage.getItem(PANEL_POSITION_KEY);
            const value = Number(raw);
            return Number.isFinite(value) ? clampPanelTop(value) : getDefaultPanelTop();
        } catch (error) {
            return getDefaultPanelTop();
        }
    }

    function savePanelTop() {
        try {
            window.localStorage.setItem(PANEL_POSITION_KEY, String(state.panelTop));
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function applyPanelPosition() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) {
            return;
        }

        if (state.panelTop === null) {
            state.panelTop = loadSavedPanelTop();
        }

        panel.style.top = `${clampPanelTop(state.panelTop)}px`;
    }

    function startPanelDrag(event) {
        const toggle = document.getElementById(PANEL_TOGGLE_ID);
        const panel = document.getElementById(PANEL_ID);

        if (!toggle || !panel) {
            return;
        }

        state.pointerDrag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startTop: state.panelTop ?? loadSavedPanelTop(),
            moved: false,
        };

        panel.classList.add('is-dragging');
        toggle.setPointerCapture(event.pointerId);
    }

    function movePanelDrag(event) {
        if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId) {
            return;
        }

        const deltaY = event.clientY - state.pointerDrag.startY;
        if (Math.abs(deltaY) >= PANEL_DRAG_THRESHOLD) {
            state.pointerDrag.moved = true;
        }

        state.panelTop = clampPanelTop(state.pointerDrag.startTop + deltaY);
        applyPanelPosition();
    }

    function endPanelDrag(event) {
        if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId) {
            return;
        }

        const toggle = document.getElementById(PANEL_TOGGLE_ID);
        const panel = document.getElementById(PANEL_ID);
        const moved = state.pointerDrag.moved;

        if (toggle?.hasPointerCapture(event.pointerId)) {
            toggle.releasePointerCapture(event.pointerId);
        }

        if (panel) {
            panel.classList.remove('is-dragging');
        }

        savePanelTop();
        state.pointerDrag = null;

        if (!moved) {
            void runPrimaryAction();
        }
    }

    function isInsidePanel(node) {
        if (!(node instanceof Node)) {
            return false;
        }

        const panel = document.getElementById(PANEL_ID);
        return Boolean(panel && panel.contains(node));
    }

    function scheduleRefresh(delay = REFRESH_DEBOUNCE_MS) {
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
        }

        state.refreshTimer = window.setTimeout(() => {
            state.refreshTimer = null;
            refreshUI();
        }, delay);
    }

    function mutationNeedsRefresh(mutation) {
        if (!mutation) {
            return false;
        }

        if (isInsidePanel(mutation.target)) {
            return false;
        }

        if (mutation.type === 'childList') {
            const added = Array.from(mutation.addedNodes || []);
            const removed = Array.from(mutation.removedNodes || []);

            return [...added, ...removed].some((node) => !isInsidePanel(node));
        }

        return false;
    }

    // Current-page video detection and naming.
    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 120 && rect.height > 120 && rect.bottom > 0 && rect.right > 0;
    }

    function scoreVideo(video) {
        if (!(video instanceof HTMLVideoElement)) {
            return -1;
        }

        let score = 0;
        const rect = video.getBoundingClientRect();
        const areaScore = Math.min((rect.width * rect.height) / 20000, 60);

        if (video.currentSrc) {
            score += 120;
        }

        if (!video.paused && !video.ended) {
            score += 90;
        }

        if (video.autoplay) {
            score += 40;
        }

        if (document.pictureInPictureElement === video) {
            score += 40;
        }

        if (isVisible(video)) {
            score += 30;
        }

        score += areaScore;
        return score;
    }

    function findBestVideo() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (!videos.length) {
            return null;
        }

        return videos
            .map((video) => ({ video, score: scoreVideo(video) }))
            .sort((left, right) => right.score - left.score)[0]?.video || null;
    }

    function collectRoots(startNode) {
        const roots = [];
        let current = startNode;
        let depth = 0;

        while (current && depth < 12) {
            roots.push(current);
            current = current.parentElement;
            depth += 1;
        }

        roots.push(document);
        return roots;
    }

    function readElementText(element) {
        if (!element) {
            return '';
        }

        if (element instanceof HTMLMetaElement) {
            return normalizeText(element.content);
        }

        return normalizeText(element.textContent);
    }

    function pickText(roots, selectors, filter) {
        for (const root of roots) {
            if (!root || typeof root.querySelectorAll !== 'function') {
                continue;
            }

            for (const selector of selectors) {
                const matches = Array.from(root.querySelectorAll(selector));
                for (const element of matches) {
                    const text = readElementText(element);
                    if (!text) {
                        continue;
                    }

                    if (!filter || filter(text, element)) {
                        return text;
                    }
                }
            }
        }

        return '';
    }

    function pickNearbyText(roots, scorer) {
        const seen = new Set();
        let bestText = '';
        let bestScore = -1;

        for (const root of roots) {
            if (!(root instanceof HTMLElement)) {
                continue;
            }

            const elements = [root, ...Array.from(root.querySelectorAll('a, p, span, div'))].slice(0, 220);
            for (const element of elements) {
                const text = readTextValue(element);
                if (!text || seen.has(text)) {
                    continue;
                }

                seen.add(text);
                const score = scorer(text);
                if (score > bestScore) {
                    bestScore = score;
                    bestText = text;
                }
            }
        }

        return bestText;
    }

    function extractMetaFromVideo(video) {
        const roots = collectRoots(video);
        const title = pickText(roots, titleSelectors, (text) => {
            return scoreTitleCandidate(text) >= 0;
        }) || pickNearbyText(roots.filter((root) => root !== document), scoreTitleCandidate);

        const author = pickText(roots, authorSelectors, (text, element) => {
            if (scoreAuthorCandidate(text) < 0) {
                return false;
            }

            if (element.tagName === 'A' && !element.getAttribute('href')) {
                return false;
            }

            return true;
        }) || pickNearbyText(roots.filter((root) => root !== document), scoreAuthorCandidate);

        return {
            title: sanitizeFilenamePart(title, TITLE_FALLBACK),
            author: sanitizeFilenamePart(author, AUTHOR_FALLBACK),
        };
    }

    function extractVideoId(value) {
        if (typeof value !== 'string' || !value) {
            return '';
        }

        const match = value.match(/(?:modal_id=|vid=|\/video\/)(\d{8,})/);
        return match ? match[1] : '';
    }

    function buildBaseFilename(meta) {
        const compactTitle = compactTitleForFilename(meta.title);
        const compactAuthor = compactAuthorForFilename(meta.author);
        return sanitizeFilenamePart(`${compactTitle}_${compactAuthor}`, TITLE_FALLBACK);
    }

    function buildFilename(meta, options = {}) {
        const base = buildBaseFilename(meta);
        const videoId = sanitizeFilenamePart(options.videoId || '', '');
        const suffix = sanitizeFilenamePart(options.suffix || '', '');

        if (videoId) {
            return `${base}_${videoId}.mp4`;
        }

        if (suffix) {
            return `${base}_${suffix}.mp4`;
        }

        return `${base}.mp4`;
    }

    function buildUniqueBatchFilenames(entries) {
        const filenames = new Map();
        const usedNames = new Set();
        const groups = new Map();

        for (const entry of entries) {
            const base = buildBaseFilename(entry.meta);
            if (!groups.has(base)) {
                groups.set(base, 0);
            }
            groups.set(base, groups.get(base) + 1);
        }

        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            const base = buildBaseFilename(entry.meta);
            const orderPrefix = String(index + 1).padStart(3, '0');
            const duplicateCount = groups.get(base) || 0;
            let candidate = `${orderPrefix}_${base}.mp4`;

            if (duplicateCount > 1 && entry.videoId) {
                candidate = `${orderPrefix}_${buildFilename(entry.meta, { videoId: entry.videoId }).replace(/\.mp4$/i, '')}.mp4`;
            }

            if (usedNames.has(candidate)) {
                let suffixIndex = 2;
                let fallback = `${orderPrefix}_${buildFilename(entry.meta, {
                    suffix: String(suffixIndex).padStart(2, '0'),
                }).replace(/\.mp4$/i, '')}.mp4`;

                while (usedNames.has(fallback)) {
                    suffixIndex += 1;
                    fallback = `${orderPrefix}_${buildFilename(entry.meta, {
                        suffix: String(suffixIndex).padStart(2, '0'),
                    }).replace(/\.mp4$/i, '')}.mp4`;
                }

                candidate = fallback;
            }

            usedNames.add(candidate);
            filenames.set(entry.id, candidate);
        }

        return filenames;
    }

    function isDirectHttpVideoUrl(value) {
        return typeof value === 'string' && /^https?:\/\//i.test(value);
    }

    function getVideoCandidateUrls(video) {
        const candidates = [];
        const sourceElements = Array.from(video?.querySelectorAll?.('source') || []);
        const pushCandidate = (value) => {
            if (!value || typeof value !== 'string') {
                return;
            }

            const trimmed = value.trim();
            if (!trimmed || candidates.includes(trimmed)) {
                return;
            }

            candidates.push(trimmed);
        };

        pushCandidate(video?.currentSrc);
        pushCandidate(video?.src);

        for (const source of sourceElements) {
            pushCandidate(source.src);
            pushCandidate(source.getAttribute('src'));
        }

        return candidates;
    }

    function pickDirectVideoUrl(video) {
        return getVideoCandidateUrls(video).find(isDirectHttpVideoUrl) || '';
    }

    function triggerBrowserDownload(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = blobUrl;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 1500);
    }

    function gmDownload(url, filename, onProgress) {
        if (typeof GM_download !== 'function') {
            return Promise.reject(new Error('GM_download is unavailable'));
        }

        return new Promise((resolve, reject) => {
            GM_download({
                url,
                name: filename,
                saveAs: false,
                onload: resolve,
                onprogress: (event) => {
                    if (typeof onProgress !== 'function') {
                        return;
                    }

                    onProgress({
                        phase: 'downloading',
                        loaded: Number(event?.loaded) || 0,
                        total: Number(event?.total) || 0,
                    });
                },
                onerror: (error) => {
                    reject(new Error(error?.error || 'GM_download failed'));
                },
                ontimeout: () => {
                    reject(new Error('GM_download timeout'));
                },
            });
        });
    }

    async function downloadVideoUrl(videoUrl, filename, onProgress) {
        if (typeof onProgress === 'function') {
            onProgress({
                phase: 'requesting',
                loaded: 0,
                total: 0,
            });
        }

        if (typeof GM_download === 'function') {
            try {
                await gmDownload(videoUrl, filename, onProgress);
                return;
            } catch (error) {
                console.warn('[Douyin Downloader] GM_download failed, falling back to fetch.', error);
            }
        }

        const response = await fetch(videoUrl, {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const total = Number(response.headers.get('content-length')) || 0;

        if (!response.body || typeof response.body.getReader !== 'function') {
            const blob = await response.blob();
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'downloading',
                    loaded: blob.size,
                    total: total || blob.size,
                });
            }

            if (!blob.size) {
                throw new Error('Empty response body');
            }

            triggerBrowserDownload(blob, filename);
            return;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            if (value) {
                chunks.push(value);
                loaded += value.byteLength;
                if (typeof onProgress === 'function') {
                    onProgress({
                        phase: 'downloading',
                        loaded,
                        total,
                    });
                }
            }
        }

        const blob = new Blob(chunks, {
            type: response.headers.get('content-type') || 'video/mp4',
        });
        if (!blob.size) {
            throw new Error('Empty response body');
        }

        triggerBrowserDownload(blob, filename);
    }

    function normalizeVideoPageUrl(href) {
        if (!href) {
            return '';
        }

        try {
            const url = new URL(href, location.href);
            if (url.origin !== location.origin) {
                return '';
            }

            const modalId = url.searchParams.get('modal_id');
            if (modalId && /^\d+$/.test(modalId)) {
                return `${location.origin}/video/${modalId}`;
            }

            const videoMatch = url.pathname.match(/\/video\/(\d+)/);
            if (videoMatch) {
                return `${location.origin}/video/${videoMatch[1]}`;
            }
        } catch (error) {
            console.warn('[Douyin Downloader] Failed to normalize profile link.', error);
        }

        return '';
    }

    // Profile-card metadata extraction.
    function getProfilePageAuthor() {
        const title = normalizeText(document.title)
            .replace(/\s*-\s*\u6296\u97f3$/, '')
            .replace(/\u7684\u6296\u97f3$/, '')
            .trim();

        if (scoreAuthorCandidate(title) >= 0) {
            return sanitizeFilenamePart(title, '');
        }

        return '';
    }

    function cleanProfileCardLine(line) {
        return normalizeText(line)
            .replace(/^\d+(?:\.\d+)?(?:w|k|\u4e07|\u4ebf)?\s*/i, '')
            .replace(/^\u521a\u521a\u770b\u8fc7\s*/i, '')
            .replace(/^\u7c89\u4e1d\u6307\u6570\s*/i, '')
            .trim();
    }

    function collectProfileCardTextCandidates(anchor) {
        const card = anchor?.closest('li') || anchor?.closest('article') || anchor?.parentElement || anchor;
        const rawTexts = [
            readRawTextValue(anchor),
            readRawTextValue(card),
        ];
        const seen = new Set();
        const lines = [];

        for (const rawText of rawTexts) {
            if (!rawText) {
                continue;
            }

            for (const line of rawText.split('\n').map(cleanProfileCardLine)) {
                if (!line || seen.has(line) || isLikelyCountText(line) || isBadProfileMetaText(line)) {
                    continue;
                }

                seen.add(line);
                lines.push(line);
            }
        }

        return lines;
    }

    function extractMetaFromProfileCard(anchor) {
        const lines = collectProfileCardTextCandidates(anchor);
        const title = pickBestCandidate(lines, scoreTitleCandidate);
        const author = getProfilePageAuthor() || pickBestCandidate(lines, scoreAuthorCandidate);

        return {
            title: sanitizeFilenamePart(title, ''),
            author: sanitizeFilenamePart(author, ''),
        };
    }

    function chooseBetterMeta(primaryMeta = {}, fallbackMeta = {}) {
        const primaryTitleScore = scoreTitleCandidate(primaryMeta.title || '');
        const fallbackTitleScore = scoreTitleCandidate(fallbackMeta.title || '');
        const primaryAuthorScore = scoreAuthorCandidate(primaryMeta.author || '');
        const fallbackAuthorScore = scoreAuthorCandidate(fallbackMeta.author || '');

        return {
            title: primaryTitleScore >= fallbackTitleScore
                ? (primaryMeta.title || fallbackMeta.title || TITLE_FALLBACK)
                : (fallbackMeta.title || primaryMeta.title || TITLE_FALLBACK),
            author: primaryAuthorScore >= fallbackAuthorScore
                ? (primaryMeta.author || fallbackMeta.author || AUTHOR_FALLBACK)
                : (fallbackMeta.author || primaryMeta.author || AUTHOR_FALLBACK),
        };
    }

    function collectProfileVideoLinks() {
        const links = new Set();
        const candidates = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="modal_id="]'));

        for (const anchor of candidates) {
            const normalized = normalizeVideoPageUrl(anchor.getAttribute('href') || '');
            if (normalized) {
                links.add(normalized);
            }
        }

        return Array.from(links);
    }

    function collectProfileVideoEntries() {
        const entries = [];
        const seen = new Set();
        const candidates = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="modal_id="]'));

        for (const anchor of candidates) {
            const normalized = normalizeVideoPageUrl(anchor.getAttribute('href') || '');
            if (!normalized || seen.has(normalized)) {
                continue;
            }

            seen.add(normalized);
            entries.push({
                pageUrl: normalized,
                meta: extractMetaFromProfileCard(anchor),
            });
        }

        return entries;
    }

    function isLikelyProfilePage() {
        if (/\/user\//.test(location.pathname) && !/\/video\//.test(location.pathname)) {
            return true;
        }

        return collectProfileVideoLinks().length >= 3;
    }

    // Structured data parsing and caching.
    function tryDecodeURIComponent(raw) {
        try {
            return decodeURIComponent(raw);
        } catch (error) {
            return raw;
        }
    }

    function parseCandidateJson(rawText) {
        const raw = (rawText || '').trim();
        if (!raw) {
            return null;
        }

        const candidates = [raw];

        if (/^["']/.test(raw)) {
            try {
                const parsedString = JSON.parse(raw);
                if (typeof parsedString === 'string') {
                    candidates.push(parsedString);
                }
            } catch (error) {
                // Ignore malformed string wrappers.
            }
        }

        if (raw.startsWith('%7B') || raw.startsWith('%5B')) {
            candidates.push(tryDecodeURIComponent(raw));
        }

        const equalIndex = raw.indexOf('=');
        if (equalIndex !== -1) {
            const assignedValue = raw.slice(equalIndex + 1).trim().replace(/;$/, '');
            if (assignedValue) {
                candidates.push(assignedValue);
            }
        }

        for (const candidate of candidates) {
            const trimmed = candidate.trim();
            const expandedCandidates = [trimmed];

            if (trimmed.startsWith('%7B') || trimmed.startsWith('%5B')) {
                expandedCandidates.push(tryDecodeURIComponent(trimmed));
            }

            for (const expanded of expandedCandidates) {
                const normalized = expanded.trim();
                if (!/^[\[{]/.test(normalized)) {
                    continue;
                }

                try {
                    return JSON.parse(normalized);
                } catch (error) {
                    // Ignore and keep searching other scripts.
                }
            }
        }

        return null;
    }

    function looksLikeVideoUrl(key, value) {
        if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
            return false;
        }

        const loweredValue = value.toLowerCase();
        if (
            !loweredValue.includes('.mp4') &&
            !loweredValue.includes('douyinvod') &&
            !loweredValue.includes('/play') &&
            !loweredValue.includes('video/tos')
        ) {
            return false;
        }

        const loweredKey = String(key || '').toLowerCase();
        if (loweredKey.includes('cover') || loweredKey.includes('poster') || loweredKey.includes('avatar')) {
            return false;
        }

        return true;
    }

    function scoreVideoUrl(key, value) {
        const loweredKey = String(key || '').toLowerCase();
        const loweredValue = value.toLowerCase();
        let score = 0;

        if (loweredKey.includes('download')) {
            score += 90;
        }

        if (loweredKey.includes('play')) {
            score += 70;
        }

        if (loweredKey.includes('url') || loweredKey.includes('src')) {
            score += 20;
        }

        if (loweredValue.includes('.mp4')) {
            score += 40;
        }

        if (loweredValue.includes('douyinvod')) {
            score += 25;
        }

        if (loweredValue.includes('video/tos')) {
            score += 20;
        }

        if (loweredValue.includes('playwm')) {
            score -= 40;
        }

        return score;
    }

    function isTitleKey(key) {
        return /(title|desc|description|sharetitle)/i.test(String(key || ''));
    }

    function isAuthorKey(key) {
        return /(author|nickname|uniqueid|name)/i.test(String(key || ''));
    }

    function normalizeVideoId(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const text = String(value).trim();
        if (!text) {
            return '';
        }

        const extracted = extractVideoId(text);
        if (extracted) {
            return extracted;
        }

        return /^\d{8,}$/.test(text) ? text : '';
    }

    function pickBestCandidate(candidates, scorer) {
        let bestValue = '';
        let bestScore = -1;

        for (const candidate of candidates) {
            const value = normalizeText(candidate);
            if (!value) {
                continue;
            }

            const score = scorer(value);
            if (score > bestScore) {
                bestScore = score;
                bestValue = value;
            }
        }

        return bestValue;
    }

    function collectStructuredUrlCandidates(value, bucket, key = 'url') {
        if (!value) {
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                collectStructuredUrlCandidates(item, bucket, key);
            }
            return;
        }

        if (typeof value === 'string') {
            if (looksLikeVideoUrl(key, value)) {
                bucket.push({
                    value,
                    score: scoreVideoUrl(key, value),
                });
            }
            return;
        }

        if (typeof value !== 'object') {
            return;
        }

        for (const [childKey, childValue] of Object.entries(value)) {
            collectStructuredUrlCandidates(childValue, bucket, childKey);
        }
    }

    function hasStructuredVideoPayload(node) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            return false;
        }

        return Boolean(
            node.play_addr ||
            node.playAddr ||
            node.download_addr ||
            node.downloadAddr ||
            node.play_url ||
            node.playUrl ||
            node.download_url ||
            node.downloadUrl ||
            node.video ||
            node.media
        );
    }

    function getNodeVideoIdCandidates(node) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            return [];
        }

        return [
            node.aweme_id,
            node.awemeId,
            node.item_id,
            node.itemId,
            node.group_id,
            node.groupId,
            node.video_id,
            node.videoId,
            node.modal_id,
            node.modalId,
        ].map(normalizeVideoId).filter(Boolean);
    }

    function buildStructuredVideoRecord(node) {
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            return null;
        }

        const titleCandidates = [
            node.desc,
            node.description,
            node.title,
            node.titleText,
            node.share_title,
            node.shareTitle,
            node.content,
            node.video_title,
            node.videoTitle,
            node.status_desc,
            node.statusDesc,
            node.text,
            node.awemeTitle,
            node.itemTitle,
        ];

        const authorSource = node.author || node.user || node.authorInfo || node.user_info || node.userInfo || {};
        const authorCandidates = [
            authorSource.nickname,
            authorSource.unique_id,
            authorSource.uniqueId,
            authorSource.short_id,
            authorSource.shortId,
            node.author_name,
            node.authorName,
            node.nickname,
            node.unique_id,
            node.uniqueId,
        ];

        const videoIdCandidates = [
            ...getNodeVideoIdCandidates(node),
            normalizeVideoId(authorSource.aweme_id),
        ].filter(Boolean);

        const urlCandidates = [];
        collectStructuredUrlCandidates(node.play_addr, urlCandidates, 'play_addr');
        collectStructuredUrlCandidates(node.playAddr, urlCandidates, 'playAddr');
        collectStructuredUrlCandidates(node.download_addr, urlCandidates, 'download_addr');
        collectStructuredUrlCandidates(node.downloadAddr, urlCandidates, 'downloadAddr');
        collectStructuredUrlCandidates(node.play_url, urlCandidates, 'play_url');
        collectStructuredUrlCandidates(node.playUrl, urlCandidates, 'playUrl');
        collectStructuredUrlCandidates(node.download_url, urlCandidates, 'download_url');
        collectStructuredUrlCandidates(node.downloadUrl, urlCandidates, 'downloadUrl');
        collectStructuredUrlCandidates(node.video, urlCandidates, 'video');
        collectStructuredUrlCandidates(node.media, urlCandidates, 'media');

        const title = pickBestCandidate(titleCandidates, scoreTitleCandidate);
        const author = pickBestCandidate(authorCandidates, scoreAuthorCandidate);
        const videoId = videoIdCandidates.map(normalizeVideoId).find(Boolean) || '';
        const videoUrl = urlCandidates
            .sort((left, right) => right.score - left.score)
            .map((item) => item.value)[0] || '';

        const hasStrongMeta = Boolean(title && title !== TITLE_FALLBACK);
        const hasStrongAuthor = Boolean(author && author !== AUTHOR_FALLBACK);
        const hasPayload = hasStructuredVideoPayload(node);

        if (!title && !author && !videoId && !videoUrl) {
            return null;
        }

        if (!videoUrl && !(videoId && hasStrongMeta && (hasStrongAuthor || hasPayload))) {
            return null;
        }

        return {
            videoId,
            videoUrl,
            meta: {
                title: sanitizeFilenamePart(title, TITLE_FALLBACK),
                author: sanitizeFilenamePart(author, AUTHOR_FALLBACK),
            },
        };
    }

    function scoreStructuredVideoRecord(record) {
        if (!record) {
            return -1;
        }

        let score = 0;

        if (record.videoId) {
            score += 30;
        }

        if (record.videoUrl) {
            score += 45;
        }

        if (record.meta?.title && record.meta.title !== TITLE_FALLBACK) {
            score += 20;
        }

        if (record.meta?.author && record.meta.author !== AUTHOR_FALLBACK) {
            score += 10;
        }

        return score;
    }

    function collectStructuredVideoRecords(node, records, seen) {
        if (node === null || node === undefined) {
            return;
        }

        if (typeof node !== 'object') {
            return;
        }

        if (seen.has(node)) {
            return;
        }

        seen.add(node);

        if (Array.isArray(node)) {
            for (const item of node) {
                collectStructuredVideoRecords(item, records, seen);
            }
            return;
        }

        const record = buildStructuredVideoRecord(node);
        if (record) {
            records.push(record);
        }

        for (const value of Object.values(node)) {
            collectStructuredVideoRecords(value, records, seen);
        }
    }

    function findStructuredVideoRecordsById(node, targetVideoId, records, seen) {
        if (node === null || node === undefined) {
            return;
        }

        if (typeof node !== 'object') {
            return;
        }

        if (seen.has(node)) {
            return;
        }

        seen.add(node);

        if (Array.isArray(node)) {
            for (const item of node) {
                findStructuredVideoRecordsById(item, targetVideoId, records, seen);
            }
            return;
        }

        const nodeIds = getNodeVideoIdCandidates(node);
        if (nodeIds.includes(targetVideoId)) {
            const record = buildStructuredVideoRecord(node);
            if (record) {
                records.push({
                    ...record,
                    videoId: record.videoId || targetVideoId,
                });
            }
        }

        for (const value of Object.values(node)) {
            findStructuredVideoRecordsById(value, targetVideoId, records, seen);
        }
    }

    function mergeStructuredVideoRecords(records) {
        const merged = new Map();

        for (const record of records) {
            const key = record.videoId || record.videoUrl || `${record.meta.title}_${record.meta.author}`;
            const existing = merged.get(key);

            if (!existing || scoreStructuredVideoRecord(record) > scoreStructuredVideoRecord(existing)) {
                merged.set(key, record);
            }
        }

        return Array.from(merged.values());
    }

    function cacheStructuredVideoRecords(records) {
        const mergedRecords = mergeStructuredVideoRecords(records);

        for (const record of mergedRecords) {
            const key = record.videoId || record.videoUrl;
            if (!key) {
                continue;
            }

            const existing = state.videoDataCache.get(key);
            if (!existing || scoreStructuredVideoRecord(record) > scoreStructuredVideoRecord(existing)) {
                state.videoDataCache.set(key, record);
            }
        }

        state.videoDataRecords = mergeStructuredVideoRecords([
            ...state.videoDataRecords,
            ...mergedRecords,
        ]).slice(-200);
    }

    function getStructuredVideoRecord(videoId = '', videoUrl = '') {
        const normalizedId = normalizeVideoId(videoId);

        if (normalizedId && state.videoDataCache.has(normalizedId)) {
            return state.videoDataCache.get(normalizedId);
        }

        if (videoUrl && state.videoDataCache.has(videoUrl)) {
            return state.videoDataCache.get(videoUrl);
        }

        if (normalizedId) {
            const byId = state.videoDataRecords.find((record) => record.videoId === normalizedId);
            if (byId) {
                return byId;
            }
        }

        if (videoUrl) {
            const byUrl = state.videoDataRecords.find((record) => record.videoUrl === videoUrl);
            if (byUrl) {
                return byUrl;
            }
        }

        return null;
    }

    function collectStructuredVideoRecordsFromData(data) {
        const records = [];
        collectStructuredVideoRecords(data, records, new WeakSet());
        return mergeStructuredVideoRecords(records);
    }

    function findStructuredVideoRecordInData(data, targetVideoId = '') {
        const normalizedId = normalizeVideoId(targetVideoId);
        if (!normalizedId || !data || typeof data !== 'object') {
            return null;
        }

        const records = [];
        findStructuredVideoRecordsById(data, normalizedId, records, new WeakSet());
        return mergeStructuredVideoRecords(records)
            .sort((left, right) => scoreStructuredVideoRecord(right) - scoreStructuredVideoRecord(left))[0] || null;
    }

    function parseStructuredDataText(rawText, targetVideoId = '') {
        if (!rawText || rawText.length < 2) {
            return {
                records: [],
                exactRecord: null,
            };
        }

        const data = parseCandidateJson(rawText);
        if (!data || typeof data !== 'object') {
            return {
                records: [],
                exactRecord: null,
            };
        }

        return {
            records: collectStructuredVideoRecordsFromData(data),
            exactRecord: findStructuredVideoRecordInData(data, targetVideoId),
        };
    }

    function primeStructuredDataCacheFromDocument(doc, targetVideoId = '') {
        const scripts = Array.from(doc.querySelectorAll('script'));
        const records = [];
        let exactRecord = null;

        for (const script of scripts) {
            const rawText = script.textContent || '';
            if (rawText.length < 20) {
                continue;
            }

            const result = parseStructuredDataText(rawText, targetVideoId);
            records.push(...result.records);
            if (!exactRecord && result.exactRecord) {
                exactRecord = result.exactRecord;
            }
        }

        if (records.length) {
            cacheStructuredVideoRecords(records);
        }

        return exactRecord;
    }

    function maybeCacheStructuredDataResponse(rawText) {
        const records = parseStructuredDataText(rawText).records;
        if (records.length) {
            cacheStructuredVideoRecords(records);
        }
    }

    function collectJsonInsights(node, bucket, parentKey, seen) {
        if (node === null || node === undefined) {
            return;
        }

        if (typeof node === 'string') {
            const text = node.trim();
            if (!text) {
                return;
            }

            if (looksLikeVideoUrl(parentKey, text)) {
                bucket.videoUrls.push({
                    value: text,
                    score: scoreVideoUrl(parentKey, text),
                });
            }

            if (isTitleKey(parentKey)) {
                const title = sanitizeFilenamePart(text, '');
                if (title && scoreTitleCandidate(title) >= 0) {
                    bucket.titles.push(title);
                }
            }

            if (isAuthorKey(parentKey)) {
                const author = sanitizeFilenamePart(text, '');
                if (author && scoreAuthorCandidate(author) >= 0) {
                    bucket.authors.push(author);
                }
            }

            return;
        }

        if (typeof node !== 'object') {
            return;
        }

        if (seen.has(node)) {
            return;
        }

        seen.add(node);

        if (Array.isArray(node)) {
            for (const item of node) {
                collectJsonInsights(item, bucket, parentKey, seen);
            }
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            collectJsonInsights(value, bucket, key, seen);
        }
    }

    function extractMetaFromDocument(doc) {
        const titleCandidates = [
            readTextValue(doc.querySelector('h1')),
            readTextValue(doc.querySelector('[data-e2e="video-desc"]')),
            readTextValue(doc.querySelector('[data-e2e="feed-active-video-desc"]')),
            readTextValue(doc.querySelector('meta[property="og:title"]')),
            readTextValue(doc.querySelector('meta[name="description"]')),
            normalizeText(doc.title),
        ];

        const authorCandidates = [
            readTextValue(doc.querySelector('[data-e2e="user-name"]')),
            readTextValue(doc.querySelector('[data-e2e="video-author-name"]')),
            readTextValue(doc.querySelector('[data-e2e="video-author-uniqueid"]')),
            readTextValue(doc.querySelector('a[href*="/user/"]')),
            readTextValue(doc.querySelector('meta[name="author"]')),
        ];

        const title = titleCandidates.find((candidate) => scoreTitleCandidate(candidate) >= 0) || '';
        const author = authorCandidates.find((candidate) => scoreAuthorCandidate(candidate) >= 0) || '';

        return {
            title: sanitizeFilenamePart(title, TITLE_FALLBACK),
            author: sanitizeFilenamePart(author, AUTHOR_FALLBACK),
        };
    }

    function pickBestVideoUrl(videoUrls) {
        return videoUrls
            .sort((left, right) => right.score - left.score)
            .map((item) => item.value)[0] || '';
    }

    function extractVideoEntryFromHtml(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const meta = extractMetaFromDocument(doc);
        const scripts = Array.from(doc.querySelectorAll('script'));
        const bucket = {
            videoUrls: [],
            titles: [],
            authors: [],
        };

        for (const script of scripts) {
            const rawText = script.textContent || '';
            if (rawText.length < 20) {
                continue;
            }

            const data = parseCandidateJson(rawText);
            if (!data) {
                continue;
            }

            collectJsonInsights(data, bucket, '', new WeakSet());
        }

        const title = bucket.titles.find(Boolean) || meta.title;
        const author = bucket.authors.find(Boolean) || meta.author;
        const videoUrl = pickBestVideoUrl(bucket.videoUrls);

        return {
            videoUrl,
            meta: {
                title: sanitizeFilenamePart(title, TITLE_FALLBACK),
                author: sanitizeFilenamePart(author, AUTHOR_FALLBACK),
            },
        };
    }

    function extractVideoEntryFromCurrentDocument() {
        const currentHtml = document.documentElement?.outerHTML || '';
        if (!currentHtml) {
            return null;
        }

        const entry = extractVideoEntryFromHtml(currentHtml);
        if (!entry.videoUrl) {
            return null;
        }

        return entry;
    }

    async function resolveVideoEntry(videoPageUrl) {
        const targetVideoId = extractVideoId(videoPageUrl);
        const cachedBeforeFetch = getStructuredVideoRecord(targetVideoId, '');
        if (cachedBeforeFetch?.videoUrl) {
            return cachedBeforeFetch;
        }

        const response = await fetch(videoPageUrl, {
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`Page request failed with HTTP ${response.status}`);
        }

        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const exactRecord = primeStructuredDataCacheFromDocument(doc, targetVideoId);
        if (exactRecord?.videoUrl) {
            return exactRecord;
        }

        const cachedAfterParse = getStructuredVideoRecord(targetVideoId, '');
        if (cachedAfterParse?.videoUrl) {
            return cachedAfterParse;
        }

        const entry = extractVideoEntryFromHtml(htmlText);

        if (!entry.videoUrl) {
            throw new Error('Could not find a playable video URL on the page');
        }

        return entry;
    }

    // Download entry resolution.
    async function resolveCurrentVideoEntry() {
        const video = findBestVideo();
        const locationVideoId = extractVideoId(location.href);
        const directVideoUrl = pickDirectVideoUrl(video);

        const exactRecord = primeStructuredDataCacheFromDocument(document, locationVideoId);
        const cachedRecord = exactRecord || getStructuredVideoRecord(locationVideoId, directVideoUrl);
        const baseMeta = video ? extractMetaFromVideo(video) : buildFallbackMeta();

        const mergedMeta = chooseBetterMeta(
            baseMeta,
            cachedRecord?.meta || {}
        );

        if (directVideoUrl || cachedRecord?.videoUrl) {
            return {
                videoUrl: directVideoUrl || cachedRecord.videoUrl,
                meta: mergedMeta,
                videoId: locationVideoId || cachedRecord?.videoId || extractVideoId(directVideoUrl || cachedRecord?.videoUrl),
                source: directVideoUrl ? 'player' : 'cache',
            };
        }

        const currentDocumentEntry = extractVideoEntryFromCurrentDocument();
        if (currentDocumentEntry?.videoUrl) {
            return {
                videoUrl: currentDocumentEntry.videoUrl,
                meta: chooseBetterMeta(
                    currentDocumentEntry.meta || {},
                    mergedMeta
                ),
                videoId: locationVideoId || extractVideoId(currentDocumentEntry.videoUrl),
                source: 'current-page',
            };
        }

        const videoPageUrl = normalizeVideoPageUrl(location.href) || location.href;
        const resolved = await resolveVideoEntry(videoPageUrl);

        return {
            videoUrl: resolved.videoUrl,
            meta: chooseBetterMeta(
                mergedMeta,
                resolved.meta || {}
            ),
            videoId: locationVideoId || resolved.videoId || extractVideoId(videoPageUrl) || extractVideoId(resolved.videoUrl),
            source: 'page',
        };
    }

    function isProfileBatchPage() {
        return isLikelyProfilePage() && !normalizeVideoPageUrl(location.href);
    }

    // User-triggered workflows.
    async function runPrimaryAction() {
        if (isBusy()) {
            return;
        }

        if (isProfileBatchPage()) {
            await downloadProfileVideos();
            return;
        }

        await downloadActiveVideo();
    }

    async function downloadActiveVideo() {
        if (isBusy()) {
            return;
        }

        const video = findBestVideo();
        if (!video && !normalizeVideoPageUrl(location.href)) {
            refreshUI();
            return;
        }

        const initialMeta = video ? extractMetaFromVideo(video) : buildFallbackMeta();

        beginAction('single', 'Preparing video download', `Preparing download:\n${initialMeta.title}`);

        try {
            const entry = await resolveCurrentVideoEntry();
            const filename = buildFilename(entry.meta);

            const updateSingleDownloadProgress = (progress) => {
                const progressText = formatDownloadProgress(progress?.loaded || 0, progress?.total || 0);
                const percent = progress?.total
                    ? Math.max(0, Math.min(100, Math.round(((progress.loaded || 0) / progress.total) * 100)))
                    : 0;
                const label = percent > 0 ? `Downloading ${percent}%` : 'Downloading video';

                setPrimaryButtonState(label, true, 'single');
                setStatus([
                    `Downloading from ${entry.source}:`,
                    entry.meta.title,
                    progressText,
                ].join('\n'));
            };

            setPrimaryButtonState('Starting download', true, 'single');
            setStatus(`Starting download:\n${entry.meta.title}`);
            await downloadVideoUrl(entry.videoUrl, filename, updateSingleDownloadProgress);
            setStatus(`Saved:\n${filename}`);
        } catch (error) {
            console.error('[Douyin Downloader] Download failed.', error);
            setStatus(`Download failed:\n${error.message}`);
        } finally {
            finishAction();
        }
    }

    async function collectProfileVideoLinksWithAutoScroll() {
        const initialScrollTop = window.scrollY;
        const seen = new Map();
        const scroller = document.scrollingElement || document.documentElement;
        let stableRounds = 0;
        let previousCount = 0;
        let previousHeight = 0;

        for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
            const currentEntries = collectProfileVideoEntries();
            currentEntries.forEach((entry) => {
                seen.set(entry.pageUrl, entry);
            });
            const progressMessage = `Scanning profile page...\nLoaded links: ${seen.size}`;
            setStatus(progressMessage);
            if (state.batchModalLoading) {
                setBatchModalLoading(true, progressMessage);
            }

            const currentHeight = scroller.scrollHeight;
            if (seen.size === previousCount && currentHeight === previousHeight) {
                stableRounds += 1;
            } else {
                stableRounds = 0;
            }

            if (stableRounds >= MAX_STABLE_SCROLL_ROUNDS) {
                break;
            }

            previousCount = seen.size;
            previousHeight = currentHeight;
            window.scrollTo(0, scroller.scrollHeight);
            await wait(SCAN_DELAY_MS);
        }

        window.scrollTo(0, initialScrollTop);
        return Array.from(seen.values());
    }

    async function buildBatchEntriesFromLinks(links) {
        const entries = [];

        for (let index = 0; index < links.length; index += 1) {
            const linkEntry = links[index];
            const pageUrl = typeof linkEntry === 'string' ? linkEntry : linkEntry.pageUrl;
            const domMeta = typeof linkEntry === 'string' ? {} : (linkEntry.meta || {});
            const progressMessage = `Resolving videos...\n${index + 1}/${links.length}\n${pageUrl}`;
            setPrimaryButtonState(`Scanning ${index + 1}/${links.length}`, true, 'batch');
            setStatus(progressMessage);
            if (state.batchModalLoading) {
                setBatchModalLoading(true, progressMessage);
            }

            try {
                const entry = await resolveVideoEntry(pageUrl);
                entries.push({
                    id: `entry-${index}-${Date.now()}`,
                    pageUrl,
                    videoUrl: entry.videoUrl,
                    videoId: extractVideoId(pageUrl) || extractVideoId(entry.videoUrl),
                    meta: chooseBetterMeta(domMeta, entry.meta),
                    available: Boolean(entry.videoUrl),
                    selected: Boolean(entry.videoUrl),
                    error: '',
                });
            } catch (error) {
                console.error('[Douyin Downloader] Batch entry resolve failed.', pageUrl, error);
                entries.push({
                    id: `entry-${index}-${Date.now()}`,
                    pageUrl,
                    videoUrl: '',
                    videoId: extractVideoId(pageUrl),
                    meta: chooseBetterMeta(domMeta, {
                        title: `Video ${index + 1}`,
                        author: AUTHOR_FALLBACK,
                    }),
                    available: false,
                    selected: false,
                    error: error.message,
                });
            }

            await wait(120);
        }

        return entries;
    }

    async function startSelectedBatchDownload() {
        if (isBusy()) {
            return;
        }

        const selectedEntries = getSelectedBatchEntries();
        if (!selectedEntries.length) {
            updateBatchModalSummary();
            return;
        }

        closeBatchModal();
        beginAction('batch', `Batch 0/${selectedEntries.length}`, `Preparing selected batch...\n${selectedEntries.length} videos queued.`);

        try {
            let successCount = 0;
            const filenameMap = buildUniqueBatchFilenames(selectedEntries);

            for (let index = 0; index < selectedEntries.length; index += 1) {
                const entry = selectedEntries[index];
                setPrimaryButtonState(`Batch ${index + 1}/${selectedEntries.length}`, true, 'batch');
                setStatus(`Downloading ${index + 1}/${selectedEntries.length}...\n${entry.meta.title}`);

                try {
                    await downloadVideoUrl(entry.videoUrl, filenameMap.get(entry.id) || buildFilename(entry.meta));
                    successCount += 1;
                } catch (error) {
                    console.error('[Douyin Downloader] Selected batch item failed.', entry.pageUrl, error);
                    setStatus(`Skipped ${index + 1}/${selectedEntries.length}:\n${error.message}`);
                }

                await wait(BATCH_DELAY_MS);
            }

            setStatus(`Batch finished.\nDownloaded ${successCount}/${selectedEntries.length} selected videos.`);
        } catch (error) {
            console.error('[Douyin Downloader] Selected batch failed.', error);
            setStatus(`Batch failed:\n${error.message}`);
        } finally {
            finishAction();
        }
    }

    async function downloadProfileVideos() {
        if (isBusy()) {
            return;
        }

        if (!isLikelyProfilePage()) {
            setStatus('Open a Douyin profile page first, then use batch download.');
            refreshUI();
            return;
        }

        beginAction('batch', 'Scanning profile', 'Scanning profile page for video links...');
        closeBatchModal();
        setBatchEntries([]);
        setBatchModalLoading(false);

        let links = [];

        try {
            links = await collectProfileVideoLinksWithAutoScroll();
            if (!links.length) {
                throw new Error('No profile video links were found on this page');
            }

            const entries = await buildBatchEntriesFromLinks(links);
            setStatus(`Batch list ready.\nChoose the videos you want to download.`);
            openBatchModal(entries);
        } catch (error) {
            console.error('[Douyin Downloader] Batch download failed.', error);
            setBatchModalLoading(false);
            setStatus(`Batch failed:\n${error.message}`);
        } finally {
            finishAction();
        }
    }

    // UI refresh and bootstrapping.
    function isEditableTarget(target) {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    }

    function handleKeydown(event) {
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        if (isEditableTarget(event.target)) {
            return;
        }

        if ((event.key || '').toLowerCase() !== SHORTCUT_KEY) {
            return;
        }

        event.preventDefault();
        void downloadActiveVideo();
    }

    function buildIdleStatus() {
        const lines = [];
        const video = findBestVideo();
        const profileLinks = collectProfileVideoLinks();
        const videoPageUrl = normalizeVideoPageUrl(location.href);

        if (video && video.currentSrc) {
            const meta = extractMetaFromVideo(video);
            lines.push(`Current video: ${meta.title}`);
            lines.push(`Author: ${meta.author}`);
        } else if (videoPageUrl) {
            lines.push('Current video: detected from video page');
        } else {
            lines.push('Current video: not detected');
        }

        if (isLikelyProfilePage()) {
            lines.push(`Profile videos loaded: ${profileLinks.length}`);
            lines.push('Batch download will build a selectable list before downloading.');
        } else {
            lines.push('Open a Douyin profile page to enable batch download.');
        }

        return lines.join('\n');
    }

    function refreshUI() {
        if (isBusy()) {
            return;
        }

        const video = findBestVideo();
        const videoPageUrl = normalizeVideoPageUrl(location.href);
        const profileBatchPage = isProfileBatchPage();
        const loadedLinks = collectProfileVideoLinks().length;
        const hasVideoAction = (video && (pickDirectVideoUrl(video) || video.currentSrc)) || videoPageUrl;

        if (profileBatchPage) {
            const label = loadedLinks > 0 ? 'Batch download profile' : 'Scan profile videos';
            setPrimaryButtonState(label, false, 'batch');
        } else if (hasVideoAction) {
            setPrimaryButtonState('Download video', false, 'single');
        } else {
            setPrimaryButtonState('No downloadable content', true, 'single');
        }

        setStatus(buildIdleStatus());
    }

    function ensurePanel() {
        if (document.getElementById(PANEL_ID)) {
            return;
        }

        addStyleBlock(style);

        const panel = document.createElement('div');
        panel.id = PANEL_ID;

        const toggle = document.createElement('button');
        toggle.id = PANEL_TOGGLE_ID;
        toggle.type = 'button';
        toggle.innerHTML = getToggleIconMarkup();
        toggle.title = 'Download';
        toggle.setAttribute('aria-label', 'Download');
        toggle.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            startPanelDrag(event);
        });
        toggle.addEventListener('pointermove', (event) => {
            movePanelDrag(event);
        });
        toggle.addEventListener('pointerup', (event) => {
            endPanelDrag(event);
        });
        toggle.addEventListener('pointercancel', (event) => {
            endPanelDrag(event);
        });
        panel.appendChild(toggle);

        const status = document.createElement('div');
        status.id = PANEL_STATUS_ID;
        status.setAttribute('aria-live', 'polite');
        panel.appendChild(status);

        document.body.appendChild(panel);
        state.panelTop = loadSavedPanelTop();
        applyPanelPosition();
        setPrimaryButtonState('Download', false, 'single');
        setStatus('Waiting for Douyin content...');
    }

    function ensureBatchModal() {
        if (getBatchModal()) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = BATCH_MODAL_ID;
        modal.setAttribute('aria-hidden', 'true');

        const dialog = document.createElement('div');
        dialog.className = `${SCRIPT_ID}-dialog`;

        const head = document.createElement('div');
        head.className = `${SCRIPT_ID}-dialog-head`;

        const headText = document.createElement('div');

        const title = document.createElement('h2');
        title.className = `${SCRIPT_ID}-dialog-title`;
        title.textContent = 'Batch download list';

        const subtitle = document.createElement('p');
        subtitle.className = `${SCRIPT_ID}-dialog-subtitle`;
        subtitle.textContent = 'Select any videos you want to download from this profile.';

        headText.appendChild(title);
        headText.appendChild(subtitle);

        const closeButton = document.createElement('button');
        closeButton.id = BATCH_CLOSE_ID;
        closeButton.type = 'button';
        closeButton.className = `${SCRIPT_ID}-text-button`;
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => {
            closeBatchModal();
        });

        head.appendChild(headText);
        head.appendChild(closeButton);

        const toolbar = document.createElement('div');
        toolbar.className = `${SCRIPT_ID}-dialog-toolbar`;

        const toolbarLeft = document.createElement('div');
        toolbarLeft.className = `${SCRIPT_ID}-toolbar-group`;

        const searchInput = document.createElement('input');
        searchInput.id = BATCH_SEARCH_ID;
        searchInput.type = 'search';
        searchInput.placeholder = 'Search by title, author, or link';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) {
                return;
            }

            state.batchSearchTerm = target.value || '';
            renderBatchModalList();
        });

        toolbarLeft.appendChild(searchInput);

        const toolbarRight = document.createElement('div');
        toolbarRight.className = `${SCRIPT_ID}-toolbar-group`;

        const selectAllButton = document.createElement('button');
        selectAllButton.id = BATCH_SELECT_ALL_ID;
        selectAllButton.type = 'button';
        selectAllButton.className = `${SCRIPT_ID}-text-button`;
        selectAllButton.textContent = 'Select all';
        selectAllButton.addEventListener('click', () => {
            setAllBatchSelections(true);
        });

        const clearAllButton = document.createElement('button');
        clearAllButton.id = BATCH_CLEAR_ALL_ID;
        clearAllButton.type = 'button';
        clearAllButton.className = `${SCRIPT_ID}-text-button`;
        clearAllButton.textContent = 'Clear all';
        clearAllButton.addEventListener('click', () => {
            setAllBatchSelections(false);
        });

        toolbarRight.appendChild(selectAllButton);
        toolbarRight.appendChild(clearAllButton);
        toolbar.appendChild(toolbarLeft);
        toolbar.appendChild(toolbarRight);

        const list = document.createElement('div');
        list.id = BATCH_MODAL_LIST_ID;
        list.className = `${SCRIPT_ID}-list`;
        list.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
                return;
            }

            updateBatchSelection(target.dataset.entryId || '', target.checked);
        });

        const actions = document.createElement('div');
        actions.className = `${SCRIPT_ID}-dialog-actions`;

        const summary = document.createElement('div');
        summary.id = BATCH_MODAL_SUMMARY_ID;
        summary.textContent = 'Detected 0 videos, 0 available, 0 selected.';

        const startButton = document.createElement('button');
        startButton.id = BATCH_START_ID;
        startButton.type = 'button';
        startButton.className = `${SCRIPT_ID}-action-button`;
        startButton.textContent = 'Download selected';
        startButton.addEventListener('click', () => {
            void startSelectedBatchDownload();
        });

        actions.appendChild(summary);
        actions.appendChild(startButton);

        dialog.appendChild(head);
        dialog.appendChild(toolbar);
        dialog.appendChild(list);
        dialog.appendChild(actions);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        modal.addEventListener('pointerdown', (event) => {
            if (event.target === modal) {
                closeBatchModal();
            }
        });
    }

    function installObservers() {
        if (state.observer) {
            state.observer.disconnect();
        }

        state.observer = new MutationObserver((mutations) => {
            if (mutations.some(mutationNeedsRefresh)) {
                scheduleRefresh();
            }
        });

        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        window.addEventListener('popstate', () => {
            scheduleRefresh(0);
        });
        window.addEventListener('hashchange', () => {
            scheduleRefresh(0);
        });
    }

    function patchHistory() {
        if (state.historyPatched) {
            return;
        }

        const wrap = (methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') {
                return;
            }

            history[methodName] = function () {
                const result = original.apply(this, arguments);
                scheduleRefresh(0);
                return result;
            };
        };

        wrap('pushState');
        wrap('replaceState');
        state.historyPatched = true;
    }

    function boot() {
        if (!document.body) {
            window.setTimeout(boot, 50);
            return;
        }

        ensurePanel();
        ensureBatchModal();
        installNetworkHooks();
        primeStructuredDataCacheFromDocument(document);
        document.addEventListener('keydown', handleKeydown, true);
        window.addEventListener('resize', () => {
            state.panelTop = clampPanelTop(state.panelTop ?? loadSavedPanelTop());
            applyPanelPosition();
            savePanelTop();
        });
        patchHistory();
        installObservers();
        scheduleRefresh(0);

        console.log('[Douyin Downloader] Ready. Press Q or click the floating download button.');
    }

    boot();
})();



