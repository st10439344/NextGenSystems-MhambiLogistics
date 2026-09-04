/*=========================================================
    MHAMBI LOGISTICS - DRIVER DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("driver");
    if (!staff) return;

    const shipments = NGS.getShipments().filter(function (s) { return s.driver === staff.name; });
    const vehicles = NGS.load("vehicles", []);
    const myVehicle = vehicles.find(function (v) { return v.driver === staff.name; });

    const active = shipments.filter(function (s) { return s.status === "assigned" || s.status === "in-transit"; });
    const delivered = shipments.filter(function (s) { return s.status === "delivered"; });

    const now = new Date();
    const deliveredThisMonth = delivered.filter(function (s) {
        const d = new Date(s.shipmentDate);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    document.getElementById("statActive").textContent = active.length;
    document.getElementById("statDeliveredMonth").textContent = deliveredThisMonth.length;
    document.getElementById("statVehicle").textContent = myVehicle ? myVehicle.plate : "Unassigned";
    document.getElementById("statTotalDelivered").textContent = delivered.length;

    const tbody = document.getElementById("activeBody");

    tbody.innerHTML = active.length === 0
        ? '<tr class="portal-empty-row"><td colspan="5">You have no active deliveries right now.</td></tr>'
        : active.map(function (s) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(s.trackingNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(s.companyName) + "</td>" +
                "<td>" + NGS.escapeHtml(s.origin) + " &rarr; " + NGS.escapeHtml(s.destination) + "</td>" +
                "<td>" + NGS.escapeHtml(s.eta || "\u2014") + "</td>" +
                "<td><span class=\"history-status " + s.status + "\">" + NGS.statusLabel(s.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
