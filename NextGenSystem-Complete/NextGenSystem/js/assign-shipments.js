/*=========================================================
    MHAMBI LOGISTICS - DISPATCHER: ASSIGN SHIPMENTS
=========================================================*/

document.addEventListener("DOMContentLoaded", function () {
    const staff = NGS.requireStaffRole("dispatcher");
    if (!staff) return;

    function getVehicles() { return NGS.load("vehicles", []); }
    function saveVehicles(list) { NGS.save("vehicles", list); }

    const controller = NGS.createTableController({
        storageKey: "shipments",
        seed: NGS.getShipments(),
        tbody: "shipmentsBody",
        searchInput: "searchInput",
        statusFilter: "statusFilter",
        countLabel: "shipmentCount",
        statusField: "status",
        emptyColspan: 9,
        columns: [
            { render: function (r) { return '<span class="cell-strong">' + NGS.escapeHtml(r.trackingNumber) + "</span>"; } },
            { render: function (r) { return NGS.escapeHtml(r.companyName); } },
            { render: function (r) { return NGS.escapeHtml(r.origin) + " &rarr; " + NGS.escapeHtml(r.destination); } },
            { render: function (r) { return (Number(r.weightKg) || 0).toLocaleString() + " kg"; } },
            { render: function (r) { return '<span class="history-status ' + (r.priority === "urgent" || r.priority === "high" ? "overdue" : "idle") + '">' + NGS.statusLabel(r.priority || "normal") + "</span>"; } },
            { render: function (r) { return r.driver ? NGS.escapeHtml(r.driver) : '<span class="cell-muted">Unassigned</span>'; } },
            { render: function (r) { return r.vehicle ? NGS.escapeHtml(r.vehicle) : '<span class="cell-muted">\u2014</span>'; } },
            { render: function (r) { return '<span class="history-status ' + r.status + '">' + NGS.statusLabel(r.status) + "</span>"; } }
        ],
        rowActions: function (r) {
            let btns = "";
            if (r.status === "pending") {
                btns += '<button type="button" class="portal-icon-btn" data-action="assign" title="Assign driver & vehicle"><i class="fas fa-user-plus"></i></button>';
            }
            if (r.status === "assigned") {
                btns += '<button type="button" class="portal-icon-btn" data-action="transit" title="Mark in transit"><i class="fas fa-truck-fast"></i></button>';
            }
            if (r.status === "in-transit") {
                btns += '<button type="button" class="portal-icon-btn" data-action="deliver" title="Mark delivered"><i class="fas fa-circle-check"></i></button>';
            }
            btns += '<button type="button" class="portal-icon-btn danger" data-action="delete" title="Remove shipment"><i class="fas fa-trash"></i></button>';
            return btns;
        }
    });

    controller.render();

    /* ---------------- New shipment form ---------------- */

    const shipmentPanel = "shipmentFormPanel";
    document.getElementById("addShipmentBtn").addEventListener("click", function () {
        NGS.toggleFormPanel(shipmentPanel, true);
    });
    document.getElementById("shipmentCancelBtn").addEventListener("click", function () {
        NGS.toggleFormPanel(shipmentPanel, false);
    });

    document.getElementById("shipmentForm").addEventListener("submit", function (event) {
        event.preventDefault();

        const trackingNumber = "MHM-" + Math.floor(10000 + Math.random() * 89999);

        controller.addRecord({
            id: NGS.uid("SHIP"),
            trackingNumber: trackingNumber,
            companyName: document.getElementById("shCompany").value.trim(),
            companyEmail: document.getElementById("shEmail").value.trim().toLowerCase(),
            origin: document.getElementById("shOrigin").value.trim(),
            destination: document.getElementById("shDestination").value.trim(),
            vehicle: "", vehicleId: "", driver: "",
            status: "pending",
            shipmentDate: new Date().toISOString().slice(0, 10),
            eta: "TBC",
            weightKg: Number(document.getElementById("shWeight").value) || 0,
            priority: document.getElementById("shPriority").value
        });

        event.target.reset();
        NGS.toggleFormPanel(shipmentPanel, false);
    });

    /* ---------------- Assign driver / vehicle ---------------- */

    const assignPanel = "assignFormPanel";
    const driverSelect = document.getElementById("assignDriver");
    const vehicleSelect = document.getElementById("assignVehicle");

    function populateAssignOptions() {
        driverSelect.innerHTML = NGS.DRIVER_ROSTER.map(function (name) {
            return '<option value="' + NGS.escapeHtml(name) + '">' + NGS.escapeHtml(name) + "</option>";
        }).join("");

        const vehicles = getVehicles().filter(function (v) { return v.status === "available"; });

        vehicleSelect.innerHTML = vehicles.length === 0
            ? '<option value="">No vehicles currently available</option>'
            : vehicles.map(function (v) {
                return '<option value="' + v.id + '">' + NGS.escapeHtml(v.plate) + " \u2014 " + NGS.escapeHtml(v.type) + "</option>";
            }).join("");
    }

    document.getElementById("assignCancelBtn").addEventListener("click", function () {
        NGS.toggleFormPanel(assignPanel, false);
    });

    document.getElementById("shipmentsBody").addEventListener("click", function (event) {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        const tr = btn.closest("tr");
        const id = tr.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        const record = controller.findRecord(id);
        if (!record) return;

        if (action === "assign") {
            populateAssignOptions();
            document.getElementById("assignShipmentId").value = id;
            NGS.toggleFormPanel(assignPanel, true);
        }

        if (action === "transit") {
            controller.updateRecord(id, { status: "in-transit" });
        }

        if (action === "deliver") {
            controller.updateRecord(id, { status: "delivered", eta: "Completed" });
            const vehicles = getVehicles();
            const vIdx = vehicles.findIndex(function (v) { return v.id === record.vehicleId; });
            if (vIdx !== -1) {
                vehicles[vIdx].status = "available";
                vehicles[vIdx].driver = "";
                saveVehicles(vehicles);
            }
        }

        if (action === "delete") {
            if (confirm("Remove shipment " + record.trackingNumber + "?")) {
                controller.deleteRecord(id);
            }
        }
    });

    document.getElementById("assignForm").addEventListener("submit", function (event) {
        event.preventDefault();

        const id = document.getElementById("assignShipmentId").value;
        const driverName = driverSelect.value;
        const vehicleId = vehicleSelect.value;

        if (!vehicleId) {
            alert("There is no available vehicle to assign right now.");
            return;
        }

        const vehicles = getVehicles();
        const vehicle = vehicles.find(function (v) { return v.id === vehicleId; });

        controller.updateRecord(id, {
            driver: driverName,
            vehicle: vehicle ? vehicle.plate : "",
            vehicleId: vehicleId,
            status: "assigned",
            eta: "Awaiting departure"
        });

        if (vehicle) {
            vehicle.status = "on-route";
            vehicle.driver = driverName;
            saveVehicles(vehicles);
        }

        event.target.reset();
        NGS.toggleFormPanel(assignPanel, false);
    });
});
