/*=========================================================
    MHAMBI LOGISTICS - ADMIN DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("admin");
    if (!staff) return;

    const companies = NGS.getCompanies();
    const shipments = NGS.getShipments();
    const vehicles = NGS.load("vehicles", []);

    document.getElementById("statClients").textContent = companies.length;
    document.getElementById("statStaff").textContent = NGS.load("staffAccounts", []).length;

    const active = shipments.filter(function (s) {
        return ["pending", "assigned", "in-transit"].indexOf(s.status) !== -1;
    }).length;
    document.getElementById("statActiveShipments").textContent = active;

    const availableVehicles = vehicles.filter(function (v) { return v.status === "available"; }).length;
    document.getElementById("statVehiclesAvailable").textContent = availableVehicles;

    const tbody = document.getElementById("recentShipmentsBody");
    const recent = shipments.slice().sort(function (a, b) {
        return new Date(b.shipmentDate) - new Date(a.shipmentDate);
    }).slice(0, 8);

    if (recent.length === 0) {
        tbody.innerHTML = '<tr class="portal-empty-row"><td colspan="6">No shipments recorded yet.</td></tr>';
    } else {
        tbody.innerHTML = recent.map(function (s) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(s.trackingNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(s.companyName) + "</td>" +
                "<td>" + NGS.escapeHtml(s.origin) + " &rarr; " + NGS.escapeHtml(s.destination) + "</td>" +
                "<td>" + (s.driver ? NGS.escapeHtml(s.driver) : '<span class="cell-muted">Unassigned</span>') + "</td>" +
                "<td><span class=\"history-status " + s.status + "\">" + NGS.statusLabel(s.status) + "</span></td>" +
                "<td>" + NGS.escapeHtml(s.eta) + "</td>" +
                "</tr>";
        }).join("");
    }
});
