/*=========================================================
    MHAMBI LOGISTICS
    SHARED STAFF AUTHENTICATION
    Handles demo staff accounts, login guards, logout
    and header user info for every internal portal
    (admin, dispatcher, driver, finance, fleet,
    procurement, warehouse).
=========================================================*/

window.NGS = window.NGS || {};

/*---------------------------------------------------------
    DEMO STAFF DIRECTORY
    Because this project has no backend/database, staff
    accounts are provisioned as seeded demo accounts
    instead of public self-registration (which only makes
    sense for the Client role).
---------------------------------------------------------*/

NGS.STAFF_ROLES = [
    { id: "staff-admin", role: "admin", label: "Administrator", name: "Thandiwe Nkosi", email: "admin@mhambilogistics.co.za", password: "Admin@123" },
    { id: "staff-dispatcher", role: "dispatcher", label: "Dispatcher", name: "Sipho Dlamini", email: "dispatch@mhambilogistics.co.za", password: "Dispatch@123" },
    { id: "staff-driver", role: "driver", label: "Driver", name: "Bongani Mthembu", email: "driver@mhambilogistics.co.za", password: "Driver@123" },
    { id: "staff-finance", role: "finance", label: "Finance Officer", name: "Naledi Khumalo", email: "finance@mhambilogistics.co.za", password: "Finance@123" },
    { id: "staff-fleet", role: "fleet", label: "Fleet Manager", name: "Johan van der Merwe", email: "fleet@mhambilogistics.co.za", password: "Fleet@123" },
    { id: "staff-procurement", role: "procurement", label: "Procurement Officer", name: "Zanele Ndlovu", email: "procurement@mhambilogistics.co.za", password: "Procurement@123" },
    { id: "staff-warehouse", role: "warehouse", label: "Warehouse Manager", name: "Kagiso Molefe", email: "warehouse@mhambilogistics.co.za", password: "Warehouse@123" }
];

NGS.ROLE_DASHBOARD = {
    admin: "../admin/admin-dashboard.html",
    dispatcher: "../dispatcher/dispatcher-dashboard.html",
    driver: "../driver/driver-dashboard.html",
    finance: "../finance/finance-dashboard.html",
    fleet: "../fleet/fleet-dashboard.html",
    procurement: "../procurement/procurement-dashboard.html",
    warehouse: "../warehouse/warehouse-dashboard.html"
};

NGS.seedStaffAccounts = function () {
    if (!localStorage.getItem("staffAccounts")) {
        localStorage.setItem("staffAccounts", JSON.stringify(NGS.STAFF_ROLES));
    }
};

/*---------------------------------------------------------
    OPERATIONAL SEED DATA
    Shared across every staff portal so that dispatcher,
    driver, fleet, finance, procurement, warehouse and
    admin are all working from the same underlying
    "business", the same way they would with a real
    database.
---------------------------------------------------------*/

NGS.DRIVER_ROSTER = ["Bongani Mthembu", "Peter Nkuna", "Ayanda Zulu", "Michael Botha", "Refilwe Sithole"];

NGS.SEED_VEHICLES = [
    { id: "VEH-101", plate: "NGS 101 KZN", type: "34T Interlink Truck", capacity: 34000, status: "available", driver: "", mileage: 182340, lastService: "2026-06-02", nextService: "2026-09-02" },
    { id: "VEH-102", plate: "NGS 102 KZN", type: "8T Rigid Truck", capacity: 8000, status: "on-route", driver: "Bongani Mthembu", mileage: 96410, lastService: "2026-05-14", nextService: "2026-08-14" },
    { id: "VEH-103", plate: "NGS 103 KZN", type: "12T Reefer Truck", capacity: 12000, status: "available", driver: "", mileage: 71200, lastService: "2026-06-20", nextService: "2026-09-20" },
    { id: "VEH-104", plate: "NGS 104 GP", type: "20T Tautliner Truck", capacity: 20000, status: "maintenance", driver: "", mileage: 154870, lastService: "2026-07-30", nextService: "2026-08-20" },
    { id: "VEH-105", plate: "NGS 105 GP", type: "1.5T Delivery Van", capacity: 1500, status: "available", driver: "", mileage: 43210, lastService: "2026-07-01", nextService: "2026-10-01" },
    { id: "VEH-106", plate: "NGS 106 GP", type: "15T Flatbed Truck", capacity: 15000, status: "on-route", driver: "Peter Nkuna", mileage: 112900, lastService: "2026-06-11", nextService: "2026-09-11" },
    { id: "VEH-107", plate: "NGS 107 WC", type: "18T Tanker Truck", capacity: 18000, status: "available", driver: "", mileage: 88760, lastService: "2026-05-28", nextService: "2026-08-28" },
    { id: "VEH-108", plate: "NGS 108 KZN", type: "8T Rigid Truck", capacity: 8000, status: "idle", driver: "", mileage: 60110, lastService: "2026-07-10", nextService: "2026-10-10" }
];

