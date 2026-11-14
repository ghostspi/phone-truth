import { openDB, type DBSchema } from "idb";
import type { Report } from "../types/report";

interface PhoneTruthDB extends DBSchema {
  reports: {
    key: string;
    value: Report;
    indexes: { "by-date": number };
  };
}

const DB_NAME = "phone-truth-db";
const STORE_NAME = "reports";
const DB_VERSION = 1;

async function getDb() {
  return openDB<PhoneTruthDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-date", "createdAt");
      }
    },
  });
}

export async function saveReport(report: Report): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, report);
}

export async function getAllReports(): Promise<Report[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, "by-date");
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function clearAllReports(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}