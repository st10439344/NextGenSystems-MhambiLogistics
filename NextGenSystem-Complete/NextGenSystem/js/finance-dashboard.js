/*=========================================================
    MHAMBI LOGISTICS - FINANCE DASHBOARD
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("finance");
    if (!staff) return;

    const invoices = NGS.load("invoices", []);

    document.getElementById("statTotalInvoiced").textContent = invoices.length;
    document.getElementById("statPaid").textContent = invoices.filter(function (i) { return i.status === "paid"; }).length;
    document.getElementById("statUnpaid").textContent = invoices.filter(function (i) { return i.status === "unpaid"; }).length;
    document.getElementById("statOverdue").textContent = invoices.filter(function (i) { return i.status === "overdue"; }).length;

    const recent = invoices.slice().sort(function (a, b) {
        return new Date(b.issueDate) - new Date(a.issueDate);
    }).slice(0, 8);

    const tbody = document.getElementById("recentInvoicesBody");

    tbody.innerHTML = recent.length === 0
        ? '<tr class="portal-empty-row"><td colspan="5">No invoices have been issued yet.</td></tr>'
        : recent.map(function (i) {
            return "<tr>" +
                "<td class=\"cell-strong\">" + NGS.escapeHtml(i.invoiceNumber) + "</td>" +
                "<td>" + NGS.escapeHtml(i.companyName) + "</td>" +
                "<td>" + NGS.formatMoney(i.amount) + "</td>" +
                "<td>" + NGS.formatDate(i.dueDate) + "</td>" +
                "<td><span class=\"history-status " + i.status + "\">" + NGS.statusLabel(i.status) + "</span></td>" +
                "</tr>";
        }).join("");
});
