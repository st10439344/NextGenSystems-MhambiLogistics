/*=========================================================
    MHAMBI LOGISTICS - ADMIN: STAFF USER MANAGEMENT
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("admin");
    if (!staff) return;

    const ROLE_LABELS = {
        admin: "Administrator", dispatcher: "Dispatcher", driver: "Driver",
        finance: "Finance Officer", fleet: "Fleet Manager",
        procurement: "Procurement Officer", warehouse: "Warehouse Manager"
    };

    const controller = NGS.createTableController({
        storageKey: "staffAccounts",
        seed: NGS.STAFF_ROLES,
        tbody: "staffBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "staffCount",
        statusField: "role",
        emptyColspan: 5,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.name) + "</span>"; } },
            { render: function (r) { return '<span class="history-status assigned">' + NGS.escapeHtml(r.label || ROLE_LABELS[r.role] || r.role) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.email); } },
            { render: function (r) { return '<span class="cell-muted">' + NGS.escapeHtml(r.password) + "</span>"; } }
        ],
        rowActions: function (r) {
            return '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit account"><i class="fas fa-pen"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove account"><i class="fas fa-trash"></i></button>';
        }
    });

    controller.render();

    const panel = "staffFormPanel";
    const form = document.getElementById("staffForm");
    const title = document.getElementById("staffFormTitle");
    const editIdField = document.getElementById("staffEditId");
    const addBtn = document.getElementById("addStaffBtn");
    const cancelBtn = document.getElementById("staffCancelBtn");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "Add Staff Account";
    }

    addBtn.addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    cancelBtn.addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("staffBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "delete") {
            if (confirm("Remove the account for " + record.name + "?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            document.getElementById("staffName").value = record.name;
            document.getElementById("staffRole").value = record.role;
            document.getElementById("staffEmail").value = record.email;
            document.getElementById("staffPassword").value = record.password;
            editIdField.value = id;
            title.textContent = "Edit Staff Account";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const role = document.getElementById("staffRole").value;
        const record = {
            name: document.getElementById("staffName").value.trim(),
            role: role,
            label: ROLE_LABELS[role] || role,
            email: document.getElementById("staffEmail").value.trim().toLowerCase(),
            password: document.getElementById("staffPassword").value.trim()
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({ id: NGS.uid("staff") }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
