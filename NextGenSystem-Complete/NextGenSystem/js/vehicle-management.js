/*=========================================================
    MHAMBI LOGISTICS - FLEET: VEHICLE MANAGEMENT
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("fleet");
    if (!staff) return;

    const controller = NGS.createTableController({
        storageKey: "vehicles",
        seed: NGS.SEED_VEHICLES,
        tbody: "vehiclesBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "vehicleCount",
        statusField: "status",
        emptyColspan: 7,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.plate) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.type); } },
            { render: function (r) { return (Number(r.capacity) || 0).toLocaleString() + " kg"; } },
            { render: function (r) { return r.driver ? NGS.escapeHtml(r.driver) : '<span class="cell-muted">Unassigned</span>'; } },
            { render: function (r) { return (Number(r.mileage) || 0).toLocaleString() + " km"; } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            return '<button type="button" class="portal-icon-btn" data-action="edit" title="Edit vehicle"><i class="fas fa-pen"></i></button>' +
                '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove vehicle"><i class="fas fa-trash"></i></button>';
        }
    });

    controller.render();

    const panel = "vehicleFormPanel";
    const form = document.getElementById("vehicleForm");
    const title = document.getElementById("vehicleFormTitle");
    const editIdField = document.getElementById("vehicleEditId");

    function resetForm() {
        form.reset();
        editIdField.value = "";
        title.textContent = "Add Vehicle";
    }

    document.getElementById("addVehicleBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, true);
    });

    document.getElementById("vehicleCancelBtn").addEventListener("click", function () {
        resetForm();
        NGS.toggleFormPanel(panel, false);
    });

    document.getElementById("vehiclesBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "delete") {
            if (confirm("Remove vehicle " + record.plate + " from the fleet?")) {
                controller.deleteRecord(id);
            }
        }

        if (action === "edit") {
            document.getElementById("vPlate").value = record.plate;
            document.getElementById("vType").value = record.type;
            document.getElementById("vCapacity").value = record.capacity;
            document.getElementById("vStatus").value = record.status;
            document.getElementById("vDriver").value = record.driver || "";
            document.getElementById("vMileage").value = record.mileage;
            editIdField.value = id;
            title.textContent = "Edit Vehicle";
            NGS.toggleFormPanel(panel, true);
        }
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const record = {
            plate: document.getElementById("vPlate").value.trim(),
            type: document.getElementById("vType").value.trim(),
            capacity: Number(document.getElementById("vCapacity").value) || 0,
            status: document.getElementById("vStatus").value,
            driver: document.getElementById("vDriver").value.trim(),
            mileage: Number(document.getElementById("vMileage").value) || 0
        };

        const editId = editIdField.value;

        if (editId) {
            controller.updateRecord(editId, record);
        } else {
            controller.addRecord(Object.assign({
                id: NGS.uid("VEH"),
                lastService: new Date().toISOString().slice(0, 10),
                nextService: ""
            }, record));
        }

        resetForm();
        NGS.toggleFormPanel(panel, false);
    });
});
