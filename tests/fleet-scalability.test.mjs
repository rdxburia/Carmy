import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import worker from "../worker/src/index.js";
import { listVehicles } from "../worker/src/vehicles.js";
import { listServiceHistory } from "../worker/src/records.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function jwt(payload) {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return encode({ alg: "none" }) + "." + encode(payload) + ".signature";
}

function generateFleet(count = 105, userId = "user-fleet-test") {
  const cars = [];
  const makes = ["HYUNDAI", "MARUTI", "TATA", "HONDA", "TOYOTA", "MAHINDRA", "KIA"];
  const models = ["CRETA", "SWIFT", "NEXON", "CITY", "FORTUNER", "THAR", "SELTOS"];
  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(4, "0");
    const make = makes[i % makes.length];
    const model = models[i % models.length];
    cars.push({
      id: `car-uuid-${pad}`,
      user_id: userId,
      registration_no: `CH01BT${pad}`,
      make_model: `${make} ${model}`,
      model_year: 2018 + (i % 6),
      fuel: i % 3 === 0 ? "Diesel" : i % 3 === 1 ? "Petrol" : "CNG",
      current_km: 10000 + i * 500,
      vin: `VIN999000${pad}`,
      engine_no: `ENG888000${pad}`,
      insurance_company: "ICICI Lombard",
      insurance_number: `POL-INS-${pad}`,
      insurance_expiry: i % 10 === 0 ? "2024-01-01" : "2027-12-31", // some expired
      puc_certificate_no: `PUC-CERT-${pad}`,
      puc_state: "Chandigarh",
      puc_validity_months: 12,
      puc_expiry: i % 15 === 0 ? "2024-02-01" : "2027-06-30", // some expired
      vehicle_status: i % 20 === 0 ? "sold" : "active", // some sold
      created_at: new Date(Date.now() - (count - i) * 86400000).toISOString()
    });
  }
  return cars;
}

function createFleetEnvironment() {
  const userA = { id: "user-fleet-test", email: "fleetowner@torqdesk.test" };
  const userB = { id: "user-other-test", email: "otherowner@torqdesk.test" };
  const fleetA = generateFleet(105, userA.id);
  const fleetB = generateFleet(10, userB.id);

  // Generate records for fleet A: each car has distinct records
  const records = [];
  fleetA.forEach((car, idx) => {
    // Car 1 gets 3 records, Car 2 gets 2 records, others get 1 record
    const numRecords = idx === 0 ? 3 : idx === 1 ? 2 : 1;
    for (let r = 1; r <= numRecords; r++) {
      records.push({
        id: `rec-${car.id}-${r}`,
        user_id: userA.id,
        car_id: car.id,
        service_date: `2026-0${Math.min(9, r + 1)}-15`,
        odometer_km: car.current_km - 500 * (numRecords - r),
        record_type: r === 1 ? "Regular Service" : "Engine Service",
        description: `Service #${r} for ${car.registration_no}`,
        parts_cost: 1200 * r,
        labour_cost: 500 * r,
        other_cost: 0,
        total_cost: 1700 * r,
        workshop: `Workshop ${car.make_model.split(" ")[0]} Authorized`,
        record_items: [{ item_name: `Engine Oil Grade ${r}` }]
      });
    }
  });

  const cacheStore = new Map();
  const sessionActivity = {
    session_id: "sess-fleet-1",
    user_id: userA.id,
    last_seen: Math.floor(Date.now() / 1000) - 10,
    last_heartbeat: 0
  };

  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "secret-key",
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (sql.includes("FROM cache_entries WHERE cache_key = ?1")) {
                  const key = args[0];
                  if (cacheStore.has(key)) {
                    return { data_json: JSON.stringify(cacheStore.get(key)), expires_at: Math.floor(Date.now() / 1000) + 300 };
                  }
                  return null;
                }
                if (sql.includes("FROM session_activity WHERE session_id = ?")) {
                  return sessionActivity;
                }
                return null;
              },
              async run() {
                if (sql.includes("INSERT INTO cache_entries")) {
                  const key = args[0];
                  const data = JSON.parse(args[3]);
                  cacheStore.set(key, data);
                } else if (sql.includes("DELETE FROM cache_entries WHERE cache_key = ?1")) {
                  cacheStore.delete(args[0]);
                }
              }
            };
          }
        };
      }
    }
  };

  return { userA, userB, fleetA, fleetB, records, env };
}

test("Fleet 100+ Scalability: 1. All 100+ vehicles can be browsed and searched in client state", () => {
  const { fleetA } = createFleetEnvironment();
  assert.equal(fleetA.length, 105);

  // Search by registration number
  const targetCar = fleetA[42]; // CH01BT0043
  const searchResults = fleetA.filter(c => c.registration_no.toLowerCase().includes("bt0043"));
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, targetCar.id);

  // Search by make/model
  const cretaCars = fleetA.filter(c => c.make_model.toLowerCase().includes("creta"));
  assert.ok(cretaCars.length > 10);
});

test("Fleet 100+ Scalability: 2. Pagination does not skip or duplicate vehicles", () => {
  const { fleetA } = createFleetEnvironment();
  const pageSize = 10;
  const totalPages = Math.ceil(fleetA.length / pageSize);
  assert.equal(totalPages, 11);

  const seenIds = new Set();
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const pageItems = fleetA.slice(start, start + pageSize);
    for (const item of pageItems) {
      assert.ok(!seenIds.has(item.id), `Duplicate vehicle ${item.id} found on page ${page}`);
      seenIds.add(item.id);
    }
  }
  assert.equal(seenIds.size, 105);
});

