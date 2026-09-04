/*=========================================================
    MHAMBI LOGISTICS - WAREHOUSE: RECEIVING
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("warehouse");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "purchaseOrders",
        seed: NGS.SEED_PURCHASE_ORDERS,
        tbody: "receivingBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        statusField: "status",
        baseFilter: function (r) { return r.status === "ordered" || r.status === "received"; },
        emptyColspan: 6,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.poNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.supplier); } },
            { render: function (r) { return NGS.escapeHtml(r.item); } },
            { render: function (r) { return Number(r.quantity) || 0; } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            if (r.status === "ordered") {
                return '<button type="button" class="portal-icon-btn" data-action="receive" title="Mark received"><i class="fas fa-box-open"></i></button>';
            }
            return '<span class="cell-muted">Received</span>';
        }
    });

    controller.render();

    document.getElementById("receivingBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record || action !== "receive") return;

        controller.updateRecord(id, { status: "received" });

        /* Reflect the received stock in inventory */
        const inventory = NGS.load("inventory", NGS.SEED_INVENTORY);
        const existing = inventory.find(function (i) {
            return i.name.toLowerCase() === record.item.toLowerCase();
        });

        if (existing) {
            existing.quantity = (Number(existing.quantity) || 0) + (Number(record.quantity) || 0);
            existing.status = existing.quantity <= 0 ? "out-of-stock" : (existing.quantity <= (Number(existing.reorderLevel) || 0) ? "low-stock" : "in-stock");
        } else {
            inventory.push({
                id: NGS.uid("INV"),
                sku: "SKU-" + Math.floor(2000 + Math.random() * 7999),
                name: record.item,
                category: "Received Stock",
                quantity: Number(record.quantity) || 0,
                reorderLevel: 5,
                unit: "units",
                location: "Receiving Bay",
                status: "in-stock"
            });
        }

        NGS.save("inventory", inventory);

        alert("Received " + record.quantity + " x " + record.item + ". Inventory has been updated.");
    });
});