NGS.SEED_SHIPMENTS = [
    { id: "SHIP-1001", trackingNumber: "MHM-10021", companyName: "Thabo Freight Traders", companyEmail: "orders@thabofreight.co.za", origin: "Newcastle", destination: "Johannesburg", vehicle: "Truck 12", vehicleId: "VEH-102", driver: "Bongani Mthembu", status: "in-transit", shipmentDate: "2026-08-06", eta: "2026-08-18", weightKg: 6200, priority: "high" },
    { id: "SHIP-1002", trackingNumber: "MHM-10018", companyName: "Thabo Freight Traders", companyEmail: "orders@thabofreight.co.za", origin: "Durban", destination: "Pretoria", vehicle: "Truck 08", vehicleId: "VEH-108", driver: "", status: "delivered", shipmentDate: "2026-08-02", eta: "2026-08-04", weightKg: 4100, priority: "normal" },
    { id: "SHIP-1003", trackingNumber: "MHM-10014", companyName: "KZN Retail Group", companyEmail: "logistics@kznretail.co.za", origin: "Richards Bay", destination: "Bloemfontein", vehicle: "", vehicleId: "", driver: "", status: "pending", shipmentDate: "2026-08-05", eta: "2026-08-19", weightKg: 8900, priority: "normal" },
    { id: "SHIP-1004", trackingNumber: "MHM-10025", companyName: "KZN Retail Group", companyEmail: "logistics@kznretail.co.za", origin: "Cape Town", destination: "Gqeberha", vehicle: "Truck 06", vehicleId: "VEH-106", driver: "Peter Nkuna", status: "in-transit", shipmentDate: "2026-08-14", eta: "2026-08-19", weightKg: 11200, priority: "high" },
    { id: "SHIP-1005", trackingNumber: "MHM-10027", companyName: "Savanna Agri Exports", companyEmail: "dispatch@savannaagri.co.za", origin: "Bloemfontein", destination: "Durban", vehicle: "", vehicleId: "", driver: "", status: "pending", shipmentDate: "2026-08-16", eta: "2026-08-20", weightKg: 15400, priority: "urgent" },
    { id: "SHIP-1006", trackingNumber: "MHM-10029", companyName: "Savanna Agri Exports", companyEmail: "dispatch@savannaagri.co.za", origin: "Johannesburg", destination: "Polokwane", vehicle: "", vehicleId: "", driver: "", status: "assigned", shipmentDate: "2026-08-17", eta: "2026-08-19", weightKg: 5300, priority: "normal" },
    { id: "SHIP-1007", trackingNumber: "MHM-10012", companyName: "Zulu Manufacturing", companyEmail: "supply@zulumfg.co.za", origin: "Pretoria", destination: "Nelspruit", vehicle: "Truck 12", vehicleId: "VEH-102", driver: "Bongani Mthembu", status: "delivered", shipmentDate: "2026-07-30", eta: "2026-08-01", weightKg: 3800, priority: "normal" },
    { id: "SHIP-1008", trackingNumber: "MHM-10009", companyName: "Zulu Manufacturing", companyEmail: "supply@zulumfg.co.za", origin: "East London", destination: "Durban", vehicle: "", vehicleId: "", driver: "", status: "cancelled", shipmentDate: "2026-07-22", eta: "\u2014", weightKg: 2600, priority: "low" },
    { id: "SHIP-1009", trackingNumber: "MHM-10031", companyName: "Highveld Steel Co", companyEmail: "ops@highveldsteel.co.za", origin: "Vanderbijlpark", destination: "Richards Bay", vehicle: "", vehicleId: "", driver: "", status: "pending", shipmentDate: "2026-08-17", eta: "2026-08-21", weightKg: 22000, priority: "high" },
    { id: "SHIP-1010", trackingNumber: "MHM-10007", companyName: "Highveld Steel Co", companyEmail: "ops@highveldsteel.co.za", origin: "Durban", destination: "Newcastle", vehicle: "Truck 08", vehicleId: "VEH-108", driver: "", status: "delivered", shipmentDate: "2026-07-18", eta: "2026-07-20", weightKg: 9700, priority: "normal" }
];

