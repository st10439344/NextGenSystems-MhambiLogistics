/*=========================================================
    MHAMBI LOGISTICS - PROCUREMENT: SUPPLIERS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("procurement");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "suppliers",
        seed: NGS.SEED_SUPPLIERS,
        tbody: "suppliersBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "supplierCount",
        statusField: "status",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.name) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.category); } },
            { render: function (r) { return NGS.escapeHtml(r.contact); } },
            { render: function (r) { return NGS.escapeHtml(r.email); } },
            { render: function (r) { return NGS.escapeHtml(r.phone); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            return '<button type="button" class="portal-icon-btn" data-action="toggle" title="Toggle status"><i class="fas fa-rotate"></i></button>' +
                '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit supplier"><i class="fas fa-pen"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove supplier"><i class="fas fa-trash"></i></button>';
        }
    });

    controller.render();

    const panel = "supplierFormPanel";
    const form = document.getElementById("supplierForm");
    const title = document.getElementById("supplierFormTitle");
    const editIdField = document.getElementById("supplierEditId");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "Add Supplier";
    }

    document.getElementById("addSupplierBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    document.getElementById("supplierCancelBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("suppliersBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "toggle") {
            controller.updateRecord(id, { status: record.status === "active" ? "inactive" : "active" });
        }

        if (action === "delete") {
            if (confirm("Remove supplier " + record.name + "?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            document.getElementById("supName").value = record.name;
            document.getElementById("supCategory").value = record.category;
            document.getElementById("supContact").value = record.contact;
            document.getElementById("supEmail").value = record.email;
            document.getElementById("supPhone").value = record.phone;
            document.getElementById("supStatus").value = record.status;
            editIdField.value = id;
            title.textContent = "Edit Supplier";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const record = {
            name: document.getElementById("supName").value.trim(),
            category: document.getElementById("supCategory").value.trim(),
            contact: document.getElementById("supContact").value.trim(),
            email: document.getElementById("supEmail").value.trim().toLowerCase(),
            phone: document.getElementById("supPhone").value.trim(),
            status: document.getElementById("supStatus").value
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({ id: NGS.uid("SUP") }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
