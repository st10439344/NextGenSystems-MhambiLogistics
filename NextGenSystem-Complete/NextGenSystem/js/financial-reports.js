/*=========================================================
    MHAMBI LOGISTICS - FINANCE: REPORTS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("finance");
    if (!staff) return;

    const invoices = NGS.load("invoices", []);

    const revenue = invoices.filter(function (i) { return i.status === "paid"; })
        .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    const outstanding = invoices.filter(function (i) { return i.status !== "paid"; })
        .reduce(function (sum, i) { return sum + (Number(i.amount) || 0); }, 0);

    document.getElementById("statRevenue").textContent = NGS.formatMoney(revenue);
    document.getElementById("statOutstanding").textContent = NGS.formatMoney(outstanding);

    const clientTotals = {};
    invoices.forEach(function (i) {
        clientTotals[i.companyName] = (clientTotals[i.companyName] || 0) + (Number(i.amount) || 0);
    });

    const topClients = Object.keys(clientTotals)
        .map(function (name) { return { name: name, total: clientTotals[name] }; })
        .sort(function (a, b) { return b.total - a.total; })
        .slice(0, 6);

    document.getElementById("topClientsBody").innerHTML = topClients.length === 0
        ? '<tr class="portal-empty-row"><td colspan="2">No invoices recorded yet.</td></tr>'
        : topClients.map(function (c) {
            return "<tr><td class=\"cell-strong\">" + NGS.escapeHtml(c.name) + "</td><td>" + NGS.formatMoney(c.total) + "</td></tr>";
        }).join("");

    const aging = invoices.filter(function (i) { return i.status !== "paid"; })
        .sort(function (a, b) { return new Date(a.dueDate) - new Date(b.dueDate); });

    document.getElementById("agingBody").innerHTML = aging.length === 0
        ? '<tr class="portal-empty-row"><td colspan="5">Nothing outstanding \u2014 all invoices are paid.</td></tr>'
        : aging.map(function (i) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(i.invoiceNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(i.companyName) + "</td>" +
                "<td>" + NGS.formatMoney(i.amount) + "</td>" +
                "<td>" + NGS.formatDate(i.dueDate) + "</td>" +
                "<td><span class=\"history-status " + i.status + "\">" + NGS.statusLabel(i.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