NGS.SEED_SUPPLIERS = [
    { id: "SUP-01", name: "Vaal Tyre & Parts", category: "Vehicle Parts", contact: "Reana Fourie", email: "sales@vaaltyres.co.za", phone: "016 455 2210", status: "active" },
    { id: "SUP-02", name: "Durban Fuel Distributors", category: "Fuel", contact: "Sibusiso Cele", email: "accounts@durbanfuel.co.za", phone: "031 555 8890", status: "active" },
    { id: "SUP-03", name: "SafetyFirst PPE Suppliers", category: "Safety Equipment", contact: "Amanda Pretorius", email: "orders@safetyfirst.co.za", phone: "011 622 4471", status: "active" },
    { id: "SUP-04", name: "Highway Truck Repairs", category: "Maintenance & Repairs", contact: "Jaco Botes", email: "workshop@highwayrepairs.co.za", phone: "013 752 3390", status: "active" },
    { id: "SUP-05", name: "PackRight Packaging", category: "Packaging Materials", contact: "Nomvula Radebe", email: "info@packright.co.za", phone: "012 345 6612", status: "inactive" },
    { id: "SUP-06", name: "Gauteng Office Supplies", category: "Office & Admin", contact: "Werner Els", email: "sales@gpoffice.co.za", phone: "010 220 7754", status: "active" }
];

NGS.SEED_PURCHASE_ORDERS = [
    { id: "PO-01", poNumber: "PO-1001", supplier: "Vaal Tyre & Parts", item: "Truck Tyres (315/80 R22.5)", quantity: 12, unitCost: 3450, status: "received", requestedBy: "Zanele Ndlovu", dateRequested: "2026-07-20" },
    { id: "PO-02", poNumber: "PO-1002", supplier: "Durban Fuel Distributors", item: "Diesel Bulk Order (5000L)", quantity: 5000, unitCost: 22.4, status: "ordered", requestedBy: "Zanele Ndlovu", dateRequested: "2026-08-10" },
    { id: "PO-03", poNumber: "PO-1003", supplier: "Highway Truck Repairs", item: "Brake Pad Sets", quantity: 8, unitCost: 890, status: "approved", requestedBy: "Zanele Ndlovu", dateRequested: "2026-08-12" },
    { id: "PO-04", poNumber: "PO-1004", supplier: "SafetyFirst PPE Suppliers", item: "Hi-Vis Safety Vests", quantity: 40, unitCost: 145, status: "pending", requestedBy: "Zanele Ndlovu", dateRequested: "2026-08-15" },
    { id: "PO-05", poNumber: "PO-1005", supplier: "PackRight Packaging", item: "Pallet Wrap Rolls", quantity: 60, unitCost: 210, status: "draft", requestedBy: "Zanele Ndlovu", dateRequested: "2026-08-16" },
    { id: "PO-06", poNumber: "PO-1006", supplier: "Gauteng Office Supplies", item: "Warehouse Barcode Scanners", quantity: 6, unitCost: 1250, status: "ordered", requestedBy: "Zanele Ndlovu", dateRequested: "2026-08-13" },
    { id: "PO-07", poNumber: "PO-1007", supplier: "Vaal Tyre & Parts", item: "Engine Oil (20L drums)", quantity: 10, unitCost: 980, status: "received", requestedBy: "Zanele Ndlovu", dateRequested: "2026-07-28" },
    { id: "PO-08", poNumber: "PO-1008", supplier: "Highway Truck Repairs", item: "Trailer Suspension Kit", quantity: 2, unitCost: 6400, status: "cancelled", requestedBy: "Zanele Ndlovu", dateRequested: "2026-07-15" }
];

