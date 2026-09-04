/*=========================================================
    MHAMBI LOGISTICS - FLEET: MAINTENANCE SCHEDULE
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("fleet");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "vehicles",
        seed: NGS.SEED_VEHICLES,
        tbody: "maintenanceBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        statusField: "status",
        emptyColspan: 6,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.plate) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.type); } },
            { render: function (r) { return NGS.formatDate(r.lastService); } },
            { render: function (r) { return NGS.formatDate(r.nextService); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            let btns = '<button type="button" class="portal-icon-btn" data-action="service" title="Log completed service"><i class="fas fa-oil-can"></i></button>';
            if (r.status !== "maintenance") {
                btns += '<button type="button" class="portal-icon-btn danger" data-action="send" title="Send to maintenance"><i class="fas fa-triangle-exclamation"></i></button>';
            }
            return btns;
        }
    });

    controller.render();

    document.getElementById("maintenanceBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");

        if (action === "service") {
            const today = new Date();
            const next = new Date();
            next.setDate(next.getDate() + 90);

            controller.updateRecord(id, {
                lastService: today.toISOString().slice(0, 10),
                nextService: next.toISOString().slice(0, 10),
                status: "available"
            });
        }

        if (action === "send") {
            controller.updateRecord(id, { status: "maintenance" });
        }
    });
});
