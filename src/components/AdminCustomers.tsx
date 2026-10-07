import React, { useState, useMemo } from 'react';
import { Search, MapPin, Briefcase, ChevronRight, X, AlertCircle, Plus, Sparkles, Filter, Users, Globe, Upload } from 'lucide-react';
import { Customer } from '../types';
import CustomerImportModal from './CustomerImportModal';
import Customer360Modal from './Customer360Modal';
import { applicationsStore, repaymentsStore, payrollStore, auditStore } from '../lib/store';

interface AdminCustomersProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
}

export default function AdminCustomers({ customers: customersProp, onAddCustomer }: AdminCustomersProps) {
  const customers = Array.isArray(customersProp) ? customersProp : [];
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showGeographic, setShowGeographic] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Form states for new customer creation
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('Lilongwe');
  const [newSector, setNewSector] = useState('Agriculture');
  const [newRisk, setNewRisk] = useState<'Low' | 'Medium' | 'High'>('Low');

  const filteredCustomers = customers.filter(cust => {
    const matchesSearch = cust.name.toLowerCase().includes(search.toLowerCase()) || 
                          cust.location.toLowerCase().includes(search.toLowerCase());
    const matchesSector = sectorFilter === 'All' || cust.sector === sectorFilter;
    const matchesRisk = riskFilter === 'All' || cust.riskLevel === riskFilter;
    return matchesSearch && matchesSector && matchesRisk;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newCust: Customer = {
      id: `cust-${Math.floor(Math.random() * 1000) + 100}`,
      name: newName,
      location: newLocation,
      sector: newSector,
      activeLoans: 0,
      status: `Active / ${newRisk} Risk`,
      riskLevel: newRisk,
      iconType: 'person'
    };

    onAddCustomer(newCust);
    setNewName('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Client Directory</h1>
          <p className="text-sm text-secondary">Manage Pinnacle registered small businesses and profiles.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4 text-orange-500" /> Import CSV
          </button>
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-primary text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </div>

      {showImportModal && (
        <CustomerImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            window.location.reload();
          }}
        />
      )}

      {/* Filter and Search controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search Input */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-3 text-secondary w-5 h-5" />
          <input 
            type="text" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name or location..."
            className="w-full h-11 pl-11 pr-4 bg-white border border-outline-variant/60 rounded-xl text-xs font-semibold"
          />
        </div>

        {/* Sector Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-3.5 text-secondary w-4 h-4" />
          <select 
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="w-full h-11 pl-9 pr-3 bg-white border border-outline-variant/60 rounded-xl text-xs font-bold text-secondary appearance-none"
          >
            <option value="All">All Sectors</option>
            <option value="Agriculture">Agriculture</option>
            <option value="Retail">Retail</option>
            <option value="Transport">Transport</option>
            <option value="Manufacturing">Manufacturing</option>
          </select>
        </div>

        {/* Risk Filter */}
        <div className="relative">
          <AlertCircle className="absolute left-3 top-3.5 text-secondary w-4 h-4" />
          <select 
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="w-full h-11 pl-9 pr-3 bg-white border border-outline-variant/60 rounded-xl text-xs font-bold text-secondary appearance-none"
          >
            <option value="All">All Risk Levels</option>
            <option value="Low">Low Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="High">High Risk</option>
          </select>
        </div>
      </div>

      {/* Geographic Stats Toggle */}
      <section className="bg-white border border-outline-variant rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-on-surface">Geographic Distribution Breakdown</span>
          </div>
          <button 
            onClick={() => setShowGeographic(!showGeographic)}
            className="text-xs font-bold text-primary hover:underline"
          >
            {showGeographic ? "Hide" : "Show Branches"}
          </button>
        </div>

        {showGeographic && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-container">
            <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="text-[10px] font-bold text-secondary uppercase block">Lilongwe</span>
              <span className="text-lg font-bold text-primary">42 Clients</span>
            </div>
            <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="text-[10px] font-bold text-secondary uppercase block">Blantyre</span>
              <span className="text-lg font-bold text-primary">28 Clients</span>
            </div>
            <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="text-[10px] font-bold text-secondary uppercase block">Zomba</span>
              <span className="text-lg font-bold text-primary">15 Clients</span>
            </div>
            <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-center">
              <span className="text-[10px] font-bold text-secondary uppercase block">Mzuzu</span>
              <span className="text-lg font-bold text-primary">11 Clients</span>
            </div>
          </div>
        )}
      </section>

      {/* Clients Table Card */}
      <section className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container/50 border-b border-surface-container text-secondary font-bold uppercase tracking-wider">
                <th className="p-4 font-semibold">Client Name</th>
                <th className="p-4 font-semibold">Location</th>
                <th className="p-4 font-semibold">Sector</th>
                <th className="p-4 font-semibold">Active Loans</th>
                <th className="p-4 font-semibold">Risk Rating</th>
                <th className="p-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-on-surface">{cust.name}</div>
                      <span className="text-[10px] text-secondary font-mono">{cust.id}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 font-semibold text-secondary">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> {cust.location}
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-on-surface">
                      {cust.sector}
                    </td>
                    <td className="p-4">
                      <div className="font-bold">{cust.activeLoans} active</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        cust.riskLevel === 'Low' ? 'bg-green-50 text-green-700 border border-green-200' :
                        cust.riskLevel === 'Medium' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                        'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {cust.riskLevel} Risk
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => setSelectedCustomer(cust)}
                        className="text-primary font-bold text-xs hover:underline flex items-center gap-0.5 justify-end ml-auto"
                      >
                        Profile <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-secondary">
                    No clients found. Try resetting filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* DETAILED CUSTOMER 360 PROFILE MODAL */}
      {selectedCustomer && (
        <Customer360Modal
          customer={selectedCustomer}
          applications={applicationsStore.getAllUnfiltered()}
          repayments={repaymentsStore.getAllUnfiltered()}
          payrollRecords={payrollStore.getAllRecords()}
          auditLogs={auditStore.getAll()}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* ADD NEW CLIENT MODAL FORM */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddSubmit} className="bg-white border border-outline-variant rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <h3 className="text-base font-bold text-on-surface">Add Registered Client</h3>
              <button 
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1.5 hover:bg-surface-container rounded-lg text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Full Name / Business Name</label>
                <input 
                  type="text" 
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Samuel Phiri Agri Ltd"
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Location Branch</label>
                  <select 
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-bold text-secondary"
                  >
                    <option value="Lilongwe">Lilongwe</option>
                    <option value="Blantyre">Blantyre</option>
                    <option value="Zomba">Zomba</option>
                    <option value="Mzuzu">Mzuzu</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Business Sector</label>
                  <select 
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-bold text-secondary"
                  >
                    <option value="Agriculture">Agriculture</option>
                    <option value="Retail">Retail</option>
                    <option value="Transport">Transport</option>
                    <option value="Manufacturing">Manufacturing</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Risk Category Assessment</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Low', 'Medium', 'High'] as const).map((r) => (
                    <button 
                      key={r}
                      type="button"
                      onClick={() => setNewRisk(r)}
                      className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        newRisk === r 
                          ? 'border-primary bg-primary/5 text-primary' 
                          : 'border-outline-variant text-secondary hover:bg-surface-container-low'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-3.5 bg-primary-container text-white font-bold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all mt-4"
              >
                Register & Initialize Portfolio
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
