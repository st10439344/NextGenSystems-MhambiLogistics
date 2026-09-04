/*=========================================================
    MHAMBI LOGISTICS - ADMIN: PLATFORM REPORTS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("admin");
    if (!staff) return;

    const shipments = NGS.getShipments();
    const invoices = NGS.load("invoices", []);
    const inventory = NGS.load("inventory", []);

    const revenue = invoices.filter(function (i) { return i.status === "paid"; })
        .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    const outstanding = invoices.filter(function (i) { return i.status === "unpaid" || i.status === "overdue"; })
        .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    const lowStock = inventory.filter(function (i) { return i.status === "low-stock" || i.status === "out-of-stock"; }).length;

    document.getElementById("statRevenue").textContent = NGS.formatMoney(revenue);
    document.getElementById("statOutstanding").textContent = NGS.formatMoney(outstanding);
    document.getElementById("statLowStock").textContent = lowStock;
    document.getElementById("statTotalShipments").textContent = shipments.length;

    const statusCounts = {};
    shipments.forEach(function (s) {
        statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });

    const statusBody = document.getElementById("statusBreakdownBody");
    const statusRows = Object.keys(statusCounts);

    statusBody.innerHTML = statusRows.length === 0
        ? '<tr class="portal-empty-row"><td colspan="2">No shipments recorded yet.</td></tr>'
        : statusRows.map(function (key) {
            return "<tr><td><span class=\"history-status " + key + "\">" + NGS.statusLabel(key) + "</span></td><td>" + statusCounts[key] + "</td></tr>";
        }).join("");

    const clientCounts = {};
    shipments.forEach(function (s) {
        clientCounts[s.companyName] = (clientCounts[s.companyName] || 0) + 1;
    });

    const topClients = Object.keys(clientCounts)
        .map(function (name) { return { name: name, count: clientCounts[name] }; })
        .sort(function (a, b) { return b.count - a.count; })
        .slice(0, 6);

    const topClientsBody = document.getElementById("topClientsBody");

    topClientsBody.innerHTML = topClients.length === 0
        ? '<tr class="portal-empty-row"><td colspan="2">No client shipment activity yet.</td></tr>'
        : topClients.map(function (c) {
            return "<tr><td class=\"cell-strong\">" + NGS.escapeHtml(c.name) + "</td><td>" + c.count + "</td></tr>";
        }).join("");
});
