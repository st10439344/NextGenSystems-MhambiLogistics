/*=========================================================
    MHAMBI LOGISTICS - DRIVER: MY DELIVERIES
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("driver");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "shipments",
        seed: NGS.getShipments(),
        tbody: "deliveriesBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        statusField: "status",
        baseFilter: function (r) {
            return r.driver === staff.name && (r.status === "assigned" || r.status === "in-transit");
        },
        emptyColspan: 8,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.trackingNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml(r.origin) + " &rarr; " + NGS.escapeHtml(r.destination); } },
            { render: function (r) { return (Number(r.weightKg) || 0).toLocaleString() + " kg"; } },
            { render: function (r) { return '<span class="history-status ' + (r.priority === "urgent" || r.priority === "high" ? "overdue" : "idle") + '">' + NGS.statusLabel(r.priority || "normal") + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.eta || "\u2014"); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            if (r.status === "assigned") {
                return '<button type="button" class="portal-icon-btn" data-action="start" title="Start trip"><i class="fas fa-play"></i></button>';
            }
            return '<button type="button" class="portal-icon-btn" data-action="deliver" title="Mark delivered"><i class="fas fa-circle-check"></i></button>';
        }
    });

    controller.render();

    document.getElementById("deliveriesBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "start") {
            controller.updateRecord(id, { status: "in-transit", eta: "En route" });
        }

        if (action === "deliver") {
            controller.updateRecord(id, { status: "delivered", eta: "Completed" });

            const vehicles = NGS.load("vehicles", []);
            const vIdx = vehicles.findIndex(function (v) { return v.id === record.vehicleId; });
            if (vIdx !== -1) {
                vehicles[vIdx].status = "available";
                vehicles[vIdx].driver = "";
                NGS.save("vehicles", vehicles);
            }
        }
    });
});
