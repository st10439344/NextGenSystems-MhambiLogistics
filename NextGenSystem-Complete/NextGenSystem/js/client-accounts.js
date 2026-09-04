/*=========================================================
    MHAMBI LOGISTICS - ADMIN: CLIENT ACCOUNTS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("admin");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "registeredCompanies",
        seed: NGS.getCompanies(),
        tbody: "companiesBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "companyCount",
        statusField: "accountStatus",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.clientID || r.id) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml((r.firstName || "") + " " + (r.lastName || "")); } },
            { render: function (r) { return NGS.escapeHtml(r.companyEmail || r.email || "\u2014"); } },
            { render: function (r) { return NGS.escapeHtml(r.industry || "\u2014"); } },
            { render: function (r) { return '<span class="history-status ' + (r.accountStatus || "active").toLowerCase() + '">' + NGS.escapeHtml(r.accountStatus || "Active") + "</span>"; } }
        ],
        rowActions: function (r) {
            const isActive = (r.accountStatus || "Active").toLowerCase() === "active";
            const toggleIcon = isActive ? "fa-ban" : "fa-circle-check";
            const toggleTitle = isActive ? "Suspend account" : "Reactivate account";
            return '<button type="button" class="portal-icon-btn" data-action="toggle" title="' + toggleTitle + '"><i class="fas ' + toggleIcon + '"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove account"><i class="fas fa-trash"></i></button>';
        }
    });

    controller.render();

    document.getElementById("companiesBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "toggle") {
            const isActive = (record.accountStatus || "Active").toLowerCase() === "active";
            controller.updateRecord(id, { accountStatus: isActive ? "Suspended" : "Active" });
        }

        if (action === "delete") {
            if (confirm("Remove " + record.companyName + " from the platform? This cannot be undone.")) {
                controller.deleteRecord(id);
            }
        }
    });
});
