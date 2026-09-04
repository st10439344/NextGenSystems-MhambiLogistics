/*=========================================================
    MHAMBI LOGISTICS - PROCUREMENT DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("procurement");
    if (!staff) return;

    const pos = NGS.load("purchaseOrders", []);
    const suppliers = NGS.load("suppliers", []);

    const open = pos.filter(function (p) { return p.status !== "received" && p.status !== "cancelled"; });
    const pending = pos.filter(function (p) { return p.status === "pending"; });

    const now = new Date();
    const spend = pos.filter(function (p) {
        const d = new Date(p.dateRequested);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce(function (sum, p) { return sum + (Number(p.quantity) || 0) * (Number(p.unitCost) || 0); }, 0);

    document.getElementById("statOpen").textContent = open.length;
    document.getElementById("statPending").textContent = pending.length;
    document.getElementById("statSuppliers").textContent = suppliers.filter(function (s) { return s.status === "active"; }).length;
    document.getElementById("statSpend").textContent = NGS.formatMoney(spend);

    const recent = pos.slice().sort(function (a, b) {
        return new Date(b.dateRequested) - new Date(a.dateRequested);
    }).slice(0, 8);

    document.getElementById("recentPoBody").innerHTML = recent.length === 0
        ? '<tr class="portal-empty-row"><td colspan="5">No purchase orders yet.</td></tr>'
        : recent.map(function (p) {
            const total = (Number(p.quantity) || 0) * (Number(p.unitCost) || 0);
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(p.poNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(p.supplier) + "</td>" +
                "<td>" + NGS.escapeHtml(p.item) + "</td>" +
                "<td>" + NGS.formatMoney(total) + "</td>" +
                "<td><span class=\"history-status " + p.status + "\">" + NGS.statusLabel(p.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
