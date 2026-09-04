/*=========================================================
    MHAMBI LOGISTICS - PROCUREMENT: PURCHASE ORDERS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("procurement");
    if (!staff) return;

    const STATUS_FLOW = ["draft", "pending", "approved", "ordered", "received"];

    const controller = NGS.createTableController({
        storageKey: "purchaseOrders",
        seed: NGS.SEED_PURCHASE_ORDERS,
        tbody: "poBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "poCount",
        statusField: "status",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.poNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.supplier); } },
            { render: function (r) { return NGS.escapeHtml(r.item); } },
            { render: function (r) { return Number(r.quantity) || 0; } },
            { render: function (r) { return NGS.formatMoney((Number(r.quantity) || 0) * (Number(r.unitCost) || 0)); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            let btns = "";
            const idx = STATUS_FLOW.indexOf(r.status);
            if (idx !== -1 && idx < STATUS_FLOW.length - 1) {
                btns += '<button type="button" class="portal-icon-btn" data-action="advance" title="Advance to ' + NGS.statusLabel(STATUS_FLOW[idx + 1]) + '"><i class="fas fa-forward"></i></button>';
            }
            btns += '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit order"><i class="fas fa-pen"></i></button>';
            btns += '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Delete order"><i class="fas fa-trash"></i></button>';
            return btns;
        }
    });

    controller.render();

    const supplierSelect = document.getElementById("poSupplier");
    function populateSuppliers() {
        const suppliers = NGS.load("suppliers", NGS.SEED_SUPPLIERS);
        supplierSelect.innerHTML = suppliers.map(function (s) {
            return '<option value="' + NGS.escapeHtml(s.name) + '">' + NGS.escapeHtml(s.name) + "</option>";
        }).join("");
    }
    populateSuppliers();

    const panel = "poFormPanel";
    const form = document.getElementById("poForm");
    const title = document.getElementById("poFormTitle");
    const editIdField = document.getElementById("poEditId");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "New Purchase Order";
        populateSuppliers();
    }

    document.getElementById("addPoBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    document.getElementById("poCancelBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("poBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "advance") {
            const idx = STATUS_FLOW.indexOf(record.status);
            if (idx !== -1 && idx < STATUS_FLOW.length - 1) {
                controller.updateRecord(id, { status: STATUS_FLOW[idx + 1] });
            }
        }

        if (action === "delete") {
            if (confirm("Delete purchase order " + record.poNumber + "?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            populateSuppliers();
            document.getElementById("poSupplier").value = record.supplier;
            document.getElementById("poItem").value = record.item;
            document.getElementById("poQuantity").value = record.quantity;
            document.getElementById("poUnitCost").value = record.unitCost;
            document.getElementById("poStatus").value = record.status;
            editIdField.value = id;
            title.textContent = "Edit Purchase Order";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const record = {
            supplier: supplierSelect.value,
            item: document.getElementById("poItem").value.trim(),
            quantity: Number(document.getElementById("poQuantity").value) || 0,
            unitCost: Number(document.getElementById("poUnitCost").value) || 0,
            status: document.getElementById("poStatus").value
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({
                id: NGS.uid("PO"),
                poNumber: "PO-" + Math.floor(1000 + Math.random() * 8999),
                requestedBy: staff.name,
                dateRequested: new Date().toISOString().slice(0, 10)
            }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
