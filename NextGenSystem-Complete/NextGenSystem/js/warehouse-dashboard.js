/*=========================================================
    MHAMBI LOGISTICS - WAREHOUSE DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("warehouse");
    if (!staff) return;

    const inventory = NGS.load("inventory", []);
    const pos = NGS.load("purchaseOrders", []);

    document.getElementById("statSkus").textContent = inventory.length;
    document.getElementById("statLowStock").textContent = inventory.filter(function (i) { return i.status === "low-stock"; }).length;
    document.getElementById("statOutOfStock").textContent = inventory.filter(function (i) { return i.status === "out-of-stock"; }).length;
    document.getElementById("statIncoming").textContent = pos.filter(function (p) { return p.status === "ordered"; }).length;

    const alerts = inventory.filter(function (i) { return i.status === "low-stock" || i.status === "out-of-stock"; });

    document.getElementById("lowStockBody").innerHTML = alerts.length === 0
        ? '<tr class="portal-empty-row"><td colspan="5">All stock levels are healthy right now.</td></tr>'
        : alerts.map(function (i) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(i.sku) + "</td>" +
                "<td>" + NGS.escapeHtml(i.name) + "</td>" +
                "<td>" + (Number(i.quantity) || 0) + " " + NGS.escapeHtml(i.unit || "") + "</td>" +
                "<td>" + (Number(i.reorderLevel) || 0) + "</td>" +
                "<td><span class=\"history-status " + i.status + "\">" + NGS.statusLabel(i.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