NGS.SEED_INVENTORY = [
    { id: "INV-01", sku: "SKU-1001", name: "Truck Tyres 315/80 R22.5", category: "Vehicle Parts", quantity: 18, reorderLevel: 10, unit: "units", location: "Aisle A1", status: "in-stock" },
    { id: "INV-02", sku: "SKU-1002", name: "Brake Pad Sets", category: "Vehicle Parts", quantity: 6, reorderLevel: 8, unit: "sets", location: "Aisle A2", status: "low-stock" },
    { id: "INV-03", sku: "SKU-1003", name: "Hi-Vis Safety Vests", category: "Safety Equipment", quantity: 52, reorderLevel: 20, unit: "units", location: "Aisle B1", status: "in-stock" },
    { id: "INV-04", sku: "SKU-1004", name: "Pallet Wrap Rolls", category: "Packaging Materials", quantity: 4, reorderLevel: 15, unit: "rolls", location: "Aisle C3", status: "low-stock" },
    { id: "INV-05", sku: "SKU-1005", name: "Diesel Engine Oil 20L", category: "Vehicle Parts", quantity: 0, reorderLevel: 5, unit: "drums", location: "Aisle A3", status: "out-of-stock" },
    { id: "INV-06", sku: "SKU-1006", name: "Cardboard Shipping Boxes (L)", category: "Packaging Materials", quantity: 340, reorderLevel: 100, unit: "units", location: "Aisle C1", status: "in-stock" },
    { id: "INV-07", sku: "SKU-1007", name: "Barcode Scanners", category: "Warehouse Equipment", quantity: 9, reorderLevel: 4, unit: "units", location: "Aisle D1", status: "in-stock" },
    { id: "INV-08", sku: "SKU-1008", name: "Pallet Jacks", category: "Warehouse Equipment", quantity: 3, reorderLevel: 3, unit: "units", location: "Aisle D2", status: "in-stock" },
    { id: "INV-09", sku: "SKU-1009", name: "Fire Extinguishers", category: "Safety Equipment", quantity: 2, reorderLevel: 6, unit: "units", location: "Aisle B2", status: "low-stock" },
    { id: "INV-10", sku: "SKU-1010", name: "Strapping Belts (Heavy Duty)", category: "Packaging Materials", quantity: 76, reorderLevel: 25, unit: "rolls", location: "Aisle C2", status: "in-stock" }
];

NGS.SEED_INVOICES = [
    { id: "INVC-01", invoiceNumber: "INV-2001", companyName: "Thabo Freight Traders", companyEmail: "orders@thabofreight.co.za", shipmentRef: "MHM-10018", amount: 18400, status: "paid", issueDate: "2026-08-02", dueDate: "2026-08-16" },
    { id: "INVC-02", invoiceNumber: "INV-2002", companyName: "KZN Retail Group", companyEmail: "logistics@kznretail.co.za", shipmentRef: "MHM-10014", amount: 24650, status: "unpaid", issueDate: "2026-08-05", dueDate: "2026-08-19" },
    { id: "INVC-03", invoiceNumber: "INV-2003", companyName: "Zulu Manufacturing", companyEmail: "supply@zulumfg.co.za", shipmentRef: "MHM-10012", amount: 11200, status: "paid", issueDate: "2026-07-30", dueDate: "2026-08-13" },
    { id: "INVC-04", invoiceNumber: "INV-2004", companyName: "Highveld Steel Co", companyEmail: "ops@highveldsteel.co.za", shipmentRef: "MHM-10007", amount: 32900, status: "overdue", issueDate: "2026-07-18", dueDate: "2026-08-01" },
    { id: "INVC-05", invoiceNumber: "INV-2005", companyName: "Thabo Freight Traders", companyEmail: "orders@thabofreight.co.za", shipmentRef: "MHM-10021", amount: 21750, status: "unpaid", issueDate: "2026-08-06", dueDate: "2026-08-20" },
    { id: "INVC-06", invoiceNumber: "INV-2006", companyName: "Savanna Agri Exports", companyEmail: "dispatch@savannaagri.co.za", shipmentRef: "MHM-10029", amount: 15600, status: "unpaid", issueDate: "2026-08-17", dueDate: "2026-08-31" },
    { id: "INVC-07", invoiceNumber: "INV-2007", companyName: "Zulu Manufacturing", companyEmail: "supply@zulumfg.co.za", shipmentRef: "MHM-10009", amount: 9800, status: "overdue", issueDate: "2026-07-22", dueDate: "2026-08-05" },
    { id: "INVC-08", invoiceNumber: "INV-2008", companyName: "KZN Retail Group", companyEmail: "logistics@kznretail.co.za", shipmentRef: "MHM-10025", amount: 28300, status: "paid", issueDate: "2026-08-14", dueDate: "2026-08-28" }
];

