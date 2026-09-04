/*=========================================================
    MHAMBI LOGISTICS
    SHARED PORTAL LIST/TABLE ENGINE
    A small reusable helper used by every staff portal
    page to render searchable, filterable, editable
    tables backed by localStorage, plus dashboard stat
    cards. Individual role JS files supply the data and
    column configuration.
=========================================================*/

window.NGS = window.NGS || {};

/**
 * Creates a controller for a searchable / filterable /
 * editable table backed by a localStorage key.
 *
 * options = {
 *   storageKey, seed,
 *   tbody, searchInput, statusFilter, clearBtn, countLabel,
 *   statusField, columns: [{ label, render(row) => html }],
 *   rowActions(row) => html,
 *   emptyColspan
 * }
 */
NGS.createTableController = function (options) {
    const state = {
        data: NGS.seedIfEmpty(options.storageKey, options.seed || []),
        search: "",
        status: "all"
    };

    function persist() {
        NGS.save(options.storageKey, state.data);
    }

    function matches(row) {
        if (options.baseFilter && !options.baseFilter(row)) return false;

        const statusOk = state.status === "all" || (row[options.statusField] || "").toLowerCase() === state.status;

        if (!statusOk) return false;

        if (!state.search) return true;

        const haystack = Object.values(row).join(" ").toLowerCase();

        return haystack.indexOf(state.search.toLowerCase()) !== -1;
    }

    function render() {
        const tbody = document.getElementById(options.tbody);

        if (!tbody) return;

        const filtered = state.data.filter(matches);

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr class="portal-empty-row"><td colspan="' + (options.emptyColspan || 6) + '">No matching records found.</td></tr>';
        } else {
            tbody.innerHTML = filtered.map(function (row) {
                const cells = options.columns.map(function (col) {
                    return "<td>" + col.render(row) + "</td>";
                }).join("");

                const actions = options.rowActions ? "<td><div class=\"portal-row-actions\">" + options.rowActions(row) + "</div></td>" : "";

                return "<tr data-id=\"" + row.id + "\">" + cells + actions + "</tr>";
            }).join("");
        }

        const countEl = document.getElementById(options.countLabel);

        if (countEl) {
            countEl.textContent = filtered.length + (filtered.length === 1 ? " Record" : " Records");
        }

        if (options.onRender) options.onRender(state.data);
    }

    const searchInput = document.getElementById(options.searchInput);

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            state.search = searchInput.value.trim();
            render();
        });
    }

    const statusFilter = document.getElementById(options.statusFilter);

    if (statusFilter) {
        statusFilter.addEventListener("change", function () {
            state.status = statusFilter.value;
            render();
        });
    }

    const clearBtn = document.getElementById(options.clearBtn);

    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            state.search = "";
            state.status = "all";
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "all";
            render();
        });
    }

    return {
        render: render,
        getData: function () { return state.data; },
        addRecord: function (record) {
            record.id = record.id || NGS.uid(options.storageKey);
            state.data.unshift(record);
            persist();
            render();
            return record;
        },
        updateRecord: function (id, patch) {
            const idx = state.data.findIndex(function (r) { return r.id === id; });
            if (idx === -1) return null;
            state.data[idx] = Object.assign({}, state.data[idx], patch);
            persist();
            render();
            return state.data[idx];
        },
        deleteRecord: function (id) {
            state.data = state.data.filter(function (r) { return r.id !== id; });
            persist();
            render();
        },
        findRecord: function (id) {
            return state.data.find(function (r) { return r.id === id; }) || null;
        }
    };
};

/* Toggles an add/edit form panel open and closed */
NGS.toggleFormPanel = function (panelId, forceOpen) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const shouldOpen = forceOpen !== undefined ? forceOpen : !panel.classList.contains("open");
    panel.classList.toggle("open", shouldOpen);
};
