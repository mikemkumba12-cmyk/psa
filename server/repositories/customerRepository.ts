import { getAllCustomers, upsertCustomer } from '../db';
import type { Customer } from '../../src/types';

export const customerRepository = {
  async findAll(): Promise<Customer[]> {
    return getAllCustomers();
  },

  async findById(id: string): Promise<Customer | null> {
    const all = await getAllCustomers();
    return all.find(c => c.id === id || c.userId === id) || null;
  },

  async save(customer: Customer): Promise<Customer> {
    await upsertCustomer(customer);
    return customer;
  },
};
