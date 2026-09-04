/*=========================================================
    MHAMBI LOGISTICS - DRIVER: DELIVERY HISTORY
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("driver");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "shipments",
        seed: NGS.getShipments(),
        tbody: "historyBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        statusField: "status",
        baseFilter: function (r) {
            return r.driver === staff.name && (r.status === "delivered" || r.status === "cancelled");
        },
        emptyColspan: 6,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.trackingNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml(r.origin) + " &rarr; " + NGS.escapeHtml(r.destination); } },
            { render: function (r) { return (Number(r.weightKg) || 0).toLocaleString() + " kg"; } },
            { render: function (r) { return NGS.formatDate(r.shipmentDate); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ]
    });

    controller.render();
});
