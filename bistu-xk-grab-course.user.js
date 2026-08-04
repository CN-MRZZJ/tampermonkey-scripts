// ==UserScript==
// @name         BISTU选课系统抢课助手
// @namespace    https://github.com/CN-MRZZJ/tampermonkey-scripts
// @version      1.2.0
// @description  在BISTU选课系统点击选课时自动捕获课程完整参数加入列表，支持多课程同时抢课、去重、删除
// @author       MRZZJ
// @match        https://xk.bistu.edu.cn/xsxk/*
// @grant        none
// @run-at       document-start
// @unwrap
// @license      MIT
// @homepageURL  https://github.com/CN-MRZZJ/tampermonkey-scripts
// @supportURL   https://github.com/CN-MRZZJ/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-xk-grab-course.user.js
// @downloadURL  https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-xk-grab-course.user.js
// @icon         https://info.bistu.edu.cn//home/icon.jpg
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_PATH = '/xsxk/elective/clazz/add';
    const STORAGE_KEY = 'bistu_xk_grab_config';

    // ---- state ----

    let capturedTemplate = null;   // { url, headers, bodyFormat, idKey, baseParams }
    let grabTimer = null;
    let countdownTimer = null;
    let grabRunning = false;
    let grabRoundActive = false;
    let grabCount = 0;

    // ---- load persisted config ----

    let config = {
        courseOrder: [],            // ordered list of clazzIds
        courses: {},                // { [clazzId]: { ...fullParams } }
        coursesStatus: {},          // { [clazzId]: 'pending' | 'success' | 'error' }
        batchId: '',
        interval: 1000,
        autoStart: false,
        startTime: '',
        stopOnSuccess: true,
    };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) {
            // migrate old clazzIds array format
            if (saved.clazzIds && !saved.courseOrder) {
                saved.courseOrder = saved.clazzIds;
                saved.courses = {};
                saved.clazzIds.forEach(id => {
                    saved.courses[id] = { clazzId: id };
                });
                delete saved.clazzIds;
            }
            // migrate old clazzIdsStatus → coursesStatus
            if (saved.clazzIdsStatus && !saved.coursesStatus) {
                saved.coursesStatus = saved.clazzIdsStatus;
                delete saved.clazzIdsStatus;
            }
            Object.assign(config, saved);
        }
    } catch(e) {}

    function saveConfig() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch(e) {}
    }

    // ================================================================
    //  Network hooks – capture clazz/add POST
    // ================================================================

    function findClazzIdKey(keys) {
        return keys.find(k => {
            const lower = k.toLowerCase();
            if (lower === 'id') return true;
            if (lower.includes('type') || lower.includes('kind') || lower.includes('category')) return false;
            return lower.includes('clazz') || lower.includes('course');
        });
    }

    function escapeHtml(s) {
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
    }

    function parseBody(body) {
        if (!body) return {};
        if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
            return body;
        }
        const text = body instanceof FormData || body instanceof URLSearchParams
            ? new URLSearchParams(body).toString()
            : String(body);
        try { return JSON.parse(text); } catch(e) {}
        const params = {};
        try {
            new URLSearchParams(text).forEach((v, k) => { params[k] = v; });
        } catch(e) {}
        return params;
    }

    function detectBodyFormat(body) {
        if (body instanceof FormData) return 'formdata';
        if (typeof body === 'string') {
            try { JSON.parse(body); return 'json'; } catch(e) { return 'form'; }
        }
        if (typeof body === 'object') return 'json';
        return 'form';
    }

    function formatLocalDatetime(date) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function onCaptured(url, body, headers, source) {
        const params = parseBody(body);
        const idKey = findClazzIdKey(Object.keys(params));
        const capturedId = idKey ? params[idKey] : '';
        if (!capturedId) return;

        // capture template on first request
        if (!capturedTemplate) {
            capturedTemplate = {
                url,
                headers,
                bodyFormat: detectBodyFormat(body),
                idKey,
                baseParams: { ...params },
            };
            config.batchId = new URLSearchParams(window.location.search).get('batchId') || '';
        }

        // add or update course with full params (dedup by id)
        const exists = config.courseOrder.includes(capturedId);
        config.courses[capturedId] = { ...params };
        if (!exists) {
            config.courseOrder.push(capturedId);
            config.coursesStatus[capturedId] = 'pending';
            logMsg('captured', `已捕获课程: ${capturedId}`);
        } else {
            // existing course got re-captured — update params, reset status if previously failed
            if (config.coursesStatus[capturedId] !== 'success') {
                config.coursesStatus[capturedId] = 'pending';
            }
            logMsg('info', `已更新课程参数: ${capturedId}`);
        }
        saveConfig();
        updatePanel();
    }

    function onResponse(status, body, source, clazzId) {
        let msg = `[${clazzId ? clazzId.substring(0, 8) + '...' : '?'}] 响应 ${status}`;
        let success = false;
        if (status === 200) {
            try {
                const r = JSON.parse(body);
                msg += r.msg ? ` - ${r.msg}` : '';
                if (r.code === 0 || r.code === '0' || r.success || r.code === 200) success = true;
            } catch(e) {}
        }
        logMsg(success ? 'success' : 'error', msg);

        if (success && clazzId) {
            config.coursesStatus[clazzId] = 'success';
            saveConfig();
            updatePanel();
        }

        if (success && config.stopOnSuccess) {
            const pending = getPendingIds();
            if (pending.length === 0) {
                stopGrab();
                logMsg('info', '所有课程已选课成功，已停止抢课');
            }
        }
    }

    // ---- hook fetch ----

    const origFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        const urlStr = typeof url === 'string' ? url : (url.url || url.href || '');
        const method = (options.method || 'GET').toUpperCase();

        if (urlStr.includes(TARGET_PATH) && method === 'POST') {
            if (options.__grab) {
                return origFetch.call(this, url, options);
            }

            let headers = {};
            if (options.headers) {
                if (options.headers instanceof Headers) {
                    options.headers.forEach((v, k) => { headers[k] = v; });
                } else if (Array.isArray(options.headers)) {
                    options.headers.forEach(([k, v]) => { headers[k] = v; });
                } else {
                    headers = { ...options.headers };
                }
            }
            onCaptured(urlStr, options.body, headers, 'fetch');

            return origFetch.call(this, url, options).then(resp => {
                resp.clone().text().then(t => onResponse(resp.status, t, 'fetch'));
                return resp;
            });
        }
        return origFetch.call(this, url, options);
    };

    // ---- hook XMLHttpRequest ----

    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    const origSetRequestHeader = XHR.setRequestHeader;

    XHR.open = function(method, url) {
        this.__capture = { method: method.toUpperCase(), url: typeof url === 'string' ? url : String(url) };
        return origOpen.apply(this, arguments);
    };

    XHR.setRequestHeader = function(name, value) {
        if (this.__capture) {
            if (!this.__capture._headers) this.__capture._headers = {};
            this.__capture._headers[name] = value;
        }
        return origSetRequestHeader.apply(this, arguments);
    };

    XHR.send = function(body) {
        const cap = this.__capture;
        if (cap && cap.method === 'POST' && cap.url.includes(TARGET_PATH)) {
            cap.headers = cap._headers || {};
            delete cap._headers;
            onCaptured(cap.url, body, cap.headers, 'XHR');
            this.addEventListener('load', function() {
                onResponse(this.status, this.responseText, 'XHR');
            });
        }
        return origSend.apply(this, arguments);
    };

    // ================================================================
    //  Auto-grab engine
    // ================================================================

    function getPendingIds() {
        return config.courseOrder.filter(id => config.coursesStatus[id] !== 'success');
    }

    function serializeBody(params, format) {
        switch (format) {
            case 'json':
                return JSON.stringify(params);
            case 'form':
                return new URLSearchParams(params).toString();
            case 'formdata': {
                const fd = new FormData();
                Object.entries(params).forEach(([k, v]) => fd.append(k, v));
                return fd;
            }
            default:
                return JSON.stringify(params);
        }
    }

    async function sendGrabRequest(clazzId) {
        if (!capturedTemplate) {
            logMsg('warn', '尚未捕获到选课请求模板，请先在页面上手动点击选课');
            stopGrab();
            return;
        }

        // merge baseParams with course-specific params
        const params = { ...capturedTemplate.baseParams, ...config.courses[clazzId] };
        const body = serializeBody(params, capturedTemplate.bodyFormat);
        const ct = capturedTemplate.headers ? (capturedTemplate.headers['Content-Type'] || capturedTemplate.headers['content-type']) : '';
        const method = 'POST';
        const headers = { ...capturedTemplate.headers };
        if (ct) headers['Content-Type'] = ct;

        try {
            grabCount++;
            updatePanel();
            const resp = await fetch(capturedTemplate.url, { method, headers, body, __grab: true });
            const text = await resp.text();
            onResponse(resp.status, text, 'grab', clazzId);
        } catch(e) {
            logMsg('error', `[${clazzId.substring(0, 8)}...] 请求失败: ${e.message}`);
        }
    }

    async function grabRound() {
        if (grabRoundActive) return;
        grabRoundActive = true;

        const pending = getPendingIds();
        if (pending.length === 0) {
            stopGrab();
            grabRoundActive = false;
            return;
        }

        for (const id of pending) {
            if (!grabRunning) break;
            await sendGrabRequest(id);
        }

        grabRoundActive = false;

        if (getPendingIds().length === 0) {
            stopGrab();
            return;
        }

        if (grabRunning) {
            grabTimer = setTimeout(grabRound, config.interval);
        }
    }

    function updateCountdown() {
        if (!countdownEl) return;
        if (!config.startTime) {
            countdownEl.textContent = '--:--:--';
            countdownEl.classList.remove('xk-countdown-urgent');
            return;
        }
        const now = Date.now();
        const target = new Date(config.startTime).getTime();
        if (isNaN(target)) {
            countdownEl.textContent = '--:--:--';
            countdownEl.classList.remove('xk-countdown-urgent');
            return;
        }
        let diff = target - now;
        if (diff < 0) diff = 0;
        const hh = Math.floor(diff / 3600000);
        const mm = Math.floor((diff % 3600000) / 60000);
        const ss = Math.floor((diff % 60000) / 1000);
        countdownEl.textContent = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        countdownEl.classList.toggle('xk-countdown-urgent', diff > 0 && diff < 10000);
    }

    function startCountdown() {
        if (countdownTimer) return; // already running
        updateCountdown();
        countdownTimer = setInterval(updateCountdown, 200);
    }

    function stopCountdown() {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (countdownEl) updateCountdown(); // refresh display to 00:00:00 or --:--:--
    }

    function startGrab() {
        if (grabRunning) return;
        stopGrab();

        config.courseOrder.forEach(id => {
            if (!config.coursesStatus[id]) config.coursesStatus[id] = 'pending';
        });
        saveConfig();

        const doStart = () => {
            grabRunning = true;
            grabCount = 0;
            updatePanel();
            logMsg('info', `开始抢课，${config.courseOrder.length}门课程，间隔 ${config.interval}ms`);
            grabRound();
        };

        if (config.startTime) {
            const target = new Date(config.startTime).getTime();
            const delay = Math.max(0, target - Date.now());
            if (isNaN(target) || delay < 0) {
                doStart();
                return;
            }
            logMsg('info', `将在 ${new Date(target).toLocaleString('zh-CN')} 自动开始 (${Math.round(delay/1000)}秒后)`);
            grabRunning = false;
            updatePanel();
            grabTimer = setTimeout(doStart, delay);
        } else {
            doStart();
        }
    }

    function stopGrab() {
        grabRunning = false;
        grabRoundActive = false;
        if (grabTimer) { clearTimeout(grabTimer); grabTimer = null; }
        updatePanel();
        logMsg('info', '已停止抢课');
    }

    // ================================================================
    //  Log
    // ================================================================

    let logEntries = [];
    function logMsg(type, msg) {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        logEntries.push({ time, type, msg });
        if (logEntries.length > 100) logEntries = logEntries.slice(-50);
        updateLog();
    }

    // ================================================================
    //  UI
    // ================================================================

    let panel, logEl, countdownEl, startBtn, stopBtn, sendOnceBtn, manualAddInput, intervalInput, startTimeInput, stopOnSuccessCb, statusListEl, clearAllBtn;

    function createPanel() {
        if (document.getElementById('bistu-xk-panel')) return;

        const style = document.createElement('style');
        style.textContent = `
#bistu-xk-panel{position:fixed;top:60px;right:10px;z-index:99999;width:330px;background:#fff;border:1px solid #d0d0d0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:13px;color:#333;font-family:"Microsoft YaHei",Arial,sans-serif}
#bistu-xk-panel .xk-header{cursor:move;padding:8px 12px;background:#1a73e8;color:#fff;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;user-select:none}
#bistu-xk-panel .xk-header .xk-title{font-weight:700;font-size:14px}
#bistu-xk-panel .xk-header .xk-toggle{cursor:pointer;font-size:16px;line-height:1;opacity:.8}
#bistu-xk-panel .xk-header .xk-toggle:hover{opacity:1}
#bistu-xk-panel .xk-body{padding:10px 12px;max-height:500px;overflow-y:auto}
#bistu-xk-panel .xk-body.collapsed{display:none}
#bistu-xk-panel .xk-section{border-bottom:1px solid #eee;padding:8px 0}
#bistu-xk-panel .xk-section:last-child{border-bottom:none}
#bistu-xk-panel .xk-section-title{font-weight:700;color:#1a73e8;margin-bottom:6px;font-size:12px}
#bistu-xk-panel label{display:block;margin:4px 0;font-size:12px;color:#555}
#bistu-xk-panel input[type=number]{width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;margin-bottom:4px}
#bistu-xk-panel input[type=text]{box-sizing:border-box;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px}
#bistu-xk-panel input[type=checkbox]{margin-right:4px}
#bistu-xk-panel .xk-row{display:flex;gap:6px;align-items:center}
#bistu-xk-panel .xk-row>*{flex:1}
#bistu-xk-panel button{padding:6px 12px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;color:#fff}
#bistu-xk-panel .xk-btn-start{background:#0a0}
#bistu-xk-panel .xk-btn-start:hover{background:#080}
#bistu-xk-panel .xk-btn-stop{background:#d00}
#bistu-xk-panel .xk-btn-stop:hover{background:#b00}
#bistu-xk-panel .xk-btn-once{background:#1a73e8}
#bistu-xk-panel .xk-btn-once:hover{background:#1557b0}
#bistu-xk-panel .xk-btn-add{background:#1a73e8;flex:0 0 auto;padding:4px 10px;font-size:12px}
#bistu-xk-panel .xk-btn-add:hover{background:#1557b0}
#bistu-xk-panel .xk-btn-clear{background:#999;width:100%;margin-top:4px}
#bistu-xk-panel .xk-btn-clear:hover{background:#777}
#bistu-xk-panel .xk-log{font-size:11px;max-height:180px;overflow-y:auto;background:#f8f8f8;padding:4px 6px;border-radius:4px;font-family:Consolas,monospace}
#bistu-xk-panel .xk-log .log-entry{margin:1px 0;word-break:break-all}
#bistu-xk-panel .xk-log .log-success{color:#080}
#bistu-xk-panel .xk-log .log-error{color:#d00}
#bistu-xk-panel .xk-log .log-warn{color:#e70}
#bistu-xk-panel .xk-log .log-info{color:#555}
#bistu-xk-panel .xk-log .log-captured{color:#1a73e8;font-weight:700}
#bistu-xk-panel .xk-badge{display:inline-block;background:#0a0;color:#fff;padding:0 6px;border-radius:10px;font-size:10px;margin-left:4px}
#bistu-xk-panel .xk-badge.off{background:#999}
#bistu-xk-panel .xk-status-list{font-size:11px;max-height:140px;overflow-y:auto;margin:4px 0}
#bistu-xk-panel .xk-status-item{display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:3px;margin:1px 0;gap:6px}
#bistu-xk-panel .xk-status-item.pending{background:#fff3cd}
#bistu-xk-panel .xk-status-item.success{background:#d4edda}
#bistu-xk-panel .xk-status-item.error{background:#f8d7da}
#bistu-xk-panel .xk-status-id{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;cursor:default}
#bistu-xk-panel .xk-status-extra{font-size:9px;color:#999;flex-shrink:0;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#bistu-xk-panel .xk-status-tag{font-size:10px;padding:1px 4px;border-radius:3px;color:#fff;flex-shrink:0}
#bistu-xk-panel .xk-status-tag.pending{background:#e7a000}
#bistu-xk-panel .xk-status-tag.success{background:#080}
#bistu-xk-panel .xk-status-tag.error{background:#d00}
#bistu-xk-panel .xk-status-del{cursor:pointer;font-size:14px;line-height:1;color:#999;flex-shrink:0;padding:0 2px}
#bistu-xk-panel .xk-status-del:hover{color:#d00}
#bistu-xk-panel .xk-empty-hint{text-align:center;color:#aaa;font-size:11px;padding:8px 0}
#bistu-xk-panel .xk-time-presets{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
#bistu-xk-panel .xk-time-preset{flex:1 1 auto;padding:4px 6px;border:1px solid #1a73e8;background:#fff;color:#1a73e8;border-radius:4px;cursor:pointer;font-size:11px;font-weight:400;min-width:40px;text-align:center}
#bistu-xk-panel .xk-time-preset:hover{background:#1a73e8;color:#fff}
#bistu-xk-panel .xk-time-preset.active{background:#1a73e8;color:#fff}
@keyframes xk-pulse{0%,100%{opacity:1}50%{opacity:.3}}
#bistu-xk-panel .xk-countdown-urgent{animation:xk-pulse .5s infinite;color:#d00!important}
`;
        document.head.appendChild(style);

        panel = document.createElement('div');
        panel.id = 'bistu-xk-panel';
        panel.innerHTML = `
<div class="xk-header" id="xk-header">
  <span class="xk-title">选课助手 <span id="xk-status-badge" class="xk-badge off">待命中</span></span>
  <span class="xk-toggle" id="xk-toggle">−</span>
</div>
<div class="xk-body" id="xk-body">
  <div class="xk-section">
    <div class="xk-section-title">请求信息</div>
    <div id="xk-template-info" style="font-size:11px;color:#999;">等待抓取选课请求...</div>
  </div>
  <div class="xk-section">
    <div class="xk-section-title">课程列表 <span style="font-weight:400;color:#999;font-size:11px">(点击页面选课自动添加)</span></div>
    <div id="xk-status-list" class="xk-status-list"></div>
    <div class="xk-row" style="margin-top:4px">
      <input type="text" id="xk-manual-add" placeholder="手动输入课程ID" style="flex:1">
      <button class="xk-btn-add" id="xk-btn-add">添加</button>
    </div>
    <button class="xk-btn-clear" id="xk-btn-clear-all">清空全部</button>
  </div>
  <div class="xk-section">
    <div class="xk-section-title">抢课配置</div>
    <div class="xk-row">
      <label style="flex:1">间隔(ms):
        <input type="number" id="xk-interval" value="1000" min="100" max="10000" step="100">
      </label>
    </div>
    <div class="xk-section-title">定时开始</div>
    <div class="xk-time-presets">
      <button class="xk-time-preset" data-delay="0">立即</button>
      <button class="xk-time-preset" data-delay="5">5秒</button>
      <button class="xk-time-preset" data-delay="30">30秒</button>
      <button class="xk-time-preset" data-delay="60">1分</button>
      <button class="xk-time-preset" data-delay="300">5分</button>
      <button class="xk-time-preset" data-delay="0" data-round="true">准点</button>
    </div>
    <label>自定义:
      <input type="datetime-local" id="xk-start-time" step="1">
    </label>
    <div id="xk-countdown" style="text-align:center;font-size:28px;font-weight:700;color:#1a73e8;padding:8px 0;font-family:Consolas,monospace;letter-spacing:2px">--:--:--</div>
    <label>
      <input type="checkbox" id="xk-stop-on-success" checked> 全部成功后自动停止
    </label>
    <div class="xk-row" style="margin-top:6px">
      <button class="xk-btn-start" id="xk-btn-start">开始抢课</button>
      <button class="xk-btn-stop" id="xk-btn-stop" style="display:none">停止</button>
      <button class="xk-btn-once" id="xk-btn-once">发送一次</button>
    </div>
  </div>
  <div class="xk-section">
    <div class="xk-section-title">日志 (<span id="xk-grab-count">0</span>次请求)</div>
    <div class="xk-log" id="xk-log"></div>
  </div>
</div>`;
        document.body.appendChild(panel);

        // cache elements
        logEl = document.getElementById('xk-log');
        startBtn = document.getElementById('xk-btn-start');
        stopBtn = document.getElementById('xk-btn-stop');
        sendOnceBtn = document.getElementById('xk-btn-once');
        manualAddInput = document.getElementById('xk-manual-add');
        intervalInput = document.getElementById('xk-interval');
        startTimeInput = document.getElementById('xk-start-time');
        stopOnSuccessCb = document.getElementById('xk-stop-on-success');
        countdownEl = document.getElementById('xk-countdown');
        statusListEl = document.getElementById('xk-status-list');
        clearAllBtn = document.getElementById('xk-btn-clear-all');

        // events
        document.getElementById('xk-toggle').addEventListener('click', () => {
            const body = document.getElementById('xk-body');
            const toggle = document.getElementById('xk-toggle');
            body.classList.toggle('collapsed');
            toggle.textContent = body.classList.contains('collapsed') ? '+' : '−';
        });

        // manual add
        document.getElementById('xk-btn-add').addEventListener('click', addManualId);
        manualAddInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') addManualId();
        });

        // delete (event delegation)
        statusListEl.addEventListener('click', e => {
            const delBtn = e.target.closest('.xk-status-del');
            if (!delBtn) return;
            deleteCourse(delBtn.dataset.clazzId);
        });

        // clear all
        clearAllBtn.addEventListener('click', () => {
            config.courseOrder = [];
            config.courses = {};
            config.coursesStatus = {};
            saveConfig();
            updatePanel();
            logMsg('info', '已清空课程列表');
        });

        startBtn.addEventListener('click', () => {
            if (config.courseOrder.length === 0) { logMsg('warn', '课程列表为空，请先在页面上点击选课或手动添加'); return; }
            if (!capturedTemplate) { logMsg('warn', '请先在页面上手动点击一次选课，以抓取请求模板'); return; }
            startGrab();
        });

        stopBtn.addEventListener('click', stopGrab);

        sendOnceBtn.addEventListener('click', async () => {
            if (config.courseOrder.length === 0) { logMsg('warn', '课程列表为空'); return; }
            if (!capturedTemplate) { logMsg('warn', '请先在页面上手动点击一次选课，以抓取请求模板'); return; }
            const pending = getPendingIds();
            if (pending.length === 0) { logMsg('info', '所有课程已成功，无需再发'); return; }
            logMsg('info', `发送一次 (${pending.length}门课程)`);
            for (const id of pending) {
                await sendGrabRequest(id);
            }
        });

        intervalInput.addEventListener('change', () => { config.interval = parseInt(intervalInput.value) || 1000; if (config.interval < 200) config.interval = 200; saveConfig(); });
        startTimeInput.addEventListener('change', () => {
            config.startTime = startTimeInput.value;
            saveConfig();
            if (config.startTime) startCountdown(); else stopCountdown();
            document.querySelectorAll('.xk-time-preset').forEach(b => b.classList.remove('active'));
        });
        startTimeInput.addEventListener('input', () => { if (!startTimeInput.value) stopCountdown(); });
        stopOnSuccessCb.addEventListener('change', () => { config.stopOnSuccess = stopOnSuccessCb.checked; saveConfig(); });

        // time preset buttons
        document.querySelectorAll('.xk-time-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const delay = parseInt(btn.dataset.delay) || 0;
                const round = btn.dataset.round === 'true';
                const d = new Date(Date.now() + delay * 1000);
                if (round) {
                    // round up to next hour
                    d.setMinutes(0, 0, 0);
                    if (delay === 0 && d.getTime() <= Date.now()) d.setHours(d.getHours() + 1);
                }
                config.startTime = formatLocalDatetime(d);
                saveConfig();
                updatePanel();
                startCountdown();
                // highlight active
                document.querySelectorAll('.xk-time-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                logMsg('info', `定时: ${d.toLocaleTimeString('zh-CN', {hour12: false})}`);
            });
        });

        // drag
        const header = document.getElementById('xk-header');
        let dragging = false, offX, offY;
        header.addEventListener('mousedown', e => {
            dragging = true;
            offX = e.clientX - panel.offsetLeft;
            offY = e.clientY - panel.offsetTop;
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            panel.style.left = (e.clientX - offX) + 'px';
            panel.style.right = 'auto';
            panel.style.top = (e.clientY - offY) + 'px';
        });
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    function addManualId() {
        const raw = manualAddInput.value.trim();
        if (!raw) return;
        if (!capturedTemplate) {
            logMsg('warn', '请先在页面上手动点击一次选课，以抓取请求模板');
            return;
        }
        const ids = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
        let added = 0;
        ids.forEach(id => {
            if (!config.courseOrder.includes(id)) {
                config.courseOrder.push(id);
                config.courses[id] = { [capturedTemplate.idKey]: id };
                config.coursesStatus[id] = 'pending';
                added++;
            }
        });
        if (added > 0) {
            saveConfig();
            updatePanel();
            logMsg('info', `手动添加 ${added} 门课程`);
        }
        manualAddInput.value = '';
    }

    function deleteCourse(id) {
        config.courseOrder = config.courseOrder.filter(i => i !== id);
        delete config.courses[id];
        delete config.coursesStatus[id];
        saveConfig();
        updatePanel();
        logMsg('info', `已删除课程: ${id}`);
    }

    function updatePanel() {
        if (!panel) return;
        // template info
        const infoEl = document.getElementById('xk-template-info');
        if (capturedTemplate) {
            const fieldNames = Object.keys(capturedTemplate.baseParams).map(k => {
                const isIdKey = capturedTemplate.idKey === k;
                return `<code style="${isIdKey ? 'color:#1a73e8;font-weight:700' : 'color:#555'}">${escapeHtml(k)}</code>`;
            }).join(', ');
            const authKey = capturedTemplate.headers ? (Object.keys(capturedTemplate.headers).find(k => k.toLowerCase() === 'authorization')) : null;
            const headersExtra = authKey ? ` | Auth: ${escapeHtml(String(capturedTemplate.headers[authKey]).substring(0, 30))}...` : '';
            infoEl.innerHTML = `<span style="color:#0a0">已捕获</span>
<div style="font-size:11px;color:#666;word-break:break-all;margin-top:2px">${escapeHtml(capturedTemplate.url)}</div>
<div style="font-size:10px;color:#999;margin-top:2px">格式: ${capturedTemplate.bodyFormat}${headersExtra}</div>
<div style="font-size:10px;color:#999;margin-top:2px">字段: ${fieldNames}</div>`;
        }

        // inputs
        if (intervalInput) intervalInput.value = config.interval;
        if (startTimeInput) startTimeInput.value = config.startTime;
        if (stopOnSuccessCb) stopOnSuccessCb.checked = config.stopOnSuccess;

        // status list
        if (statusListEl) {
            if (config.courseOrder.length === 0) {
                statusListEl.innerHTML = '<div class="xk-empty-hint">列表为空，在页面点击选课或手动添加</div>';
            } else {
                statusListEl.innerHTML = config.courseOrder.map(id => {
                    const status = config.coursesStatus[id] || 'pending';
                    const label = { pending: '待抢', success: '成功', error: '失败' }[status];
                    const shortId = id.length > 18 ? id.substring(0, 16) + '...' : id;
                    // show clazzType or other distinguishing field as extra info
                    const course = config.courses[id] || {};
                    const idKey = capturedTemplate ? capturedTemplate.idKey : 'clazzId';
                    const extraFields = Object.entries(course)
                        .filter(([k]) => k !== idKey)
                        .map(([, v]) => String(v))
                        .join(', ');
                    const extraHtml = extraFields ? `<span class="xk-status-extra" title="${escapeHtml(extraFields)}">${escapeHtml(extraFields.length > 20 ? extraFields.substring(0, 18) + '...' : extraFields)}</span>` : '';
                    return `<div class="xk-status-item ${status}">
<span class="xk-status-id" title="${escapeHtml(id)}">${escapeHtml(shortId)}</span>
${extraHtml}
<span class="xk-status-del" data-clazz-id="${escapeHtml(id)}" title="删除">×</span>
<span class="xk-status-tag ${status}">${label}</span>
</div>`;
                }).join('');
            }
        }

        // status badge
        const badge = document.getElementById('xk-status-badge');
        if (badge) {
            const total = config.courseOrder.length;
            const successCount = config.courseOrder.filter(id => config.coursesStatus[id] === 'success').length;
            if (grabRunning) {
                badge.textContent = total > 1 ? `${successCount}/${total} 运行中` : '运行中';
                badge.className = 'xk-badge';
            } else if (grabTimer) {
                badge.textContent = '等待定时';
                badge.className = 'xk-badge';
            } else {
                badge.textContent = total > 0 && successCount === total ? '全部完成' : '待命中';
                badge.className = 'xk-badge off';
            }
        }

        // buttons
        if (startBtn) startBtn.style.display = grabRunning ? 'none' : '';
        if (stopBtn) stopBtn.style.display = grabRunning ? '' : 'none';
        if (clearAllBtn) clearAllBtn.style.display = config.courseOrder.length > 0 ? '' : 'none';
    }

    function updateLog() {
        if (!logEl) return;
        logEl.innerHTML = logEntries.slice(-30).map(e => {
            const cls = `log-${e.type}`;
            return `<div class="log-entry ${cls}">[${e.time}] ${e.msg}</div>`;
        }).join('');
        logEl.scrollTop = logEl.scrollHeight;
        const countEl = document.getElementById('xk-grab-count');
        if (countEl) countEl.textContent = grabCount;
    }

    // ================================================================
    //  Init
    // ================================================================

    function init() {
        if (document.body) {
            createPanel();
            updatePanel();
            updateLog();
            if (capturedTemplate) {
                logMsg('info', '已加载上次抓取的请求模板');
            }
            if (!config.startTime) {
                config.startTime = formatLocalDatetime(new Date(Date.now() + 60000));
                saveConfig();
            }
            startCountdown();
            if (config.autoStart && config.courseOrder.length > 0 && capturedTemplate) {
                startGrab();
            }
        } else {
            setTimeout(init, 50);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