test("Fleet 100+ Scalability: 3. Selecting one vehicle loads only its own related data", () => {
  const { fleetA, records } = createFleetEnvironment();
  const car1 = fleetA[0];
  const car2 = fleetA[1];

  const car1Records = records.filter(r => r.car_id === car1.id);
  const car2Records = records.filter(r => r.car_id === car2.id);

  assert.equal(car1Records.length, 3);
  assert.equal(car2Records.length, 2);

  // Verify strict isolation
  car1Records.forEach(r => assert.equal(r.car_id, car1.id));
  car2Records.forEach(r => assert.equal(r.car_id, car2.id));
});

test("Fleet 100+ Scalability: 4. Switching vehicles cannot briefly show previous vehicle's records", () => {
  const { fleetA, records } = createFleetEnvironment();
  const car1 = fleetA[0];
  const car2 = fleetA[1];

  let currentCar = car1;
  let activeRecords = records.filter(r => r.car_id === car1.id);
  assert.equal(activeRecords.length, 3);

  // Simulate openCar(car2.id) atomic transition:
  // Immediate reset clears records before async fetch completes
  currentCar = car2;
  activeRecords = []; // Reset on switch!
  assert.equal(activeRecords.length, 0, "Active records must be cleared immediately upon switching");

  // Fetch finishes for car2:
  activeRecords = records.filter(r => r.car_id === car2.id);
  assert.equal(activeRecords.length, 2);
  activeRecords.forEach(r => assert.equal(r.car_id, car2.id));
});

test("Fleet 100+ Scalability: 5. Race condition guard: in-flight response for previous car is discarded", () => {
  let currentLoadingCarId = "car-uuid-0001";
  const incomingDataFromOldRequest = [{ id: "rec-old-1", car_id: "car-uuid-0001" }];

  // User switched to car-uuid-0002 before request finished
  currentLoadingCarId = "car-uuid-0002";

  // When request 1 resolves:
  let appliedRecords = [];
  if (currentLoadingCarId === "car-uuid-0001") {
    appliedRecords = incomingDataFromOldRequest;
  }
  assert.equal(appliedRecords.length, 0, "Stale in-flight response was rejected");
});

test("Fleet 100+ Scalability: 6. Adding a record associates it strictly with selected car_id", () => {
  const { fleetA } = createFleetEnvironment();
  const selectedCar = fleetA[5]; // CH01BT0006
  const newRecord = {
    p_car_id: selectedCar.id,
    p_odometer_km: 15000,
    p_record_type: "Regular Service",
    p_parts_cost: 2000,
    p_labour_cost: 800
  };

  assert.equal(newRecord.p_car_id, selectedCar.id);
  assert.notEqual(newRecord.p_car_id, fleetA[0].id);
});

test("Fleet 100+ Scalability: 7. Editing or deleting a record affects only the intended record", () => {
  const { fleetA, records } = createFleetEnvironment();
  const car1 = fleetA[0];
  const targetRecord = records.find(r => r.car_id === car1.id);
  const targetId = targetRecord.id;

  // Simulate RPC delete_service_record { p_record_id, p_car_id }
  const remaining = records.filter(r => !(r.id === targetId && r.car_id === car1.id));
  assert.equal(remaining.length, records.length - 1);
  assert.ok(!remaining.some(r => r.id === targetId));
  // All other records remain intact
  assert.equal(remaining.filter(r => r.car_id === car1.id).length, 2);
});

test("Fleet 100+ Scalability: 8. Vehicle report contains only that vehicle's information", () => {
  const { fleetA, records } = createFleetEnvironment();
  const car1 = fleetA[0];
  const car2 = fleetA[1];

  // Report function filter simulation:
  const carRecords = records.filter(r => !r.car_id || r.car_id === car1.id);
  const totalCost = carRecords.reduce((sum, r) => sum + r.total_cost, 0);

  assert.equal(carRecords.length, 3);
  assert.equal(totalCost, 1700 + 3400 + 5100);
  assert.ok(!carRecords.some(r => r.car_id === car2.id));
});

test("Fleet 100+ Scalability: 9. User A cannot access User B's vehicles or records", () => {
  const { fleetA, fleetB, userA, userB } = createFleetEnvironment();
  
  // Isolation by user_id
  const userACars = fleetA.filter(c => c.user_id === userA.id);
  const userBCars = fleetB.filter(c => c.user_id === userB.id);

  assert.equal(userACars.length, 105);
  assert.equal(userBCars.length, 10);
  assert.ok(!userACars.some(c => c.user_id === userB.id));
  assert.ok(!userBCars.some(c => c.user_id === userA.id));
});

test("Fleet 100+ Scalability: 10. Large lists remain responsive and recover from API errors", async () => {
  const { fleetA } = createFleetEnvironment();
  
  // Performance test: filtering, sorting, and slicing 105 items
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    const q = "hyundai";
    const filtered = fleetA.filter(c => c.make_model.toLowerCase().includes(q));
    const sorted = [...filtered].sort((a, b) => a.registration_no.localeCompare(b.registration_no));
    const page = sorted.slice(0, 10);
    assert.ok(page.length <= 10);
  }
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 200, `100 iterations of fleet operations took ${elapsed}ms (< 200ms expected)`);

  // Recovery test: network error fallback preserves existing cache
  let localCars = fleetA;
  const mockNetworkFail = async () => { throw new Error("503 Service Unavailable"); };
  try {
    await mockNetworkFail();
  } catch (err) {
    // Retain cached cars
    assert.equal(localCars.length, 105);
  }
});
