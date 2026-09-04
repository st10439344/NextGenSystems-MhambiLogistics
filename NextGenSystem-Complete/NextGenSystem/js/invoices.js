/*=========================================================
    MHAMBI LOGISTICS - FINANCE: INVOICES
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("finance");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "invoices",
        seed: NGS.SEED_INVOICES,
        tbody: "invoicesBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "invoiceCount",
        statusField: "status",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.invoiceNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml(r.shipmentRef || "\u2014"); } },
            { render: function (r) { return NGS.formatMoney(r.amount); } },
            { render: function (r) { return NGS.formatDate(r.dueDate); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            let btns = "";
            if (r.status !== "paid") {
                btns += '<button type="button" class="portal-icon-btn" data-action="paid" title="Mark as paid"><i class="fas fa-circle-check"></i></button>';
            }
            btns += '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit invoice"><i class="fas fa-pen"></i></button>';
            btns += '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Delete invoice"><i class="fas fa-trash"></i></button>';
            return btns;
        }
    });

    controller.render();

    const panel = "invoiceFormPanel";
    const form = document.getElementById("invoiceForm");
    const title = document.getElementById("invoiceFormTitle");
    const editIdField = document.getElementById("invoiceEditId");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "New Invoice";
    }

    document.getElementById("addInvoiceBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    document.getElementById("invoiceCancelBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("invoicesBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "paid") {
            controller.updateRecord(id, { status: "paid" });
        }

        if (action === "delete") {
            if (confirm("Delete invoice " + record.invoiceNumber + "?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            document.getElementById("invCompany").value = record.companyName;
            document.getElementById("invEmail").value = record.companyEmail;
            document.getElementById("invShipmentRef").value = record.shipmentRef || "";
            document.getElementById("invAmount").value = record.amount;
            document.getElementById("invIssueDate").value = record.issueDate;
            document.getElementById("invDueDate").value = record.dueDate;
            document.getElementById("invStatus").value = record.status;
            editIdField.value = id;
            title.textContent = "Edit Invoice";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const record = {
            companyName: document.getElementById("invCompany").value.trim(),
            companyEmail: document.getElementById("invEmail").value.trim().toLowerCase(),
            shipmentRef: document.getElementById("invShipmentRef").value.trim(),
            amount: Number(document.getElementById("invAmount").value) || 0,
            issueDate: document.getElementById("invIssueDate").value,
            dueDate: document.getElementById("invDueDate").value,
            status: document.getElementById("invStatus").value
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({
                id: NGS.uid("INVC"),
                invoiceNumber: "INV-" + Math.floor(2000 + Math.random() * 7999)
            }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
