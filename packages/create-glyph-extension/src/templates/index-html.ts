export function indexHtml(): string {
  return `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="theme-color" content="#0E0E12" />
        <title>Glyph Extensions</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
            rel="stylesheet"
        />
        <style>
            :root {
                --bg: #0e0e12;
                --bg-surface: #16161d;
                --bg-surface-hover: #1e1e28;
                --border: rgba(255, 255, 255, 0.06);
                --text: #e8e6e3;
                --text-secondary: #8a8a96;
                --accent: #ef9f27;
                --accent-dim: rgba(239, 159, 39, 0.12);
                --green: #34c759;
                --red: #da3633;
                --radius: 12px;
                --font: "Space Grotesk", system-ui, -apple-system, sans-serif;
            }
            *,
            *::before,
            *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            body {
                font-family: var(--font);
                background: var(--bg);
                color: var(--text);
                line-height: 1.6;
                min-height: 100vh;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            a {
                color: inherit;
                text-decoration: none;
            }

            .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 24px 20px 64px;
            }

            /* Header */
            .header {
                text-align: center;
                padding: 56px 0 32px;
            }
            .header-logo {
                margin-bottom: 20px;
            }
            .header h1 {
                font-size: 26px;
                font-weight: 700;
                letter-spacing: -0.02em;
                margin-bottom: 4px;
            }
            .header .author {
                color: var(--accent);
                font-size: 13px;
                font-weight: 500;
                margin-bottom: 8px;
            }
            .header .author:empty {
                display: none;
            }
            .header p {
                color: var(--text-secondary);
                font-size: 15px;
                max-width: 400px;
                margin: 0 auto;
            }

            /* Add button */
            .add-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: var(--accent);
                color: var(--bg);
                font-family: var(--font);
                font-size: 14px;
                font-weight: 600;
                padding: 12px 28px;
                border-radius: 10px;
                cursor: pointer;
                transition:
                    opacity 0.15s,
                    transform 0.1s;
                margin: 24px 0 8px;
                text-decoration: none;
            }
            .add-btn:hover {
                opacity: 0.85;
            }
            .add-btn:active {
                transform: scale(0.97);
            }
            .add-btn svg {
                width: 18px;
                height: 18px;
                fill: currentColor;
            }

            /* Fallback */
            .fallback {
                display: none;
                background: var(--bg-surface);
                border: 1px solid var(--border);
                border-radius: var(--radius);
                padding: 16px 20px;
                margin-top: 16px;
                font-size: 13px;
                color: var(--text-secondary);
                text-align: center;
            }
            .fallback.visible {
                display: block;
            }
            .fallback strong {
                color: var(--text);
            }

            /* Sources */
            .sources-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 40px 0 16px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border);
            }
            .sources-header h2 {
                font-size: 16px;
                font-weight: 600;
                letter-spacing: -0.01em;
            }
            .sources-header .count {
                font-size: 12px;
                color: var(--text-secondary);
                background: var(--bg-surface);
                padding: 4px 10px;
                border-radius: 20px;
            }
            .source-list {
                list-style: none;
            }
            .source-item {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 16px;
                border-radius: var(--radius);
                background: var(--bg-surface);
                margin-bottom: 8px;
                border: 1px solid var(--border);
                transition:
                    border-color 0.2s,
                    background 0.2s;
            }
            .source-item:hover {
                border-color: rgba(255, 255, 255, 0.1);
                background: var(--bg-surface-hover);
            }
            .source-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.04);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                overflow: hidden;
                font-size: 18px;
                color: var(--text-secondary);
            }
            .source-icon img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .source-info {
                flex: 1;
                min-width: 0;
            }
            .source-name {
                font-weight: 600;
                font-size: 14px;
                letter-spacing: -0.01em;
            }
            .source-meta {
                display: flex;
                gap: 8px;
                align-items: center;
                font-size: 12px;
                color: var(--text-secondary);
                margin-top: 3px;
            }
            .source-meta .lang {
                background: rgba(255, 255, 255, 0.06);
                padding: 2px 6px;
                border-radius: 4px;
                text-transform: uppercase;
                font-weight: 600;
                font-size: 10px;
                letter-spacing: 0.05em;
            }
            .source-meta .nsfw-badge {
                background: var(--red);
                color: #fff;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 700;
                font-size: 9px;
                letter-spacing: 0.05em;
                text-transform: uppercase;
            }

            /* Loading */
            .status {
                text-align: center;
                padding: 48px 0;
                color: var(--text-secondary);
                font-size: 13px;
            }
            .spinner {
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.08);
                border-top-color: var(--accent);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 12px;
            }
            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }

            /* Footer */
            .footer {
                text-align: center;
                padding-top: 48px;
                font-size: 12px;
                color: var(--text-secondary);
            }
            .footer a {
                color: var(--accent);
                transition: opacity 0.2s;
            }
            .footer a:hover {
                opacity: 0.7;
            }

            /* Playground */
            .playground { margin-top: 40px; padding-top: 32px; border-top: 1px solid var(--border); }
            .playground-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
            .playground-header h2 { font-size: 16px; font-weight: 600; }
            .pg-select { background: var(--bg-surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-family: var(--font); font-size: 13px; cursor: pointer; }
            .pg-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
            .pg-tab { background: none; border: 1px solid var(--border); color: var(--text-secondary); font-family: var(--font); font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
            .pg-tab:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }
            .pg-tab.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
            .pg-input { display: flex; gap: 8px; margin-bottom: 16px; }
            .pg-input input { flex: 1; background: var(--bg-surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; font-family: var(--font); font-size: 14px; outline: none; }
            .pg-input input:focus { border-color: var(--accent); }
            .pg-input input[type=number] { flex: none; text-align: center; }
            .pg-run { background: var(--accent); color: var(--bg); border: none; border-radius: 8px; padding: 10px 20px; font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity 0.15s; }
            .pg-run:hover { opacity: 0.85; }
            .pg-run:disabled { opacity: 0.5; cursor: not-allowed; }
            .pg-results-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
            .pg-result-tabs { display: flex; gap: 4px; }
            .pg-rtab { background: none; border: none; color: var(--text-secondary); font-family: var(--font); font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 6px; cursor: pointer; transition: all 0.15s; }
            .pg-rtab.active { background: var(--accent-dim); color: var(--accent); }
            .pg-duration { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
            .pg-preview { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; min-height: 100px; }
            .pg-json { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; font-family: 'SF Mono','Fira Code',monospace; font-size: 12px; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 500px; overflow-y: auto; }

            /* Novel cards in search results */
            .pg-card { display: flex; gap: 14px; padding: 12px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
            .pg-card:hover { border-color: rgba(255,255,255,0.15); background: var(--bg-surface-hover); }
            .pg-cover { width: 56px; height: 76px; border-radius: 6px; background: rgba(255,255,255,0.04); flex-shrink: 0; overflow: hidden; }
            .pg-cover img { width: 100%; height: 100%; object-fit: cover; }
            .pg-card-info { flex: 1; min-width: 0; }
            .pg-card-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
            .pg-card-author { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
            .pg-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
            .pg-tag { background: var(--accent-dim); color: var(--accent); font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
            .pg-card-arrow { color: var(--accent); font-size: 13px; font-weight: 600; align-self: center; flex-shrink: 0; }
            .pg-next-page { display: block; text-align: center; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; color: var(--accent); font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 8px; transition: border-color 0.2s; }
            .pg-next-page:hover { border-color: var(--accent); }

            /* Novel detail view */
            .pg-detail-header { display: flex; gap: 20px; margin-bottom: 20px; }
            .pg-detail-cover { width: 120px; height: 170px; border-radius: 10px; background: rgba(255,255,255,0.04); flex-shrink: 0; overflow: hidden; }
            .pg-detail-cover img { width: 100%; height: 100%; object-fit: cover; }
            .pg-detail-info h3 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
            .pg-detail-author { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
            .pg-detail-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 10px; max-height: 80px; overflow: hidden; }
            .pg-detail-status { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--text-secondary); text-transform: capitalize; margin-bottom: 8px; }
            .pg-chapter-count { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; border-top: 1px solid var(--border); padding-top: 12px; }
            .pg-ch-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: background 0.15s; }
            .pg-ch-item:hover { background: rgba(255,255,255,0.04); }
            .pg-ch-num { color: var(--text-secondary); font-size: 12px; min-width: 40px; }
            .pg-ch-title { flex: 1; }
            .pg-ch-date { color: var(--text-secondary); font-size: 11px; }
            .pg-ch-list { max-height: 400px; overflow-y: auto; }

            /* Chapter reader */
            .pg-reader { font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.8; color: var(--text); max-width: 600px; }
            .pg-reader img { max-width: 100%; height: auto; }

            /* Discover sections */
            .pg-section-card { padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.2s; }
            .pg-section-card:hover { border-color: var(--accent); }
            .pg-section-type { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); margin-bottom: 4px; }
            .pg-section-title { font-size: 14px; font-weight: 600; }
            .pg-section-subtitle { font-size: 12px; color: var(--text-secondary); }

            /* States */
            .pg-loading { text-align: center; padding: 32px; color: var(--text-secondary); font-size: 13px; }
            .pg-error { background: rgba(218,54,51,0.1); border: 1px solid var(--red); border-radius: var(--radius); padding: 14px 18px; font-size: 13px; color: var(--red); margin-top: 12px; }
            .pg-empty { text-align: center; padding: 32px; color: var(--text-secondary); font-size: 13px; }

            /* JSON syntax coloring */
            .pg-json .key { color: #6ec6ff; }
            .pg-json .str { color: #34c759; }
            .pg-json .num { color: #ef9f27; }
            .pg-json .bool { color: #ef9f27; }
            .pg-json .null { color: #8a8a96; }
            .pg-json details { margin-left: 16px; }
            .pg-json summary { cursor: pointer; color: var(--text-secondary); }
            .pg-json summary:hover { color: var(--text); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-logo">
                    <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
                        <polygon
                            points="24,8 38,16 38,32 24,40 10,32 10,16"
                            stroke="white"
                            stroke-width="2"
                            fill="none"
                        />
                        <polygon
                            points="24,14 33,19 33,29 24,34 15,29 15,19"
                            stroke="white"
                            stroke-width="1"
                            fill="none"
                            opacity="0.4"
                        />
                        <line
                            x1="24"
                            y1="8"
                            x2="24"
                            y2="14"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <line
                            x1="24"
                            y1="34"
                            x2="24"
                            y2="40"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <line
                            x1="10"
                            y1="16"
                            x2="15"
                            y2="19"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <line
                            x1="38"
                            y1="16"
                            x2="33"
                            y2="19"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <line
                            x1="10"
                            y1="32"
                            x2="15"
                            y2="29"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <line
                            x1="38"
                            y1="32"
                            x2="33"
                            y2="29"
                            stroke="white"
                            stroke-width="1.5"
                        />
                        <circle
                            cx="24"
                            cy="24"
                            r="6"
                            stroke="#FAC775"
                            stroke-width="0.75"
                            fill="none"
                            opacity="0.35"
                        />
                        <circle cx="24" cy="24" r="3.5" fill="#EF9F27" />
                    </svg>
                </div>
                <h1 id="repo-name">Glyph Extensions</h1>
                <p id="repo-author" class="author"></p>
                <p id="repo-desc">
                    Browse and install novel sources for the Glyph app.
                </p>
            </div>

            <div style="text-align: center">
                <a class="add-btn" id="add-btn" href="#">
                    <svg viewBox="0 0 24 24">
                        <path
                            d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-4H7v-2h4V7h2v4h4v2h-4v4z"
                        />
                    </svg>
                    Add to Glyph
                </a>
                <div class="fallback" id="fallback">
                    <strong>Glyph</strong> is not installed on this device.<br />
                    Install the app first, then tap the button again.
                </div>
            </div>

            <div id="sources-section" style="display: none">
                <div class="sources-header">
                    <h2>Sources</h2>
                    <span class="count" id="source-count"></span>
                </div>
                <ul class="source-list" id="source-list"></ul>
            </div>

            <div class="playground" id="playground" style="display:none">
                <div class="playground-header">
                    <h2>Playground</h2>
                    <select id="pg-source" class="pg-select"></select>
                </div>

                <div class="pg-tabs" id="pg-tabs">
                    <button class="pg-tab active" data-method="searchNovels">Search</button>
                    <button class="pg-tab" data-method="fetchNovelDetails">Novel Details</button>
                    <button class="pg-tab" data-method="fetchChapterContent">Chapter</button>
                    <button class="pg-tab" data-method="discover">Discover</button>
                </div>

                <div class="pg-input" id="pg-input-searchNovels">
                    <input type="text" id="pg-search-query" placeholder="Search query..." />
                    <input type="number" id="pg-search-page" value="1" min="1" style="width:70px" />
                    <button class="pg-run" id="pg-run-search">Run</button>
                </div>
                <div class="pg-input" id="pg-input-fetchNovelDetails" style="display:none">
                    <input type="text" id="pg-novel-url" placeholder="Novel URL..." style="flex:1" />
                    <button class="pg-run" id="pg-run-novel">Run</button>
                </div>
                <div class="pg-input" id="pg-input-fetchChapterContent" style="display:none">
                    <input type="text" id="pg-chapter-url" placeholder="Chapter URL..." style="flex:1" />
                    <button class="pg-run" id="pg-run-chapter">Run</button>
                </div>
                <div class="pg-input" id="pg-input-discover" style="display:none">
                    <button class="pg-run" id="pg-run-discover" style="width:100%">Load Discover Sections</button>
                </div>

                <div id="pg-results" style="display:none">
                    <div class="pg-results-bar">
                        <div class="pg-result-tabs">
                            <button class="pg-rtab active" data-view="preview">Preview</button>
                            <button class="pg-rtab" data-view="json">JSON</button>
                        </div>
                        <span class="pg-duration" id="pg-duration"></span>
                    </div>
                    <div id="pg-preview" class="pg-preview"></div>
                    <div id="pg-json" class="pg-json" style="display:none"></div>
                </div>

                <div id="pg-loading" class="pg-loading" style="display:none">
                    <div class="spinner"></div>Running...
                </div>
                <div id="pg-error" class="pg-error" style="display:none"></div>
            </div>

            <div class="status" id="status">
                <div class="spinner"></div>
                Loading sources...
            </div>

            <div class="footer">
                Powered by <a href="https://glyph.moe" target="_blank">Glyph</a>
            </div>
        </div>

        <script>
            (function () {
                "use strict";

                var jsonUrl = getJsonUrl();
                var deepLink =
                    "glyph://add-repo?url=" + encodeURIComponent(jsonUrl);

                var addBtn = document.getElementById("add-btn");
                addBtn.href = deepLink;
                addBtn.addEventListener("click", function (e) {
                    e.preventDefault();
                    window.location.href = deepLink;
                    setTimeout(function () {
                        document
                            .getElementById("fallback")
                            .classList.add("visible");
                    }, 2000);
                });

                fetch(jsonUrl)
                    .then(function (r) {
                        if (!r.ok) throw new Error("HTTP " + r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        renderRepo(data);
                    })
                    .catch(function (err) {
                        document.getElementById("status").innerHTML =
                            '<p style="color:' +
                            getComputedStyle(
                                document.documentElement,
                            ).getPropertyValue("--red") +
                            '">Failed to load sources: ' +
                            esc(err.message) +
                            "</p>";
                    });

                function getJsonUrl() {
                    var params = new URLSearchParams(window.location.search);
                    if (params.has("url")) {
                        var u = params.get("url");
                        try {
                            var parsed = new URL(u, window.location.href);
                            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                                return parsed.href;
                            }
                        } catch (e) { /* ignore malformed */ }
                    }
                    var base = window.location.href.replace(/\\/[^/]*$/, "/");
                    return base + "dist/index.json";
                }

                function renderRepo(data) {
                    var repoName =
                        data.name ||
                        (data.repository || "Extensions").split("/").pop() ||
                        "Extensions";
                    document.getElementById("repo-name").textContent = repoName;
                    document.title = repoName + " \u2014 Glyph";

                    if (data.author) {
                        document.getElementById("repo-author").textContent =
                            "by " + data.author;
                    }
                    if (data.description) {
                        document.getElementById("repo-desc").textContent =
                            data.description;
                    }

                    var sources = data.sources || [];
                    document.getElementById("status").style.display = "none";
                    document.getElementById("sources-section").style.display =
                        "block";
                    document.getElementById("source-count").textContent =
                        sources.length +
                        " source" +
                        (sources.length !== 1 ? "s" : "");

                    var list = document.getElementById("source-list");
                    sources.forEach(function (src) {
                        var li = document.createElement("li");
                        li.className = "source-item";

                        var iconDiv = document.createElement("div");
                        iconDiv.className = "source-icon";
                        if (src.icon) {
                            var img = document.createElement("img");
                            img.src = src.icon;
                            img.alt = src.name;
                            img.onerror = function () {
                                this.parentElement.textContent = "\uD83D\uDCD6";
                            };
                            iconDiv.appendChild(img);
                        } else {
                            iconDiv.textContent = "\uD83D\uDCD6";
                        }

                        var info = document.createElement("div");
                        info.className = "source-info";
                        var nsfwBadge = src.nsfw
                            ? '<span class="nsfw-badge">18+</span>'
                            : "";
                        info.innerHTML =
                            '<div class="source-name">' +
                            esc(src.name) +
                            "</div>" +
                            '<div class="source-meta">' +
                            '<span class="lang">' +
                            esc(src.language || "??") +
                            "</span>" +
                            nsfwBadge +
                            "<span>v" +
                            esc(src.version || "?") +
                            "</span>" +
                            "</div>";

                        li.appendChild(iconDiv);
                        li.appendChild(info);
                        list.appendChild(li);
                    });

                    initPlayground(sources);
                }

                function esc(s) {
                    var d = document.createElement("div");
                    d.textContent = s;
                    return d.innerHTML;
                }
            })();
        </script>

        <script>
            (function () {
                "use strict";

                var pgSources = [];
                var currentSource = "";
                var currentMethod = "searchNovels";
                var currentPage = 1;
                var lastSearchQuery = "";
                var lastResult = null;

                window.initPlayground = function (sources) {
                    pgSources = sources;
                    if (!sources || sources.length === 0) return;

                    // Only show playground on local dev server (not GitHub Pages)
                    var host = window.location.hostname;
                    var isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]"
                        || host.endsWith(".local")
                        || host.startsWith("192.168.") || host.startsWith("10.")
                        || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)
                        || /^100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\./.test(host)
                        || host.startsWith("fe80:") || host.startsWith("[fe80:");
                    if (!isLocal) return;

                    var sel = document.getElementById("pg-source");
                    sources.forEach(function (src) {
                        var opt = document.createElement("option");
                        opt.value = src.id;
                        opt.textContent = src.name;
                        sel.appendChild(opt);
                    });
                    currentSource = sources[0].id;
                    sel.addEventListener("change", function () {
                        currentSource = this.value;
                    });

                    document.getElementById("playground").style.display = "block";

                    var tabs = document.querySelectorAll("#pg-tabs .pg-tab");
                    for (var i = 0; i < tabs.length; i++) {
                        tabs[i].addEventListener("click", function () {
                            switchTab(this.getAttribute("data-method"));
                        });
                    }

                    var rtabs = document.querySelectorAll(".pg-rtab");
                    for (var j = 0; j < rtabs.length; j++) {
                        rtabs[j].addEventListener("click", function () {
                            var view = this.getAttribute("data-view");
                            for (var k = 0; k < rtabs.length; k++) {
                                rtabs[k].classList.remove("active");
                            }
                            this.classList.add("active");
                            document.getElementById("pg-preview").style.display = view === "preview" ? "block" : "none";
                            document.getElementById("pg-json").style.display = view === "json" ? "block" : "none";
                        });
                    }

                    document.getElementById("pg-run-search").addEventListener("click", runSearch);
                    document.getElementById("pg-run-novel").addEventListener("click", runNovel);
                    document.getElementById("pg-run-chapter").addEventListener("click", runChapter);
                    document.getElementById("pg-run-discover").addEventListener("click", runDiscover);

                    document.getElementById("pg-search-query").addEventListener("keydown", function (e) {
                        if (e.key === "Enter") runSearch();
                    });
                    document.getElementById("pg-search-page").addEventListener("keydown", function (e) {
                        if (e.key === "Enter") runSearch();
                    });
                    document.getElementById("pg-novel-url").addEventListener("keydown", function (e) {
                        if (e.key === "Enter") runNovel();
                    });
                    document.getElementById("pg-chapter-url").addEventListener("keydown", function (e) {
                        if (e.key === "Enter") runChapter();
                    });
                };

                function runSearch() {
                    var query = document.getElementById("pg-search-query").value.trim();
                    var page = parseInt(document.getElementById("pg-search-page").value) || 1;
                    if (!query) return;
                    lastSearchQuery = query;
                    currentPage = page;
                    pgCall(currentSource, "searchNovels", [query, page]);
                }

                function runNovel() {
                    var url = document.getElementById("pg-novel-url").value.trim();
                    if (!url) return;
                    pgCall(currentSource, "fetchNovelDetails", [url]);
                }

                function runChapter() {
                    var url = document.getElementById("pg-chapter-url").value.trim();
                    if (!url) return;
                    pgCall(currentSource, "fetchChapterContent", [url]);
                }

                function runDiscover() {
                    pgCall(currentSource, "getDiscoverSections", []);
                }

                function switchTab(method) {
                    currentMethod = method;
                    var tabs = document.querySelectorAll("#pg-tabs .pg-tab");
                    for (var i = 0; i < tabs.length; i++) {
                        var m = tabs[i].getAttribute("data-method");
                        if (m === method) {
                            tabs[i].classList.add("active");
                        } else {
                            tabs[i].classList.remove("active");
                        }
                    }
                    var methods = ["searchNovels", "fetchNovelDetails", "fetchChapterContent", "discover"];
                    for (var j = 0; j < methods.length; j++) {
                        var el = document.getElementById("pg-input-" + methods[j]);
                        if (el) el.style.display = methods[j] === method ? "flex" : "none";
                    }
                    hideResults();
                    hideError();
                }

                function pgCall(sourceId, method, args) {
                    showLoading();
                    hideError();
                    hideResults();
                    fetch("/api/call", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sourceId: sourceId, method: method, args: args }),
                    })
                    .then(function (resp) { return resp.json(); })
                    .then(function (data) {
                        hideLoading();
                        if (!data.ok) {
                            showError(data.error || "Unknown error");
                            return;
                        }
                        lastResult = data.result;
                        showResults(data.result, data.duration, method);
                    })
                    .catch(function (err) {
                        hideLoading();
                        showError(err.message);
                    });
                }

                function showLoading() {
                    document.getElementById("pg-loading").style.display = "block";
                }
                function hideLoading() {
                    document.getElementById("pg-loading").style.display = "none";
                }
                function showError(msg) {
                    var el = document.getElementById("pg-error");
                    el.textContent = msg;
                    el.style.display = "block";
                }
                function hideError() {
                    document.getElementById("pg-error").style.display = "none";
                }
                function hideResults() {
                    document.getElementById("pg-results").style.display = "none";
                }

                function showResults(result, duration, method) {
                    var resultsEl = document.getElementById("pg-results");
                    resultsEl.style.display = "block";
                    document.getElementById("pg-duration").textContent = duration ? duration + "ms" : "";

                    var rtabs = document.querySelectorAll(".pg-rtab");
                    for (var i = 0; i < rtabs.length; i++) {
                        rtabs[i].classList.toggle("active", rtabs[i].getAttribute("data-view") === "preview");
                    }
                    document.getElementById("pg-preview").style.display = "block";
                    document.getElementById("pg-json").style.display = "none";

                    var previewEl = document.getElementById("pg-preview");
                    if (method === "searchNovels") {
                        previewEl.innerHTML = renderSearchPreview(result);
                    } else if (method === "fetchNovelDetails") {
                        previewEl.innerHTML = renderNovelPreview(result);
                    } else if (method === "fetchChapterContent") {
                        previewEl.innerHTML = renderChapterPreview(result);
                    } else if (method === "getDiscoverSections") {
                        previewEl.innerHTML = renderDiscoverPreview(result);
                    } else if (method === "getDiscoverSectionItems") {
                        previewEl.innerHTML = renderSearchPreview(result);
                    } else {
                        previewEl.innerHTML = '<div class="pg-empty">No preview available</div>';
                    }

                    document.getElementById("pg-json").innerHTML = renderJson(result);
                }

                function renderSearchPreview(result) {
                    var html = "";
                    var items = result.items || [];
                    if (Array.isArray(result)) {
                        items = result;
                    }
                    items.forEach(function (item) {
                        // Normalize fields: Discover items use novelUrl/imageUrl, Search items use url/cover
                        var itemUrl = item.url || item.novelUrl || item.id || "";
                        var itemCover = item.cover || item.imageUrl || "";
                        var itemTitle = item.title || item.name || "";
                        var itemAuthor = item.author || item.subtitle || "";
                        html += '<div class="pg-card" data-nav="fetchNovelDetails" data-url="' + escAttr(itemUrl) + '">';
                        html += '<div class="pg-cover">' + (itemCover ? '<img src="/api/image-proxy?url=' + encodeURIComponent(itemCover) + '" onerror="this.style.display=&#39;none&#39;">' : '') + '</div>';
                        html += '<div class="pg-card-info">';
                        html += '<div class="pg-card-title">' + esc(itemTitle) + '</div>';
                        html += '<div class="pg-card-author">' + (itemAuthor ? esc(itemAuthor) : '') + '</div>';
                        html += '<div class="pg-card-tags">' + (item.tags || []).map(function (t) { return '<span class="pg-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
                        html += '</div>';
                        html += '<span class="pg-card-arrow">&rarr;</span>';
                        html += '</div>';
                    });
                    if (result.hasNextPage) {
                        html += '<div class="pg-next-page" data-nextpage="true">Load page ' + (currentPage + 1) + ' &rarr;</div>';
                    }
                    if (!items || items.length === 0) {
                        html += '<div class="pg-empty">No results</div>';
                    }
                    return html;
                }

                function renderNovelPreview(result) {
                    var html = '<div class="pg-detail-header">';
                    html += '<div class="pg-detail-cover">' + (result.cover ? '<img src="/api/image-proxy?url=' + encodeURIComponent(result.cover) + '" onerror="this.style.display=&#39;none&#39;">' : '') + '</div>';
                    html += '<div class="pg-detail-info">';
                    html += '<h3>' + esc(result.title || "") + '</h3>';
                    html += '<div class="pg-detail-author">' + (result.author ? 'by ' + esc(result.author) : '') + '</div>';
                    if (result.status) {
                        html += '<span class="pg-detail-status">' + esc(result.status) + '</span>';
                    }
                    if (result.description) {
                        html += '<div class="pg-detail-desc">' + esc(result.description) + '</div>';
                    }
                    if (result.tags && result.tags.length) {
                        html += '<div class="pg-card-tags">' + result.tags.map(function (t) { return '<span class="pg-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
                    }
                    html += '</div></div>';

                    var chapters = result.chapters || [];
                    if (chapters.length > 0) {
                        html += '<div class="pg-chapter-count">' + chapters.length + ' chapter' + (chapters.length !== 1 ? 's' : '') + '</div>';
                        html += '<div class="pg-ch-list">';
                        chapters.forEach(function (ch, idx) {
                            html += '<div class="pg-ch-item" data-nav="fetchChapterContent" data-url="' + escAttr(ch.url || ch.id || "") + '">';
                            html += '<span class="pg-ch-num">' + (idx + 1) + '</span>';
                            html += '<span class="pg-ch-title">' + esc(ch.title || 'Chapter ' + (idx + 1)) + '</span>';
                            if (ch.date) {
                                html += '<span class="pg-ch-date">' + esc(ch.date) + '</span>';
                            }
                            html += '</div>';
                        });
                        html += '</div>';
                    }
                    return html;
                }

                function renderChapterPreview(result) {
                    var content = result.content || result.html || result.text || "";
                    if (typeof result === "string") content = result;
                    var srcdoc = '<!DOCTYPE html><html><head><style>body{font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#e8e6e3;background:#16161d;padding:16px;margin:0;}img{max-width:100%;height:auto;}</style></head><body>' + content + '</body></html>';
                    var iframe = document.createElement("iframe");
                    iframe.sandbox = "";
                    iframe.setAttribute("srcdoc", srcdoc);
                    iframe.style.cssText = "width:100%;min-height:400px;border:none;border-radius:8px;background:var(--bg-surface);";
                    var wrapper = document.createElement("div");
                    wrapper.appendChild(iframe);
                    return wrapper.innerHTML;
                }

                function renderDiscoverPreview(result) {
                    var sections = Array.isArray(result) ? result : (result.sections || []);
                    if (sections.length === 0) {
                        return '<div class="pg-empty">No discover sections</div>';
                    }
                    var html = "";
                    sections.forEach(function (sec) {
                        html += '<div class="pg-section-card" data-discover="' + escAttr(sec.id || "") + '">';
                        if (sec.type) {
                            html += '<div class="pg-section-type">' + esc(sec.type) + '</div>';
                        }
                        html += '<div class="pg-section-title">' + esc(sec.title || "Untitled") + '</div>';
                        if (sec.subtitle) {
                            html += '<div class="pg-section-subtitle">' + esc(sec.subtitle) + '</div>';
                        }
                        html += '</div>';
                    });
                    return html;
                }

                function renderJson(obj) {
                    return '<pre>' + syntaxHighlight(JSON.stringify(obj, null, 2)) + '</pre>';
                }

                function syntaxHighlight(json) {
                    if (!json) return "";
                    json = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\b(true|false|null)\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
                        var cls = "num";
                        if (/^"/.test(match)) {
                            if (/:$/.test(match)) {
                                cls = "key";
                            } else {
                                cls = "str";
                            }
                        } else if (/true|false/.test(match)) {
                            cls = "bool";
                        } else if (/null/.test(match)) {
                            cls = "null";
                        }
                        return '<span class="' + cls + '">' + match + '</span>';
                    });
                }

                function esc(s) {
                    if (s == null) return "";
                    var d = document.createElement("div");
                    d.textContent = String(s);
                    return d.innerHTML;
                }

                function escAttr(s) {
                    return esc(s).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                }

                function pgNav(method, value) {
                    switchTab(method);
                    if (method === "fetchNovelDetails") {
                        document.getElementById("pg-novel-url").value = value;
                    }
                    if (method === "fetchChapterContent") {
                        document.getElementById("pg-chapter-url").value = value;
                    }
                    pgCall(currentSource, method, [value]);
                }

                function pgNextPage() {
                    currentPage = currentPage + 1;
                    document.getElementById("pg-search-page").value = currentPage;
                    pgCall(currentSource, "searchNovels", [lastSearchQuery, currentPage]);
                }

                function pgDiscoverSection(sectionId) {
                    pgCall(currentSource, "getDiscoverSectionItems", [sectionId, 1]);
                }

                document.getElementById("pg-preview").addEventListener("click", function(e) {
                    var target = e.target;
                    while (target && target !== this) {
                        if (target.getAttribute("data-nav")) {
                            pgNav(target.getAttribute("data-nav"), target.getAttribute("data-url"));
                            return;
                        }
                        if (target.getAttribute("data-discover")) {
                            pgDiscoverSection(target.getAttribute("data-discover"));
                            return;
                        }
                        if (target.getAttribute("data-nextpage")) {
                            pgNextPage();
                            return;
                        }
                        target = target.parentElement;
                    }
                });
            })();
        </script>
    </body>
</html>
`
}
