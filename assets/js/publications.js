/* Publication list renderer.
 *
 * Vanilla, no dependencies, no build step. Runs on a Jekyll site that ships no
 * other JavaScript and on a Hugo site that already loads jQuery and Bootstrap,
 * touching neither.
 *
 * The mount element carries every site-specific value, because only the site's
 * own template language can resolve its base URL:
 *
 *   <div class="pubs" data-src="…/publications.json"
 *        data-per-page="25"> fallback </div>
 *
 * Rendering is createElement and textContent throughout. Titles arrive with
 * Crossref markup stripped in Python, but nothing here may assume that.
 */
(function () {
    "use strict";

    var SCHEMA = 1;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text !== undefined && text !== null) { node.textContent = text; }
        return node;
    }

    function fold(value) {
        var lowered = String(value).toLowerCase();
        if (lowered.normalize) {
            return lowered.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        return lowered;
    }

    function safeHref(url) {
        return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
    }

    function readState(root) {
        var state = { q: "", type: "", author: "", order: "new", page: 1 };
        var hash = window.location.hash.replace(/^#/, "");
        if (!hash) { return state; }
        hash.split("&").forEach(function (pair) {
            var bits = pair.split("=");
            var key = decodeURIComponent(bits[0] || "");
            var value = decodeURIComponent((bits[1] || "").replace(/\+/g, " "));
            if (key === "q") { state.q = value; }
            if (key === "type") { state.type = value; }
            if (key === "author") { state.author = fold(value); }
            if (key === "order" && value === "old") { state.order = "old"; }
            if (key === "p") { state.page = Math.max(1, parseInt(value, 10) || 1); }
        });
        return state;
    }

    function writeState(state) {
        var parts = [];
        if (state.q) { parts.push("q=" + encodeURIComponent(state.q)); }
        if (state.type) { parts.push("type=" + encodeURIComponent(state.type)); }
        if (state.author) { parts.push("author=" + encodeURIComponent(state.author)); }
        if (state.order === "old") { parts.push("order=old"); }
        if (state.page > 1) { parts.push("p=" + state.page); }
        var hash = parts.length ? "#" + parts.join("&") : " ";
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", hash === " " ? window.location.pathname : hash);
        }
    }

    function matches(item, tokens) {
        for (var i = 0; i < tokens.length; i += 1) {
            if (item.search.indexOf(tokens[i]) === -1) { return false; }
        }
        return true;
    }

    /* The search blob holds every surname, including those truncated out of
     * the display, so an author filter needs no extra payload. Match on word
     * boundaries: a bare indexOf would let "Ida" select "Idaho". */
    var authorPatterns = {};

    function byAuthor(item, name) {
        if (!name) { return true; }
        var pattern = authorPatterns[name];
        if (!pattern) {
            var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            pattern = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)");
            authorPatterns[name] = pattern;
        }
        return pattern.test(item.search);
    }

    function citation(item) {
        var bits = [];
        if (item.venue) { bits.push(item.venue); }
        var locator = "";
        if (item.volume) { locator += item.volume; }
        if (item.issue) { locator += "(" + item.issue + ")"; }
        if (item.pages) { locator += (locator ? ", " : "") + item.pages; }
        if (locator) { bits.push(locator); }
        if (item.year) { bits.push(String(item.year)); }
        return bits;
    }

    function renderItem(item) {
        var li = el("li", "pubs__item");

        var href = safeHref(item.url);
        var title;
        if (href) {
            title = el("a", "pubs__title", item.title);
            title.setAttribute("href", href);
            title.setAttribute("rel", "noopener");
        } else {
            title = el("span", "pubs__title", item.title);
        }
        li.appendChild(title);

        var authors = el("span", "pubs__authors", item.authors.join(", "));
        if (item.authors_total > item.authors.length) {
            authors.textContent += " and " +
                (item.authors_total - item.authors.length) + " others";
        }
        li.appendChild(authors);

        var meta = el("span", "pubs__meta");
        var bits = citation(item);
        if (item.venue) {
            meta.appendChild(el("span", "pubs__venue", bits.shift()));
            if (bits.length) { meta.appendChild(document.createTextNode(" " + bits.join(", "))); }
        } else if (bits.length) {
            meta.appendChild(document.createTextNode(bits.join(", ")));
        }
        if (item.note && !item.venue) {
            if (meta.childNodes.length) { meta.appendChild(document.createTextNode(" · ")); }
            meta.appendChild(document.createTextNode(item.note));
        }
        if (item.doi) {
            meta.appendChild(document.createTextNode(" "));
            // The DOI is the route to the paper when no file is linkable,
            // so it is a link and not decoration.
            var doi = el("a", "pubs__doi", item.doi);
            doi.setAttribute("href", "https://doi.org/" + item.doi);
            doi.setAttribute("rel", "noopener");
            meta.appendChild(doi);
        }
        if (item.invited) { meta.appendChild(el("span", "pubs__tag", "Invited")); }
        // Open without a linkable file: say so, the DOI leads to the copy.
        if (item.open_access && !item.pdf) {
            meta.appendChild(el("span", "pubs__tag", "Open access"));
        }
        var full = safeHref(item.pdf);
        if (full) {
            meta.appendChild(document.createTextNode(" "));
            var pdf = el("a", "pubs__pdf", "[pdf]");
            pdf.setAttribute("href", full);
            pdf.setAttribute("rel", "noopener");
            pdf.setAttribute("title", item.pdf_kind === "archive"
                ? "Full text from the institute archive"
                : "Open-access full text");
            meta.appendChild(pdf);
        }
        li.appendChild(meta);
        return li;
    }

    function pageButton(label, page, current, disabled, onGo) {
        var button = el("button", "pubs__page", label);
        button.setAttribute("type", "button");
        if (disabled) { button.setAttribute("disabled", "disabled"); }
        if (page === current) { button.setAttribute("aria-current", "page"); }
        button.addEventListener("click", function () { onGo(page); });
        return button;
    }

    function renderPager(container, page, pages, onGo) {
        container.replaceChildren();
        if (pages < 2) { return; }
        container.appendChild(pageButton("‹ Prev", page - 1, -1, page <= 1, onGo));
        var window_ = [];
        for (var n = 1; n <= pages; n += 1) {
            if (n === 1 || n === pages || Math.abs(n - page) <= 2) { window_.push(n); }
        }
        var previous = 0;
        window_.forEach(function (n) {
            if (previous && n - previous > 1) {
                container.appendChild(el("span", "pubs__gap", "…"));
            }
            container.appendChild(pageButton(String(n), n, page, false, onGo));
            previous = n;
        });
        container.appendChild(pageButton("Next ›", page + 1, -1, page >= pages, onGo));
    }

    function mount(root, data) {
        var perPage = parseInt(root.getAttribute("data-per-page"), 10) || 25;
        var state = readState(root);

        root.replaceChildren();

        if (data.links && data.links.length) {
            var profile = el("p", "pubs__profile");
            data.links.forEach(function (link) {
                var href = safeHref(link.url);
                if (!href) { return; }
                var anchor = el("a", null, link.label);
                anchor.setAttribute("href", href);
                anchor.setAttribute("rel", "noopener");
                profile.appendChild(anchor);
            });
            if (profile.childNodes.length) { root.appendChild(profile); }
        }

        var controls = el("div", "pubs__controls");
        var search = el("input", "pubs__search");
        search.setAttribute("type", "search");
        search.setAttribute("placeholder", "Search title, author, venue, year, DOI");
        search.setAttribute("aria-label", "Search publications");
        search.value = state.q;
        controls.appendChild(search);

        var typeSelect = el("select", "pubs__select");
        typeSelect.setAttribute("aria-label", "Filter by category");
        typeSelect.appendChild(new Option("All categories", ""));
        (data.types || []).forEach(function (entry) {
            typeSelect.appendChild(new Option(entry.label, entry.value));
        });
        typeSelect.value = state.type;
        controls.appendChild(typeSelect);

        var authorSelect = el("select", "pubs__select");
        authorSelect.setAttribute("aria-label", "Filter by author");
        authorSelect.appendChild(new Option("All authors", ""));
        (data.authors || []).forEach(function (entry) {
            authorSelect.appendChild(
                new Option(entry.label + " (" + entry.count + ")", entry.value));
        });
        authorSelect.value = state.author;
        if (state.author && authorSelect.value !== state.author) {
            // A deep link may name someone below the facet threshold.
            authorSelect.appendChild(new Option(state.author, state.author));
            authorSelect.value = state.author;
        }
        if ((data.authors || []).length) { controls.appendChild(authorSelect); }

        var orderSelect = el("select", "pubs__select");
        orderSelect.setAttribute("aria-label", "Sort order");
        orderSelect.appendChild(new Option("Newest first", "new"));
        orderSelect.appendChild(new Option("Oldest first", "old"));
        orderSelect.value = state.order;
        controls.appendChild(orderSelect);
        root.appendChild(controls);

        var status = el("p", "pubs__status");
        status.setAttribute("aria-live", "polite");
        root.appendChild(status);

        var list = el("ol", "pubs__list");
        root.appendChild(list);
        var pager = el("nav", "pubs__pager");
        pager.setAttribute("aria-label", "Publication list pages");
        root.appendChild(pager);

        function go(page) {
            state.page = page;
            render();
            root.scrollIntoView({ block: "start" });
        }

        function render() {
            var tokens = fold(state.q).split(/\s+/).filter(Boolean);
            var rows = data.items.filter(function (item) {
                if (state.type && item.categories.indexOf(state.type) === -1) { return false; }
                if (!byAuthor(item, state.author)) { return false; }
                return !tokens.length || matches(item, tokens);
            });
            if (state.order === "old") {
                var dated = rows.filter(function (i) { return i.year !== null; });
                var undated = rows.filter(function (i) { return i.year === null; });
                rows = dated.reverse().concat(undated);
            }

            var pages = Math.max(1, Math.ceil(rows.length / perPage));
            if (state.page > pages) { state.page = pages; }
            var from = (state.page - 1) * perPage;
            var slice = rows.slice(from, from + perPage);

            list.replaceChildren();
            if (!rows.length) {
                list.appendChild(el("li", "pubs__empty", "No publications match this search."));
                status.textContent = "0 of " + data.count + " publications";
            } else {
                slice.forEach(function (item) { list.appendChild(renderItem(item)); });
                status.textContent = "Showing " + (from + 1) + "–" +
                    (from + slice.length) + " of " + rows.length +
                    (rows.length === data.count ? " publications" : " matching publications");
            }
            renderPager(pager, state.page, pages, go);
            writeState(state);
        }

        var timer = null;
        search.addEventListener("input", function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(function () {
                state.q = search.value;
                state.page = 1;
                render();
            }, 120);
        });
        authorSelect.addEventListener("change", function () {
            state.author = authorSelect.value;
            state.page = 1;
            render();
        });
        typeSelect.addEventListener("change", function () {
            state.type = typeSelect.value;
            state.page = 1;
            render();
        });
        orderSelect.addEventListener("change", function () {
            state.order = orderSelect.value;
            state.page = 1;
            render();
        });
        window.addEventListener("hashchange", function () {
            state = readState(root);
            search.value = state.q;
            typeSelect.value = state.type;
            authorSelect.value = state.author;
            orderSelect.value = state.order;
            render();
        });

        render();
    }

    function fail(root, message) {
        var note = el("p", "pubs__empty", message);
        root.insertBefore(note, root.firstChild);
    }

    function boot() {
        var roots = document.querySelectorAll(".pubs[data-src]");
        Array.prototype.forEach.call(roots, function (root) {
            fetch(root.getAttribute("data-src"), { credentials: "same-origin" })
                .then(function (response) {
                    if (!response.ok) { throw new Error(String(response.status)); }
                    return response.json();
                })
                .then(function (data) {
                    if (data.schema !== SCHEMA) {
                        fail(root, "Publication list format changed; the page needs an update.");
                        return;
                    }
                    mount(root, data);
                })
                .catch(function () {
                    fail(root, "Could not load the publication list.");
                });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
}());
