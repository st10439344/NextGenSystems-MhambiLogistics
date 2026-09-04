/*=========================================================
    MHAMBI LOGISTICS - DISPATCHER: LOAD BOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("dispatcher");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "shipments",
        seed: NGS.getShipments(),
        tbody: "loadBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        statusField: "status",
        baseFilter: function (r) { return r.status === "assigned" || r.status === "in-transit"; },
        emptyColspan: 8,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.trackingNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml(r.origin) + " &rarr; " + NGS.escapeHtml(r.destination); } },
            { render: function (r) { return NGS.escapeHtml(r.driver || "\u2014"); } },
            { render: function (r) { return NGS.escapeHtml(r.vehicle || "\u2014"); } },
            { render: function (r) { return NGS.escapeHtml(r.eta || "\u2014"); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            return '<button type="button" class="portal-icon-btn" data-action="deliver" title="Mark delivered"><i class="fas fa-circle-check"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="cancel" title="Cancel shipment"><i class="fas fa-ban"></i></button>';
        }
    });

    controller.render();

    document.getElementById("loadBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        const vehicles = NGS.load("vehicles", []);
        const vIdx = vehicles.findIndex(function (v) { return v.id === record.vehicleId; });

        if (action === "deliver") {
            controller.updateRecord(id, { status: "delivered", eta: "Completed" });
            if (vIdx !== -1) {
                vehicles[vIdx].status = "available";
                vehicles[vIdx].driver = "";
                NGS.save("vehicles", vehicles);
            }
        }

        if (action === "cancel") {
            if (confirm("Cancel shipment " + record.trackingNumber + "?")) {
                controller.updateRecord(id, { status: "cancelled", eta: "\u2014" });
                if (vIdx !== -1) {
                    vehicles[vIdx].status = "available";
                    vehicles[vIdx].driver = "";
                    NGS.save("vehicles", vehicles);
                }
            }
        }
    });
});
