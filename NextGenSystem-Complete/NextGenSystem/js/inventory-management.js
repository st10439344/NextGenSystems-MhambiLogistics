/*=========================================================
    MHAMBI LOGISTICS - WAREHOUSE: INVENTORY MANAGEMENT
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("warehouse");
    if (!staff) return;

    function computeStatus(item) {
        const qty = Number(item.quantity) || 0;
        const reorder = Number(item.reorderLevel) || 0;
        if (qty <= 0) return "out-of-stock";
        if (qty <= reorder) return "low-stock";
        return "in-stock";
    }

    const controller = NGS.createTableController({
        storageKey: "inventory",
        seed: NGS.SEED_INVENTORY,
        tbody: "inventoryBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "itemCount",
        statusField: "status",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.sku) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.name); } },
            { render: function (r) { return NGS.escapeHtml(r.category); } },
            { render: function (r) { return (Number(r.quantity) || 0) + " " + NGS.escapeHtml(r.unit || ""); } },
            { render: function (r) { return NGS.escapeHtml(r.location || "\u2014"); } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            return '<button type="button" class="portal-icon-btn" data-action="increase" title="Add 1 unit"><i class="fas fa-plus"></i></button>' +
                '<button type="button" class="portal-icon-btn" data-action="decrease" title="Remove 1 unit"><i class="fas fa-minus"></i></button>' +
                '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit item"><i class="fas fa-pen"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove item"><i class="fas fa-trash"></i></button>';
        }
    });

    controller.render();

    const panel = "itemFormPanel";
    const form = document.getElementById("itemForm");
    const title = document.getElementById("itemFormTitle");
    const editIdField = document.getElementById("itemEditId");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "Add Inventory Item";
    }

    document.getElementById("addItemBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    document.getElementById("itemCancelBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("inventoryBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "increase" || action === "decrease") {
            const qty = Math.max(0, (Number(record.quantity) || 0) + (action === "increase" ? 1 : -1));
            const patch = { quantity: qty };
            patch.status = computeStatus({ quantity: qty, reorderLevel: record.reorderLevel });
            controller.updateRecord(id, patch);
        }

        if (action === "delete") {
            if (confirm("Remove " + record.name + " from inventory?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            document.getElementById("itSku").value = record.sku;
            document.getElementById("itName").value = record.name;
            document.getElementById("itCategory").value = record.category;
            document.getElementById("itQuantity").value = record.quantity;
            document.getElementById("itReorder").value = record.reorderLevel;
            document.getElementById("itUnit").value = record.unit;
            document.getElementById("itLocation").value = record.location;
            editIdField.value = id;
            title.textContent = "Edit Inventory Item";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const quantity = Number(document.getElementById("itQuantity").value) || 0;
        const reorderLevel = Number(document.getElementById("itReorder").value) || 0;

        const record = {
            sku: document.getElementById("itSku").value.trim(),
            name: document.getElementById("itName").value.trim(),
            category: document.getElementById("itCategory").value.trim(),
            quantity: quantity,
            reorderLevel: reorderLevel,
            unit: document.getElementById("itUnit").value.trim(),
            location: document.getElementById("itLocation").value.trim(),
            status: computeStatus({ quantity: quantity, reorderLevel: reorderLevel })
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({ id: NGS.uid("INV") }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
