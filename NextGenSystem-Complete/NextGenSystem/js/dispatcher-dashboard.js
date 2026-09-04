/*=========================================================
    MHAMBI LOGISTICS - DISPATCHER DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("dispatcher");
    if (!staff) return;

    const shipments = NGS.getShipments();
    const vehicles = NGS.load("vehicles", []);

    document.getElementById("statPending").textContent = shipments.filter(function (s) { return s.status === "pending"; }).length;
    document.getElementById("statInTransit").textContent = shipments.filter(function (s) { return s.status === "in-transit"; }).length;
    document.getElementById("statDelivered").textContent = shipments.filter(function (s) { return s.status === "delivered"; }).length;
    document.getElementById("statAvailable").textContent = vehicles.filter(function (v) { return v.status === "available"; }).length;

    const pending = shipments.filter(function (s) { return s.status === "pending"; });
    const tbody = document.getElementById("pendingBody");

    tbody.innerHTML = pending.length === 0
        ? '<tr class="portal-empty-row"><td colspan="6">No shipments are waiting on assignment. Great work!</td></tr>'
        : pending.map(function (s) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(s.trackingNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(s.companyName) + "</td>" +
                "<td>" + NGS.escapeHtml(s.origin) + " &rarr; " + NGS.escapeHtml(s.destination) + "</td>" +
                "<td>" + (Number(s.weightKg) || 0).toLocaleString() + " kg</td>" +
                "<td><span class=\"history-status " + (s.priority === "urgent" || s.priority === "high" ? "overdue" : "idle") + "\">" + NGS.statusLabel(s.priority || "normal") + "</span></td>" +
                "<td><span class=\"history-status pending\">Pending</span></td>" +
                "</tr>";
        }).join("");
});
