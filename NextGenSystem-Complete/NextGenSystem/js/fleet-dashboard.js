/*=========================================================
    MHAMBI LOGISTICS - FLEET DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("fleet");
    if (!staff) return;

    const vehicles = NGS.load("vehicles", []);

    document.getElementById("statTotal").textContent = vehicles.length;
    document.getElementById("statAvailable").textContent = vehicles.filter(function (v) { return v.status === "available"; }).length;
    document.getElementById("statOnRoute").textContent = vehicles.filter(function (v) { return v.status === "on-route"; }).length;
    document.getElementById("statMaintenance").textContent = vehicles.filter(function (v) { return v.status === "maintenance"; }).length;

    const now = new Date();
    const dueSoon = vehicles.filter(function (v) {
        if (!v.nextService) return false;
        const days = (new Date(v.nextService) - now) / 86400000;
        return days <= 14;
    }).sort(function (a, b) { return new Date(a.nextService) - new Date(b.nextService); });

    const tbody = document.getElementById("dueSoonBody");

    tbody.innerHTML = dueSoon.length === 0
        ? '<tr class="portal-empty-row"><td colspan="4">No vehicles are due for service in the next 14 days.</td></tr>'
        : dueSoon.map(function (v) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(v.plate) + "</td>" +
                "<td>" + NGS.escapeHtml(v.type) + "</td>" +
                "<td>" + NGS.formatDate(v.nextService) + "</td>" +
                "<td><span class=\"history-status " + v.status + "\">" + NGS.statusLabel(v.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