NGS.seedOperationalData = function () {
    NGS.seedIfEmpty("shipments", NGS.SEED_SHIPMENTS);
    NGS.seedIfEmpty("vehicles", NGS.SEED_VEHICLES);
    NGS.seedIfEmpty("suppliers", NGS.SEED_SUPPLIERS);
    NGS.seedIfEmpty("purchaseOrders", NGS.SEED_PURCHASE_ORDERS);
    NGS.seedIfEmpty("inventory", NGS.SEED_INVENTORY);
    NGS.seedIfEmpty("invoices", NGS.SEED_INVOICES);
};

/* Shipments predate this engine and may be missing an
   "id" (e.g. records created by the client quote/shipment
   flow). This backfills one so every shipment can safely
   be used with NGS.createTableController. */
NGS.getShipments = function () {
    NGS.seedOperationalData();
    const list = NGS.load("shipments", []);
    let changed = false;

    list.forEach(function (row) {
        if (!row.id) {
            row.id = NGS.uid("SHIP");
            changed = true;
        }
    });

    if (changed) NGS.save("shipments", list);

    return list;
};

NGS.getCompanies = function () {
    const list = NGS.load("registeredCompanies", []);
    let changed = false;

    list.forEach(function (row) {
        if (!row.id) {
            row.id = row.clientID || NGS.uid("CO");
            changed = true;
        }
        if (!row.accountStatus) {
            row.accountStatus = "Active";
            changed = true;
        }
    });

    if (changed) NGS.save("registeredCompanies", list);

    return list;
};

/*---------------------------------------------------------
    GENERIC HELPERS
---------------------------------------------------------*/

NGS.uid = function (prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
};

NGS.load = function (key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.error("NGS.load error for " + key, err);
        return fallback;
    }
};

NGS.save = function (key, value) {
    localStorage.setItem(key, JSON.stringify(value));
};

NGS.seedIfEmpty = function (key, seedData) {
    if (!localStorage.getItem(key)) {
        NGS.save(key, seedData);
    }
    return NGS.load(key, []);
};

NGS.escapeHtml = function (value) {
    const div = document.createElement("div");
    div.textContent = value === undefined || value === null ? "" : String(value);
    return div.innerHTML;
};

NGS.formatMoney = function (value) {
    const num = Number(value) || 0;
    return "R " + num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

NGS.formatDate = function (value) {
    if (!value) return "\u2014";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

NGS.statusLabel = function (value) {
    if (!value) return "";
    return value.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
};

/*---------------------------------------------------------
    ROUTE GUARD
    Call on every staff dashboard / sub-page. Redirects to
    the login page if nobody is logged in, or if the
    logged-in staff member's role does not match the page
    they are trying to view.
---------------------------------------------------------*/

NGS.requireStaffRole = function (roleKey) {
    NGS.seedStaffAccounts();
    NGS.seedOperationalData();

    const raw = localStorage.getItem("loggedInStaff");

    if (!raw) {
        window.location.href = "../public/login.html";
        return null;
    }

    let staff;

    try {
        staff = JSON.parse(raw);
    } catch (err) {
        localStorage.removeItem("loggedInStaff");
        window.location.href = "../public/login.html";
        return null;
    }

    if (staff.role !== roleKey) {
        const redirectTo = NGS.ROLE_DASHBOARD[staff.role] || "../public/login.html";
        window.location.href = redirectTo;
        return null;
    }

    NGS.paintStaffHeader(staff);

    return staff;
};

NGS.paintStaffHeader = function (staff) {
    document.querySelectorAll("[data-staff-name]").forEach(function (el) {
        el.textContent = staff.name || "Staff Member";
    });

    document.querySelectorAll("[data-staff-role]").forEach(function (el) {
        el.textContent = staff.label || NGS.statusLabel(staff.role);
    });

    document.querySelectorAll("[data-staff-first-name]").forEach(function (el) {
        el.textContent = (staff.name || "there").split(" ")[0];
    });

    const logoutBtn = document.getElementById("logoutButton");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", function (event) {
            event.preventDefault();
            NGS.logoutStaff();
        });
    }
};

NGS.logoutStaff = function () {
    localStorage.removeItem("loggedInStaff");
    localStorage.removeItem("isStaffLoggedIn");
    window.location.href = "../public/login.html";
};
