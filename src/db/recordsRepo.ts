import { db } from './db';
import type { Client, Invoice, PartySnapshot, Product } from './types';
import { nowIso, uid } from '@/lib/utils';

const matches = (hay: string, q: string) => hay.toLowerCase().includes(q.toLowerCase());

export async function searchClients(q: string, limit = 8): Promise<Client[]> {
  const all = await db.clients.orderBy('name').toArray();
  const ql = q.trim().toLowerCase();
  return all
    .filter((c) => matches(c.name, ql) || matches(c.vatNo, ql) || matches(c.brn, ql))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(ql)) - Number(!b.name.toLowerCase().startsWith(ql)))
    .slice(0, limit);
}

export async function createClientFromParty(p: PartySnapshot): Promise<Client> {
  const now = nowIso();
  const client: Client = {
    id: uid(),
    name: p.name.trim(),
    address: p.address,
    brn: p.brn,
    vatNo: p.vatNo,
    attention: p.attention,
    email: p.email,
    phone: p.phone,
    createdAt: now,
    updatedAt: now,
  };
  await db.clients.add(client);
  return client;
}

export function partyFromClient(c: Client): PartySnapshot {
  return {
    clientId: c.id,
    name: c.name,
    address: c.address,
    brn: c.brn,
    vatNo: c.vatNo,
    attention: c.attention,
    email: c.email,
    phone: c.phone,
  };
}

/** Most recent invoice for a client (for "create from last invoice"). */
export async function latestInvoiceForClient(clientId: string, excludeId?: string): Promise<Invoice | undefined> {
  const list = await db.invoices.where('clientId').equals(clientId).toArray();
  return list
    .filter((i) => i.id !== excludeId && i.lines.some((l) => l.description.trim()))
    .sort((a, b) => (b.issueDate + b.createdAt).localeCompare(a.issueDate + a.createdAt))[0];
}

export async function searchProducts(q: string, limit = 8): Promise<Product[]> {
  const all = await db.products.orderBy('name').toArray();
  return all.filter((p) => matches(p.name, q) || matches(p.description, q)).slice(0, limit);
}
