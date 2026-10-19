'use strict';
/**
 * Deterministic FICTIONAL demonstration data. Fixed ids + ON CONFLICT DO NOTHING make the seed repeatable.
 * All e-mail addresses use reserved .test domains; no real personal information is used.
 */
const docs = require('../src/services/documents');

const BASE = Date.UTC(2026, 7, 3); // 3 Aug 2026
const T = (day, hour = 9) => new Date(BASE + day * 86400000 + hour * 3600000).toISOString();
const D = (day) => new Date(BASE + day * 86400000).toISOString().slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;

function build(passwordHash) {
  const out = [];
  const add = (table, rows) => out.push([table, rows]);

  /* ---------- permissions ---------- */
  const permCodes = [
    ['users.manage', 'Create, edit and deactivate user accounts'], ['roles.assign', 'Assign roles to staff'],
    ['companies.manage', 'Manage registered companies'], ['settings.system', 'Change system settings'],
    ['audit.view', 'View audit logs'], ['data.export', 'Export data tables'],
    ['quotations.process', 'Review and price client quotations'], ['quotations.request', 'Request quotations'],
    ['shipments.create', 'Create shipments'], ['shipments.assign', 'Assign drivers and vehicles'],
    ['shipments.view_all', 'View all shipments'], ['shipments.view_own', 'View own shipments'],
    ['deliveries.update', 'Update delivery status and proof of delivery'], ['incidents.report', 'Report incidents'],
    ['inventory.manage', 'Manage stock records and movements'], ['inventory.view', 'View inventory'],
    ['vehicles.manage', 'Manage vehicles, maintenance and fuel'], ['vehicles.view', 'View vehicles'],
    ['suppliers.manage', 'Manage suppliers'], ['purchasing.manage', 'Manage purchase requests and orders'],
    ['invoices.manage', 'Create and edit invoices'], ['invoices.view_own', 'View own company invoices'],
    ['payments.record', 'Record payments and issue receipts'], ['expenses.manage', 'Manage expenses and budgets'],
    ['reports.view', 'View operational reports'], ['support.manage', 'Respond to support requests'],
    ['support.create', 'Create support requests'], ['documents.view_own', 'View own company documents'],
    ['documents.manage', 'Manage all documents'], ['notifications.broadcast', 'Send notifications to users'],
  ].map(([code, description], i) => ({ id: i + 1, code, description }));
  add('permissions', permCodes);
  const pid = Object.fromEntries(permCodes.map((p) => [p.code, p.id]));
  const grants = {
    1: Object.keys(pid),
    2: ['quotations.process', 'shipments.create', 'shipments.assign', 'shipments.view_all', 'vehicles.view', 'inventory.view', 'reports.view', 'documents.manage', 'incidents.report'],
    3: ['inventory.manage', 'inventory.view', 'shipments.view_all', 'reports.view'],
    4: ['vehicles.manage', 'vehicles.view', 'shipments.view_all', 'reports.view', 'incidents.report'],
    5: ['suppliers.manage', 'purchasing.manage', 'quotations.process', 'inventory.view', 'reports.view', 'shipments.view_all'],
    6: ['invoices.manage', 'payments.record', 'expenses.manage', 'reports.view', 'shipments.view_all', 'documents.manage'],
    7: ['shipments.view_own', 'deliveries.update', 'incidents.report'],
    8: ['quotations.request', 'shipments.view_own', 'invoices.view_own', 'support.create', 'documents.view_own'],
  };
  const rp = [];
  Object.entries(grants).forEach(([role, codes]) => codes.forEach((c) => rp.push({ role_id: Number(role), permission_id: pid[c] })));
  add('role_permissions', rp);

  /* ---------- companies ---------- */
  const companyDefs = [
    ['Bluegum Steel Works', 'Manufacturing', 'Johannesburg', 'Gauteng'], ['Karoo Fresh Produce', 'Agriculture', 'Bloemfontein', 'Free State'],
    ['Drakensberg Beverages', 'Food & Beverage', 'Pietermaritzburg', 'KwaZulu-Natal'], ['Winelands Trading Co', 'Retail', 'Cape Town', 'Western Cape'],
    ['Limpopo Agri Supplies', 'Agriculture', 'Polokwane', 'Limpopo'], ['Kasi Hardware Wholesalers', 'Wholesale', 'Pretoria', 'Gauteng'],
    ['Highveld Mining Equipment', 'Mining', 'Mbombela', 'Mpumalanga'], ['Garden Route Furniture', 'Retail', 'Gqeberha', 'Eastern Cape'],
    ['Coastline Motor Spares', 'Automotive', 'Durban', 'KwaZulu-Natal'], ['Protea Building Supplies', 'Construction', 'Kimberley', 'Northern Cape'],
  ];
  const slug = ['bluegumsteel', 'karoofresh', 'drakensbergbev', 'winelandstrading', 'limpopoagri', 'kasihardware', 'highveldmining', 'gardenroutefurn', 'coastlinespares', 'proteabuilding'];
  const companies = companyDefs.map(([name, industry, city, province], i) => ({
    id: i + 1, client_code: `CL-${String(i + 1).padStart(4, '0')}`, name: `${name} (Pty) Ltd`, registration_number: `2019/${100200 + i}/07`,
    vat_number: `41${String(10000000 + i * 1371).slice(0, 8)}`, industry, address: `${10 + i * 3} Commerce Street`, city, province,
    postal_code: String(1000 + i * 137).padStart(4, '0'), phone: `+27 11 555 01${String(i).padStart(2, '0')}`, email: `accounts@${slug[i]}.test`, status: 'active',
  }));
  add('companies', companies);

  /* ---------- users ---------- */
  const staff = [
    [1, 'nomsa.dlamini', 'Nomsa Dlamini', 'admin'], [2, 'pieter.vanwyk', 'Pieter van Wyk', 'admin'],
    [3, 'sipho.nkosi', 'Sipho Nkosi', 'dispatcher'], [4, 'amina.patel', 'Amina Patel', 'dispatcher'],
    [5, 'thandi.mokoena', 'Thandi Mokoena', 'warehouse'], [6, 'johan.botha', 'Johan Botha', 'warehouse'],
    [7, 'lerato.khumalo', 'Lerato Khumalo', 'fleet'], [8, 'kabelo.sithole', 'Kabelo Sithole', 'fleet'],
    [9, 'zanele.mthembu', 'Zanele Mthembu', 'procurement'], [10, 'ruan.pretorius', 'Ruan Pretorius', 'procurement'],
    [11, 'naledi.pillay', 'Naledi Pillay', 'finance'], [12, 'mark.jacobs', 'Mark Jacobs', 'finance'],
  ];
  const driverNames = ['Dumisani Mokoena', 'Themba Zulu', 'Pule Mahlangu', 'Andile Cele', 'Francois Naidoo', 'Bongani Radebe', 'Craig Adams', 'Mpho Sekgoma', 'Lwazi Ndlovu', 'Karel Smit'];
  const clientNames = ['Anele Gumede', 'Retha Louw', 'Vusi Maseko', 'Chantel Fourie', 'Tshepo Mabaso', 'Imran Khan', 'Busisiwe Ngcobo', 'Elmarie Venter', 'Sibusiso Dube', 'Hennie Swart'];
  const users = [];
  const userRoles = [];
  const roleId = { admin: 1, dispatcher: 2, warehouse: 3, fleet: 4, procurement: 5, finance: 6, driver: 7, client: 8 };
  staff.forEach(([id, local, name, role]) => {
    users.push({ id, email: `${local}@mhambi-demo.test`, password_hash: passwordHash, full_name: name, phone: `+27 82 555 ${String(1000 + id)}`, company_id: null, status: 'active' });
    userRoles.push({ user_id: id, role_id: roleId[role], assigned_by: id === 1 ? null : 1 });
  });
  driverNames.forEach((name, i) => {
    const id = 13 + i;
    users.push({ id, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@mhambi-demo.test`, password_hash: passwordHash, full_name: name, phone: `+27 83 555 ${String(2000 + i)}`, company_id: null, status: 'active' });
    userRoles.push({ user_id: id, role_id: 7, assigned_by: 1 });
  });
  clientNames.forEach((name, i) => {
    const id = 23 + i;
    users.push({ id, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${slug[i]}.test`, password_hash: passwordHash, full_name: name, phone: `+27 84 555 ${String(3000 + i)}`, company_id: i + 1, status: 'active' });
    userRoles.push({ user_id: id, role_id: 8, assigned_by: null });
  });
  add('users', users);
  add('user_roles', userRoles);

  /* ---------- warehouses, drivers, vehicles, suppliers ---------- */
  const whDefs = [['JHB1', 'Johannesburg Main Warehouse', 'Johannesburg'], ['DBN1', 'Durban Port Warehouse', 'Durban'], ['CPT1', 'Cape Town Docks Warehouse', 'Cape Town'],
    ['PTA1', 'Pretoria East Warehouse', 'Pretoria'], ['GQE1', 'Gqeberha Hub', 'Gqeberha'], ['BFN1', 'Bloemfontein Central Depot', 'Bloemfontein'],
    ['PLK1', 'Polokwane Depot', 'Polokwane'], ['MBB1', 'Mbombela Depot', 'Mbombela'], ['ELN1', 'East London Depot', 'East London'], ['KIM1', 'Kimberley Depot', 'Kimberley']];
  add('warehouses', whDefs.map(([code, name, city], i) => ({ id: i + 1, code, name, city, address: `${i + 1} Logistics Park Road, ${city}`, status: 'active' })));

  const drivers = driverNames.map((name, i) => ({ id: i + 1, user_id: 13 + i, licence_number: `DL-${700100 + i * 17}`, licence_code: i % 3 === 0 ? 'C1' : 'EC', phone: `+27 83 555 ${String(2000 + i)}`, status: i === 9 ? 'off_duty' : 'available' }));
  add('drivers', drivers);

  const vDefs = [['MHL 101 GP', 'Isuzu FTR 850', '8-ton rigid truck', 8000, 'on_route'], ['MHL 102 GP', 'Hino 500', '8-ton rigid truck', 8000, 'on_route'], ['MHL 103 KZN', 'UD Quester', 'Superlink tractor', 28000, 'on_route'],
    ['MHL 104 WC', 'Mercedes Sprinter', 'Panel van', 1800, 'assigned'], ['MHL 105 GP', 'Toyota Hilux', 'Bakkie', 1200, 'assigned'], ['MHL 106 KZN', 'Isuzu NPR 400', 'Tipper truck', 4500, 'maintenance'],
    ['MHL 107 EC', 'Fuso Canter', 'Refrigerated truck', 3500, 'maintenance'], ['MHL 108 GP', 'Hino 300', 'Flatbed', 3000, 'idle'], ['MHL 109 GP', 'Isuzu FTR 850', '8-ton rigid truck', 8000, 'available'],
    ['MHL 110 KZN', 'UD Croner', 'Rigid truck', 9000, 'available'], ['MHL 111 WC', 'Mercedes Actros', 'Superlink tractor', 30000, 'available'], ['MHL 112 GP', 'Toyota Quantum', 'Panel van', 1500, 'available']];
  add('vehicles', vDefs.map(([registration, make_model, type, capacity_kg, status], i) => ({
    id: i + 1, registration, make_model, type, capacity_kg, status, mileage_km: 42000 + i * 9137, last_service_date: D(-40 + i * 3), next_service_date: D(40 + i * 11) })));

  const supDefs = [['Engen Fuel Distributors', 'Fuel'], ['Bridgestone Tyre Centre Demo', 'Tyres'], ['PackRight Packaging', 'Packaging'], ['SafeGuard Workwear', 'Safety equipment'], ['TruckParts Direct', 'Spare parts'],
    ['PalletPro Supplies', 'Pallets'], ['LubeMaster Oils', 'Lubricants'], ['RoadSafe Equipment', 'Load restraints'], ['LabelWorks Printing', 'Labels'], ['CoolChain Services', 'Refrigeration']];
  add('suppliers', supDefs.map(([name, category], i) => ({ id: i + 1, code: `SUP-${String(i + 1).padStart(3, '0')}`, name, category,
    contact_name: `Contact Person ${i + 1}`, email: `sales${i + 1}@supplier-demo.test`, phone: `+27 31 555 0${100 + i}`, status: 'active' })));

  /* ---------- quotations & shipments ---------- */
  const routes = [['Johannesburg', 'Durban'], ['Cape Town', 'Johannesburg'], ['Durban', 'Pretoria'], ['Pretoria', 'Gqeberha'], ['Bloemfontein', 'Cape Town'], ['Polokwane', 'Johannesburg'],
    ['Mbombela', 'Durban'], ['East London', 'Bloemfontein'], ['Johannesburg', 'Polokwane'], ['Durban', 'Cape Town'], ['Johannesburg', 'Mbombela'], ['Pretoria', 'Durban'],
    ['Cape Town', 'Gqeberha'], ['Johannesburg', 'Kimberley'], ['Durban', 'Pietermaritzburg'], ['Pretoria', 'Bloemfontein'], ['Johannesburg', 'East London'], ['Cape Town', 'Durban']];
  const cargo = ['Structural steel beams', 'Fresh vegetables (cold chain)', 'Bottled beverages, 24 pallets', 'Retail clothing stock', 'Fertiliser bags', 'Hardware and tools',
    'Mining drill components', 'Flat-pack furniture', 'Automotive spare parts', 'Cement bags', 'Packaged groceries', 'Electrical cabling', 'Wine cases', 'Building timber', 'Paint and coatings',
    'Office furniture', 'Agricultural implements', 'Retail electronics'];
  const weights = [6200, 5400, 7600, 1500, 7200, 3000, 4200, 2800, 1100, 7900, 6800, 3400, 1400, 3900, 1700, 2100, 4500, 900];
  const qStatus = (i) => (i <= 12 ? 'converted' : ['submitted', 'in_review', 'quoted', 'rejected', 'accepted'][i - 13]);
  const quoted = (i) => money(8500 + i * 1350);
  const quotations = [];
  for (let i = 1; i <= 17; i += 1) {
    const r = routes[(i - 1) % 18];
    const st = qStatus(i);
    quotations.push({
      id: i, reference: `QT-${String(i).padStart(4, '0')}`, company_id: ((i - 1) % 10) + 1, requested_by: 23 + ((i - 1) % 10),
      origin: r[0], destination: r[1], cargo_description: cargo[(i - 1) % 18], weight_kg: weights[(i - 1) % 18],
      service_type: ['standard', 'express', 'refrigerated', 'bulk'][i % 4], preferred_date: D((i - 1) * 3 + 2), status: st,
      quoted_amount: ['submitted', 'in_review'].includes(st) ? null : quoted(i),
      staff_notes: ['submitted', 'in_review'].includes(st) ? null : (st === 'rejected' ? 'Route not serviceable in requested window.' : 'Priced per route tariff.'),
      processed_by: ['submitted'].includes(st) ? null : (i % 2 ? 9 : 10), processed_at: st === 'submitted' ? null : T((i - 1) * 3 + 1), created_at: T((i - 1) * 3, 8), updated_at: T((i - 1) * 3 + 1),
    });
  }
  add('quotations', quotations);

  const shipStatus = (i) => (i <= 10 ? 'delivered' : i <= 12 ? 'in_transit' : i === 13 ? 'collected' : i <= 15 ? 'assigned' : i <= 17 ? 'pending' : 'cancelled');
  const startDay = (i) => (i <= 10 ? (i - 1) * 3 : i <= 13 ? 55 + (i - 11) : i <= 15 ? 60 : i <= 17 ? 62 : 50);
  const shipments = [];
  for (let i = 1; i <= 18; i += 1) {
    const r = routes[i - 1];
    const st = shipStatus(i);
    shipments.push({
      id: i, tracking_ref: `MHM-${String(i).padStart(6, '0')}`, quotation_id: i <= 12 ? i : null, company_id: i <= 12 ? quotations[i - 1].company_id : ((i - 1) % 10) + 1,
      warehouse_id: (i % 4) + 1, origin: r[0], destination: r[1], cargo_description: cargo[i - 1], weight_kg: weights[i - 1],
      priority: ['normal', 'high', 'normal', 'urgent', 'low'][i % 5], status: st, scheduled_date: D(startDay(i) + 1), eta: D(startDay(i) + 4),
      created_by: i % 2 ? 3 : 4, created_at: T(startDay(i), 9), updated_at: T(startDay(i) + 3, 12), delivered_at: st === 'delivered' ? T(startDay(i) + 3, 14) : null,
    });
  }
  add('shipments', shipments);

  const hist = [];
  const push = (shipment_id, status, note, day, hour, by, location) => hist.push({ id: hist.length + 1, shipment_id, status, note, location: location || null, changed_by: by, created_at: T(day, hour) });
  shipments.forEach((s) => {
    const i = s.id; const d0 = startDay(i); const st = s.status;
    push(i, 'pending', 'Shipment created', d0, 9, s.created_by, s.origin);
    if (['assigned', 'collected', 'in_transit', 'delivered'].includes(st)) push(i, 'assigned', 'Driver and vehicle assigned', d0, 11, s.created_by, s.origin);
    if (['collected', 'in_transit', 'delivered'].includes(st)) push(i, 'collected', 'Cargo collected', d0 + 1, 8, 13 + ((i - 1) % 5), s.origin);
    if (['in_transit', 'delivered'].includes(st)) push(i, 'in_transit', 'Departed for destination', d0 + 1, 10, 13 + ((i - 1) % 5), s.origin);
    if (st === 'delivered') push(i, 'delivered', 'Delivered and signed for', d0 + 3, 14, 13 + ((i - 1) % 5), s.destination);
    if (st === 'cancelled') push(i, 'cancelled', 'Cancelled at client request', d0 + 1, 10, 3, null);
  });
  add('shipment_status_history', hist);

  const assignments = [];
  for (let i = 1; i <= 18; i += 1) {
    const st = shipStatus(i); const d0 = startDay(i);
    let driver; let vehicle; let status;
    if (i <= 10) { driver = ((i - 1) % 5) + 1; vehicle = 9 + ((i - 1) % 4); status = 'completed'; }
    else if (i <= 13) { driver = i - 10; vehicle = i - 10; status = 'active'; }
    else if (i <= 15) { driver = i - 10; vehicle = i - 10; status = 'assigned'; }
    else if (i === 18) { driver = 6; vehicle = 6; status = 'cancelled'; }
    else continue;
    assignments.push({ id: assignments.length + 1, shipment_id: i, driver_id: driver, vehicle_id: vehicle, assigned_by: i % 2 ? 3 : 4,
      scheduled_pickup: T(d0 + 1, 8), scheduled_delivery: T(d0 + 3, 16), status, created_at: T(d0, 11) });
    void st;
  }
  add('delivery_assignments', assignments);

  const recipients = ['G. Mabuza', 'S. Hendricks', 'L. Naicker', 'T. Mashaba', 'P. Oosthuizen', 'N. Mkhize', 'R. Singh', 'A. Jooste', 'M. Phiri', 'C. de Villiers'];
  const pods = [];
  for (let i = 1; i <= 10; i += 1) {
    pods.push({ id: i, shipment_id: i, driver_id: ((i - 1) % 5) + 1, recipient_name: recipients[i - 1], note: 'Goods received in good condition.',
      latitude: money(-26.2 + i * 0.1), longitude: money(28.0 + i * 0.12), delivered_at: T(startDay(i) + 3, 14) });
  }
  add('proof_of_delivery', pods);

  const incTypes = ['delay', 'breakdown', 'damage', 'delay', 'accident', 'other', 'breakdown', 'delay', 'damage', 'theft'];
  add('incidents', incTypes.map((type, i) => ({ id: i + 1, driver_id: (i % 9) + 1, shipment_id: (i % 12) + 1, vehicle_id: (i % 12) + 1, type, severity: ['low', 'medium', 'high'][i % 3],
    description: `${type[0].toUpperCase()}${type.slice(1)} reported during delivery run ${i + 1}.`, status: ['resolved', 'investigating', 'open'][i % 3], reported_at: T(i * 4 + 2, 15) })));

  /* ---------- warehouse inventory & movements ---------- */
  const skus = [['PAL-EUR', 'Euro pallets', 'Packaging', 'units', 600], ['WRP-500', 'Stretch wrap rolls', 'Packaging', 'rolls', 400], ['STR-RAT', 'Ratchet straps 5m', 'Load restraints', 'units', 350],
    ['CRT-L', 'Large cartons', 'Packaging', 'units', 900], ['LBR-ADJ', 'Adjustable load bars', 'Load restraints', 'units', 150], ['VST-HV', 'Hi-vis safety vests', 'Safety', 'units', 220],
    ['GLV-WRK', 'Work gloves', 'Safety', 'pairs', 300], ['TAP-PKG', 'Packing tape', 'Packaging', 'rolls', 500], ['LBL-A5', 'Shipping labels A5', 'Stationery', 'packs', 260],
    ['TYR-295', 'Truck tyres 295/80', 'Spare parts', 'units', 120], ['OIL-15W', 'Engine oil 15W-40 (5L)', 'Lubricants', 'units', 180], ['BRK-PAD', 'Brake pad sets', 'Spare parts', 'sets', 90]];
  const invRows = []; const invKey = {};
  const place = (wh, idx) => { const s = skus[idx]; const id = invRows.length + 1; invKey[`${wh}-${s[0]}`] = id; invRows.push({ id, warehouse_id: wh, sku: s[0], name: s[1], category: s[2], unit: s[3], quantity: 0, reorder_level: 10, location: `${String.fromCharCode(65 + (id % 6))}-${String(1 + (id % 12)).padStart(2, '0')}`, created_at: T(-30, 8) }); return id; };
  for (let k = 0; k < 12; k += 1) place(1, k);
  for (let k = 0; k < 8; k += 1) place(2, k);
  for (let k = 0; k < 4; k += 1) place(3, k);

  const movements = []; const balance = {};
  const move = (invId, type, qty, ref, note, day, by, shipmentId) => {
    balance[invId] = (balance[invId] || 0) + qty;
    if (balance[invId] < 0) throw new Error(`Seed would make stock negative for inventory ${invId}`);
    movements.push({ id: movements.length + 1, inventory_id: invId, type, quantity: qty, balance_after: balance[invId], reference: ref, shipment_id: shipmentId || null, note, performed_by: by, created_at: T(day, 9 + (movements.length % 7)) });
  };
  invRows.forEach((r) => { const base = skus.find((s) => s[0] === r.sku)[4]; move(r.id, 'receive', Math.round(base * (r.warehouse_id === 1 ? 1 : 0.6)), 'OPENING', 'Opening stock', -30, 5); });
  const transfers = [];
  const doTransfer = (from, to, idx, qty, day) => {
    const s = skus[idx][0]; const ref = `TRF-${String(transfers.length + 1).padStart(4, '0')}`;
    move(invKey[`${from}-${s}`], 'transfer_out', -qty, ref, `Transfer to warehouse ${to}`, day, 5);
    move(invKey[`${to}-${s}`], 'transfer_in', qty, ref, `Transfer from warehouse ${from}`, day, 5);
    transfers.push({ id: transfers.length + 1, reference: ref, sku: s, from_warehouse_id: from, to_warehouse_id: to, quantity: qty, note: 'Rebalancing stock', performed_by: 5, created_at: T(day, 10) });
  };
  [[1, 2, 0, 80], [1, 2, 1, 60], [1, 2, 2, 40], [1, 2, 3, 120], [1, 2, 4, 20], [2, 3, 0, 30], [2, 3, 1, 25], [2, 3, 2, 15], [1, 3, 3, 50], [1, 3, 1, 35]]
    .forEach(([f, t, idx, q], n) => doTransfer(f, t, idx, q, -20 + n * 2));
  for (let i = 1; i <= 8; i += 1) move(invKey[`1-${skus[(i * 3) % 12][0]}`], 'dispatch', -(10 + i * 4), `SHP-${i}`, 'Dispatched with shipment', startDay(i), 6, i);
  move(invKey['1-GLV-WRK'], 'adjustment', -12, 'CYCLE-COUNT', 'Cycle count correction', 5, 5);
  move(invKey['2-STR-RAT'], 'adjustment', 8, 'CYCLE-COUNT', 'Cycle count correction', 6, 5);
  invRows.forEach((r, idx) => {
    r.quantity = balance[r.id];
    r.reorder_level = idx % 6 === 0 ? r.quantity + 25 : Math.max(10, Math.floor(r.quantity * 0.2));
  });

  /* ---------- procurement ---------- */
  const poDefs = [[1, 5, 'Euro pallets', 'PAL-EUR', 150, 95, 'received', 1], [2, 3, 'Stretch wrap rolls', 'WRP-500', 200, 62.5, 'received', 1], [3, 8, 'Ratchet straps 5m', 'STR-RAT', 120, 78, 'received', 1],
    [4, 6, 'Hi-vis safety vests', 'VST-HV', 100, 54, 'received', 1], [5, 1, 'Truck tyres 295/80', 'TYR-295', 24, 3650, 'received', 1], [6, 7, 'Engine oil 15W-40 (5L)', 'OIL-15W', 60, 410, 'received', 1],
    [7, 3, 'Packing tape', 'TAP-PKG', 300, 18.5, 'ordered', 2], [8, 9, 'Shipping labels A5', 'LBL-A5', 80, 142, 'ordered', 1], [9, 5, 'Brake pad sets', 'BRK-PAD', 30, 1250, 'approved', 1],
    [10, 4, 'Work gloves', 'GLV-WRK', 200, 36, 'pending', 1], [11, 2, 'Large cartons', 'CRT-L', 500, 14.9, 'draft', 1], [12, 10, 'Refrigeration unit service kit', null, 2, 8900, 'cancelled', 1]];
  const prStatus = ['ordered', 'ordered', 'ordered', 'ordered', 'ordered', 'ordered', 'approved', 'approved', 'pending', 'rejected'];
  add('purchase_requests', Array.from({ length: 10 }, (_, i) => {
    const po = poDefs[i];
    return { id: i + 1, reference: `PR-${String(i + 1).padStart(4, '0')}`, requested_by: [5, 6, 7, 8, 5][i % 5], item: po[2], quantity: po[4], estimated_cost: money(po[4] * po[5]),
      justification: 'Stock replenishment for operations.', status: prStatus[i], decided_by: prStatus[i] === 'pending' ? null : 9, decided_at: prStatus[i] === 'pending' ? null : T(-25 + i, 10), created_at: T(-28 + i, 9) };
  }));
  add('purchase_orders', poDefs.map(([id, supplier, item, , qty, unit, status], i) => ({ id, po_number: `PO-${String(id).padStart(4, '0')}`, supplier_id: supplier, purchase_request_id: id <= 6 ? id : null,
    item, quantity: qty, unit_cost: unit, status, created_by: i % 2 ? 9 : 10, ordered_at: ['ordered', 'received'].includes(status) ? T(-24 + i, 10) : null, created_at: T(-26 + i, 9) })));

  const grDefs = [[1, 1, 1, 150], [2, 1, 1, 200], [3, 1, 1, 70], [3, 1, 1, 50], [4, 1, 1, 60], [4, 1, 1, 40], [5, 1, 1, 24], [6, 1, 1, 60], [7, 2, 2, 120], [8, 1, 1, 40]];
  const poSku = Object.fromEntries(poDefs.map((p) => [p[0], p[3]]));
  const gr = grDefs.map(([po, wh, , qty], i) => {
    const invId = invKey[`${wh}-${poSku[po]}`];
    move(invId, 'receive', qty, `PO-${String(po).padStart(4, '0')}`, 'Goods received against purchase order', -18 + i, 5);
    return { id: i + 1, purchase_order_id: po, warehouse_id: wh, inventory_id: invId, quantity_received: qty, note: 'Checked and counted on receipt.', received_by: 5, received_at: T(-18 + i, 11) };
  });
  invRows.forEach((r) => { r.quantity = balance[r.id]; if (r.reorder_level > r.quantity + 25 && r.id % 6 !== 1) r.reorder_level = Math.max(10, Math.floor(r.quantity * 0.2)); });
  add('inventory', invRows);
  add('stock_movements', movements);
  add('stock_transfers', transfers);
  add('goods_received', gr);

  add('supplier_invoices', Array.from({ length: 10 }, (_, i) => {
    const po = poDefs[i] || poDefs[0];
    return { id: i + 1, invoice_number: `SI-${24000 + i * 7}`, supplier_id: i < 6 ? po[1] : (i % 10) + 1, purchase_order_id: i < 6 ? po[0] : null,
      amount: i < 6 ? money(po[4] * po[5] * 1.15) : money(4200 + i * 515), status: i % 2 === 0 ? 'paid' : 'unpaid', issue_date: D(-20 + i), due_date: D(10 + i), paid_at: i % 2 === 0 ? T(-5 + i, 12) : null };
  }));

  /* ---------- fleet operations ---------- */
  const mTypes = ['Full service', 'Brake replacement', 'Tyre rotation', 'Oil change', 'Roadworthy inspection', 'Clutch repair', 'Air-con service', 'Full service', 'Tyre replacement', 'Brake inspection', 'Gearbox repair', 'Oil change'];
  add('maintenance_records', mTypes.map((type, i) => ({ id: i + 1, vehicle_id: i + 1, supplier_id: [5, 2, 2, 7, 5, 5, 10, 5, 2, 5, 5, 7][i], type, description: `${type} for vehicle ${i + 1}`,
    cost: money(1800 + i * 640), scheduled_date: D(i < 6 ? -35 + i * 3 : (i === 6 || i === 7 ? -2 : 12 + i)), completed_date: i < 6 ? D(-34 + i * 3) : null,
    status: i < 6 ? 'completed' : (i === 6 || i === 7 ? 'in_progress' : 'scheduled'), created_by: 7 })));
  add('fuel_transactions', Array.from({ length: 14 }, (_, i) => ({ id: i + 1, vehicle_id: (i % 12) + 1, driver_id: (i % 9) + 1, litres: money(60 + i * 9.5), cost_per_litre: money(22.4 + (i % 5) * 0.35),
    odometer_km: 42000 + (i % 12) * 9137 + i * 120, station: ['Engen N3 Gillooly', 'Shell Midrand', 'Total Bloemfontein', 'Sasol Polokwane'][i % 4], fuelled_at: T(i * 3, 7), recorded_by: 7 })));

  /* ---------- finance ---------- */
  const invoices = []; const payments = []; const receipts = []; const documents = [];
  const compById = Object.fromEntries(companies.map((c) => [c.id, c]));
  for (let i = 1; i <= 14; i += 1) {
    const sh = shipments[i <= 13 ? i - 1 : 17];
    const subtotal = i <= 12 ? quoted(i) : money(9800 + i * 400);
    const vat = money(subtotal * 0.15); const total = money(subtotal + vat);
    const status = i <= 6 ? 'paid' : i === 7 ? 'partially_paid' : i <= 10 ? 'unpaid' : i === 11 ? 'draft' : i === 14 ? 'cancelled' : 'unpaid';
    const issueDay = i <= 10 ? startDay(i) + 4 : 56 + i;
    const dueDay = i <= 10 ? issueDay + 30 : issueDay + 30;
    invoices.push({ id: i, invoice_number: `INV-${String(i).padStart(4, '0')}`, company_id: sh.company_id, shipment_id: sh.id, description: `Freight services ${sh.tracking_ref}: ${sh.origin} to ${sh.destination}`,
      subtotal, vat_amount: vat, total, status, issue_date: D(issueDay), due_date: D(dueDay), created_by: i % 2 ? 11 : 12, created_at: T(issueDay, 9) });
    if (i <= 10) documents.push({ id: documents.length + 1, company_id: sh.company_id, shipment_id: sh.id, invoice_id: i, type: 'invoice', title: `Invoice INV-${String(i).padStart(4, '0')}`, file_name: `INV-${String(i).padStart(4, '0')}.html`,
      mime_type: 'text/html', content: docs.invoiceHtml(invoices[i - 1], compById[sh.company_id]), is_base64: false, uploaded_by: 11, created_at: T(issueDay, 10) });
  }
  const payPlan = { 1: [1], 2: [1], 3: [0.5, 0.5], 4: [0.5, 0.5], 5: [0.6, 0.4], 6: [1], 7: [0.4] };
  Object.entries(payPlan).forEach(([invId, parts]) => {
    const inv = invoices[Number(invId) - 1]; let paid = 0;
    parts.forEach((p, k) => {
      const amount = k === parts.length - 1 && inv.status === 'paid' ? money(inv.total - paid) : money(inv.total * p);
      paid = money(paid + amount);
      const pid2 = payments.length + 1;
      const paidDay = Number(invId) <= 10 ? startDay(Number(invId)) + 8 + k * 6 : 70;
      payments.push({ id: pid2, invoice_id: inv.id, amount, method: ['eft', 'eft', 'card', 'eft'][pid2 % 4], reference: `EFT-${880000 + pid2 * 13}`, paid_at: D(paidDay), recorded_by: 11, created_at: T(paidDay, 11) });
      receipts.push({ id: pid2, receipt_number: `RCT-${String(pid2).padStart(4, '0')}`, payment_id: pid2, issued_at: T(paidDay, 11) });
    });
  });
  add('invoices', invoices); add('payments', payments); add('receipts', receipts);

  const exCats = [['fleet', 'Fuel'], ['fleet', 'Tolls'], ['warehouse', 'Forklift hire'], ['procurement', 'Supplier site visit'], ['finance', 'Audit fees'], ['admin', 'Office rent'], ['dispatch', 'Radio licences'], ['fleet', 'Vehicle licensing'], ['warehouse', 'Packaging consumables'], ['admin', 'Software subscriptions'], ['fleet', 'Insurance excess'], ['dispatch', 'Mobile data']];
  add('expenses', exCats.map(([department, category], i) => ({ id: i + 1, department, category, description: `${category} - month ${(i % 3) + 1}`, amount: money(1500 + i * 870), expense_date: D(-30 + i * 4),
    status: i % 4 === 3 ? 'pending' : i % 7 === 6 ? 'rejected' : 'approved', recorded_by: 11 + (i % 2), decided_by: i % 4 === 3 ? null : 11 })));
  const depts = ['admin', 'dispatch', 'warehouse', 'fleet', 'procurement', 'finance'];
  add('budgets', Array.from({ length: 10 }, (_, i) => ({ id: i + 1, department: depts[i % 6], period_label: i < 6 ? 'Q3-2026' : 'Q4-2026', start_date: i < 6 ? '2026-07-01' : '2026-10-01', end_date: i < 6 ? '2026-09-30' : '2026-12-31', allocated_amount: money(40000 + i * 12500) })));

  /* ---------- documents (continued), notifications, support, settings, audit ---------- */
  [1, 2, 3, 4].forEach((i) => documents.push({ id: documents.length + 1, company_id: shipments[i - 1].company_id, shipment_id: i, invoice_id: null, type: 'pod', title: `Proof of delivery ${shipments[i - 1].tracking_ref}`,
    file_name: `POD-${shipments[i - 1].tracking_ref}.html`, mime_type: 'text/html', content: docs.podHtml(shipments[i - 1], pods[i - 1]), is_base64: false, uploaded_by: 13, created_at: T(startDay(i) + 3, 15) }));
  [1, 2].forEach((i) => documents.push({ id: documents.length + 1, company_id: quotations[i - 1].company_id, shipment_id: null, invoice_id: null, type: 'quotation', title: `Quotation ${quotations[i - 1].reference}`,
    file_name: `${quotations[i - 1].reference}.html`, mime_type: 'text/html', content: docs.quotationHtml(quotations[i - 1], compById[quotations[i - 1].company_id]), is_base64: false, uploaded_by: 9, created_at: T((i - 1) * 3 + 1, 12) }));
  add('documents', documents);

  const notes = [];
  const nt = (user_id, title, message, type, et, eid, read) => notes.push({ id: notes.length + 1, user_id, title, message, type, entity_type: et, entity_id: eid, read_at: read ? T(60, 10) : null, created_at: T(55 + (notes.length % 8), 8 + (notes.length % 9)) });
  for (let i = 1; i <= 10; i += 1) nt(23 + ((i - 1) % 10), 'Shipment delivered', `Shipment ${shipments[i - 1].tracking_ref} has been delivered.`, 'success', 'shipment', i, i % 2 === 0);
  for (let i = 1; i <= 5; i += 1) nt(13 + i - 1, 'New delivery assigned', `You have been assigned shipment ${shipments[10 + i - 1].tracking_ref}.`, 'info', 'shipment', 10 + i, i % 3 === 0);
  nt(3, 'Quotation accepted', 'Quotation QT-0017 was accepted and is ready for conversion.', 'success', 'quotation', 17, false);
  nt(9, 'New quotation request', 'Quotation QT-0013 needs review.', 'info', 'quotation', 13, false);
  nt(5, 'Low stock alert', 'Some inventory items are at or below their reorder level.', 'warning', 'inventory', null, false);
  nt(7, 'Maintenance due', 'Vehicles MHL 106 KZN and MHL 107 EC are in maintenance.', 'warning', 'vehicle', 6, true);
  nt(11, 'Invoice overdue', 'Invoice INV-0008 is past its due date.', 'warning', 'invoice', 8, false);
  nt(1, 'Weekly summary ready', 'The weekly operations summary is available in Reports.', 'info', null, null, true);
  for (let i = 1; i <= 7; i += 1) nt(23 + i - 1, 'Invoice available', `Invoice INV-${String(i).padStart(4, '0')} is available in Documents.`, 'info', 'invoice', i, i % 2 === 1);
  add('notifications', notes);

  const subjects = ['Delivery delayed - need update', 'Request invoice copy', 'Change delivery contact person', 'Question about VAT on invoice', 'Portal login issue', 'Shipment shows wrong weight', 'Request for statement', 'Damaged goods claim', 'Update company address', 'Quotation follow-up'];
  const cats = ['shipment', 'billing', 'shipment', 'billing', 'technical', 'shipment', 'billing', 'shipment', 'account', 'general'];
  add('support_requests', subjects.map((subject, i) => ({ id: i + 1, reference: `SR-${String(i + 1).padStart(4, '0')}`, user_id: 23 + i, company_id: i + 1, category: cats[i], subject,
    message: `${subject}. Please assist at your earliest convenience.`, status: ['open', 'in_progress', 'resolved', 'closed', 'open'][i % 5], response: i % 5 >= 1 && i % 5 <= 3 ? 'Thank you for contacting us. We are looking into this.' : null,
    responded_by: i % 5 >= 1 && i % 5 <= 3 ? 1 : null, created_at: T(50 + i, 9), updated_at: T(51 + i, 9) })));

  const settings = []; let sid = 1;
  [[1, 'dark'], [3, 'light'], [5, 'system'], [7, 'light'], [13, 'dark'], [23, 'light'], [24, 'system']].forEach(([uid, theme]) => {
    settings.push({ id: sid++, user_id: uid, key: 'theme', value: JSON.stringify(theme), updated_at: T(40, 9) });
    settings.push({ id: sid++, user_id: uid, key: 'inAppNotifications', value: JSON.stringify(true), updated_at: T(40, 9) });
  });
  [['companyName', 'Mhambi Logistics'], ['vatRate', 0.15], ['supportEmail', 'support@mhambi-demo.test'], ['tradingHours', 'Mon-Fri 07:00-17:00'], ['currency', 'ZAR']].forEach(([key, value]) => {
    settings.push({ id: sid++, user_id: null, key, value: JSON.stringify(value), updated_at: T(0, 9) });
  });
  add('settings', settings);

  const acts = [['auth.login', 'user', 1], ['user.create', 'user', 14], ['user.role_change', 'user', 9], ['company.update', 'company', 3], ['quotation.process', 'quotation', 2], ['shipment.create', 'shipment', 5],
    ['shipment.assign', 'shipment', 5], ['inventory.receive', 'inventory', 1], ['vehicle.update', 'vehicle', 6], ['invoice.create', 'invoice', 3], ['payment.record', 'payment', 3], ['settings.system_update', 'setting', 2]];
  add('audit_logs', acts.map(([action, entity_type, entity_id], i) => ({ id: i + 1, user_id: [1, 1, 1, 2, 9, 3, 3, 5, 7, 11, 11, 1][i], action, entity_type, entity_id, details: JSON.stringify({ seeded: true }), ip: '127.0.0.1', created_at: T(20 + i * 2, 10) })));

  return out;
}

module.exports = { build };
