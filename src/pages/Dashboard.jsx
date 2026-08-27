"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { formatDate, parseNumber, normalizeForMatch } from "../utils/helpers";
import { supabase } from "../utils/supabaseClient";
import { generateLiveInventoryReport } from "../utils/liveInventoryReport";
import { TABLES, withItemMaster } from "../utils/dbSchema";
import {
  TrendingUp,
  Package,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Layout,
  Info,
  ArrowRight,
  CheckCircle2,
  Activity,
  Settings2,
  Eye,
  EyeOff,
  ChevronDown,
  X,
  Calendar,
  FileText,
  Loader2
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";


export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("today"); // 'today' or 'history'
  const [showExactValues, setShowExactValues] = useState(false);
  const [inventoryData, setInventoryData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterName, setFilterName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [visibleColumns, setVisibleColumns] = useState({
    date: true,
    serial: true,
    type: true,
    department: true,
    itemName: true,
    purchase: true,
    opening: true,
    closing: true,
    balance: true,
    issue: true,
    returns: true,
    damage: true,
    missing: true,
    image: true
  });

  const todayColumns = [
    { key: 'serial', label: 'S.No' },
    { key: 'type', label: 'Inventory Type' },
    { key: 'department', label: 'Department' },
    { key: 'itemName', label: 'Items Name' },
    { key: 'purchase', label: 'Total Purchased' },
    { key: 'opening', label: 'Opening Balance' },
    { key: 'closing', label: 'Closing Balance' },
    { key: 'issue', label: 'Total Issue' },
    { key: 'returns', label: 'Total Return' },
    { key: 'damage', label: 'Total Damage' },
    { key: 'missing', label: 'Total Missing' },
    { key: 'image', label: 'Image' }
  ];

  const historyColumns = [
    { key: 'date', label: 'Date' },
    { key: 'serial', label: 'S.No' },
    { key: 'itemName', label: 'Items Name' },
    { key: 'purchase', label: 'Total Purchased' },
    { key: 'opening', label: 'Opening Balance' },
    { key: 'closing', label: 'Closing Balance' },
    { key: 'issue', label: 'Total Issue' },
    { key: 'returns', label: 'Total Return' },
    { key: 'damage', label: 'Total Damage' },
    { key: 'missing', label: 'Total Missing' }
  ];

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatNumber = (num) => {
    if (showExactValues) return num.toLocaleString('en-IN');
    if (num >= 10000000) return (num / 10000000).toFixed(2) + " Cr";
    if (num >= 100000) return (num / 100000).toFixed(2) + " L";
    if (num >= 1000) return (num / 1000).toFixed(1) + " K";
    return num.toString();
  };

  function getDisplayableImageUrl(url) {
    if (!url || url === "No Image") return null;
    try {
      // Legacy Drive-hosted images (pre-Supabase-cutover) render better as a
      // thumbnail transform; anything else (Supabase Storage, etc.) is used as-is.
      const match = url.match(/(?:id=|\/d\/)([a-zA-Z0-9\-_]{25,})/);
      if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
      return url;
    } catch { return url; }
  }

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      let all = [];
      const pageSize = 1000;
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from(TABLES.INVENTORY_CURRENT)
          .select(`
            item_id, opening_balance, closing_balance, current_stock,
            total_purchased, total_issue, total_return, total_damage, total_missing,
            image_url,
            ${withItemMaster('item_name, inventory_type, department')}
          `)
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < pageSize) break;
      }

      setInventoryData(all.map((row, idx) => ({
        id: row.item_id,
        serial: idx + 1,
        type: row.item_master?.inventory_type,
        department: row.item_master?.department,
        name: row.item_master?.item_name,
        purchase: parseNumber(row.total_purchased),
        opening: parseNumber(row.opening_balance),
        // closing_balance is only frozen at 23:00 IST — before that, show the
        // live current_stock estimate so "Today" always reflects reality.
        closing: parseNumber(row.closing_balance ?? row.current_stock),
        issue: parseNumber(row.total_issue),
        returns: parseNumber(row.total_return),
        damage: parseNumber(row.total_damage),
        missing: parseNumber(row.total_missing),
        imageUrl: row.image_url || ''
      })));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistoryData = async () => {
    setHistoryLoading(true);
    try {
      let all = [];
      const pageSize = 1000;
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from(TABLES.INVENTORY_DAILY_SNAPSHOT)
          .select(`
            snapshot_date, total_purchased, opening_balance, closing_balance,
            total_issue, total_return, total_damage, total_missing,
            ${withItemMaster('item_name')}
          `)
          .order("snapshot_date", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (error) throw error;

        all = all.concat(data || []);
        setHistoryData(all.map((row, idx) => ({
          id: `hist-${idx}`,
          date: row.snapshot_date,
          serial: idx + 1,
          name: row.item_master?.item_name,
          purchase: parseNumber(row.total_purchased),
          opening: parseNumber(row.opening_balance),
          closing: parseNumber(row.closing_balance),
          issue: parseNumber(row.total_issue),
          returns: parseNumber(row.total_return),
          damage: parseNumber(row.total_damage),
          missing: parseNumber(row.total_missing)
        })));

        if (!data || data.length < pageSize) break;
      }
    } catch (err) {
      console.error("Dashboard history fetch error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === "history" && historyData.length === 0) {
      fetchHistoryData();
    }
  }, [activeTab]);

  const currentData = activeTab === "today" ? inventoryData : historyData;
  const columnConfig = activeTab === "today" ? todayColumns : historyColumns;

  // FACETED FILTERING HELPER FUNCTIONS
  const rowMatchesSearch = useCallback((item, term) => {
    if (!term.trim()) return true;
    const s = normalizeForMatch(term);
    return normalizeForMatch(item.inventoryNo).includes(s) ||
           normalizeForMatch(item.type).includes(s) ||
           normalizeForMatch(item.department).includes(s) ||
           normalizeForMatch(item.name).includes(s);
  }, []);

  const dateMatchesRange = useCallback((dateStr, start, end) => {
    if (!start && !end) return true;
    if (!dateStr) return false;

    let d, m, y;
    if (dateStr.includes("/")) {
      [d, m, y] = dateStr.split(" ")[0].split("/");
    } else {
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj)) return false;
      d = dateObj.getDate();
      m = dateObj.getMonth() + 1;
      y = dateObj.getFullYear();
    }
    
    // Create UTC-safe dates for comparison
    const itemDate = new Date(y, m - 1, d);
    itemDate.setHours(0,0,0,0);

    if (start) {
      const s = new Date(start);
      s.setHours(0,0,0,0);
      if (itemDate < s) return false;
    }
    if (end) {
      const e = new Date(end);
      e.setHours(23,59,59,999);
      if (itemDate > e) return false;
    }
    return true;
  }, []);

  // FACETED OPTIONS CALCULATION
  const typeOptions = useMemo(() => {
    const filtered = currentData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterDept || item.department === filterDept) &&
             (!filterName || item.name === filterName) &&
             (activeTab === "today" ? true : dateMatchesRange(item.date, startDate, endDate));
    });
    return [...new Set(filtered.map(item => item.type).filter(Boolean))].sort();
  }, [currentData, searchTerm, filterDept, filterName, startDate, endDate, activeTab]);

  const deptOptions = useMemo(() => {
    const filtered = currentData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterType || item.type === filterType) &&
             (!filterName || item.name === filterName) &&
             (activeTab === "today" ? true : dateMatchesRange(item.date, startDate, endDate));
    });
    return [...new Set(filtered.map(item => item.department).filter(Boolean))].sort();
  }, [currentData, searchTerm, filterType, filterName, startDate, endDate, activeTab]);

  const nameOptions = useMemo(() => {
    const filtered = currentData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterType || item.type === filterType) &&
             (!filterDept || item.department === filterDept) &&
             (activeTab === "today" ? true : dateMatchesRange(item.date, startDate, endDate));
    });
    return [...new Set(filtered.map(item => item.name).filter(Boolean))].sort();
  }, [currentData, searchTerm, filterType, filterDept, startDate, endDate, activeTab]);

  // MAIN FILTERED DATA
  const filteredData = useMemo(() => {
    return currentData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterType || item.type === filterType) &&
             (!filterDept || item.department === filterDept) &&
             (!filterName || item.name === filterName) &&
             (activeTab === "today" ? true : dateMatchesRange(item.date, startDate, endDate));
    });
  }, [currentData, searchTerm, filterType, filterDept, filterName, startDate, endDate, activeTab]);

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const filterParts = [];
      if (filterType) filterParts.push(`Type: ${filterType}`);
      if (filterDept) filterParts.push(`Department: ${filterDept}`);
      if (filterName) filterParts.push(`Item: ${filterName}`);
      if (searchTerm) filterParts.push(`Search: "${searchTerm}"`);
      const filterSummary = filterParts.length ? `Filters — ${filterParts.join('   |   ')}` : '';

      await generateLiveInventoryReport({
        data: filteredData,
        columnConfig: todayColumns,
        visibleColumns,
        filterSummary
      });
    } catch (err) {
      console.error("Failed to export PDF:", err);
      alert(err.message || "Failed to generate PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const metricsFilteredData = useMemo(() => {
    return currentData.filter(item => {
      return (!filterType || item.type === filterType) &&
             (!filterDept || item.department === filterDept) &&
             (!filterName || item.name === filterName) &&
             (activeTab === "today" ? true : dateMatchesRange(item.date, startDate, endDate));
    });
  }, [currentData, filterType, filterDept, filterName, startDate, endDate, activeTab]);

  const dashboardStats = useMemo(() => {
    let totals = { p:0, o:0, i:0, r:0, d:0, m:0 };
    metricsFilteredData.forEach(item => {
      totals.p += item.purchase || 0;
      totals.o += item.opening || 0;
      totals.i += item.issue || 0;
      totals.r += item.returns || 0;
      totals.d += item.damage || 0;
      totals.m += item.missing || 0;
    });
    return {
      totalPurchased: totals.p,
      openingBalance: totals.o,
      totalIssued: totals.i,
      totalReturned: totals.r,
      totalDamaged: totals.d,
      totalMissing: totals.m
    };
  }, [metricsFilteredData]);

  // eslint-disable-next-line no-unused-vars
  const MetricCard = ({ title, value, icon: Icon, color, loading: cardLoading }) => (
    <div
      className={`group relative overflow-hidden bg-white p-2.5 px-4 rounded-2xl border border-violet-100 shadow-sm shadow-violet-500/5 hover:shadow-violet-500/10 transition-all duration-500 cursor-pointer flex items-center gap-3.5 ${cardLoading ? 'animate-pulse' : ''}`}
      onClick={() => !cardLoading && setShowExactValues(!showExactValues)}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`}></div>
      <div className={`p-1.5 rounded-lg ${color.replace('bg-', '')}-50 transition-colors duration-500 group-hover:scale-110 shrink-0`}>
        <Icon className={`h-3.5 w-3.5 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[7.5px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-0.5 truncate">{title}</p>
        <div className="flex items-baseline gap-2">
          {cardLoading ? <div className="h-6 w-16 bg-slate-100 rounded-md"></div> : <h3 className="text-lg font-bold text-slate-900 tracking-tight truncate">{value}</h3>}
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="min-h-screen bg-[#f0f2f8] font-sans flex flex-col">
        <div className="flex-1 flex flex-col min-h-0 space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-1000">

          <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 pt-6 pb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            <div className="flex items-center gap-3">
              <button onClick={() => activeTab === "today" ? fetchDashboardData() : fetchHistoryData()} className="p-3.5 bg-white border border-violet-100 rounded-xl text-slate-400 hover:text-violet-600 shadow-xl shadow-violet-500/5 transition-all active:scale-95">
                <RefreshCw className={`h-4.5 w-4.5 ${(loading || historyLoading) ? 'animate-spin' : ''}`} />
              </button>
              <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last updated: <span className="text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 px-4 sm:px-6">
            <MetricCard title="Total Purchased" value={formatNumber(dashboardStats.totalPurchased)} icon={Package} color="bg-violet-600" loading={loading} />
            <MetricCard title="Opening Balance" value={formatNumber(dashboardStats.openingBalance)} icon={Layout} color="bg-fuchsia-600" loading={loading} />
            <MetricCard title="Total Issued" value={formatNumber(dashboardStats.totalIssued)} icon={Activity} color="bg-blue-500" loading={loading} />
            <MetricCard title="Total Returned" value={formatNumber(dashboardStats.totalReturned)} icon={RefreshCw} color="bg-emerald-500" loading={loading} />
          </div>

          <div className="bg-white mx-4 sm:mx-6 mb-6 rounded-xl border border-slate-100 shadow-sm flex flex-col flex-1 min-h-0 relative">
            
            <div className="flex flex-col border-b border-slate-100/50">
              <div className="flex px-4 sm:px-6 pt-4 gap-1">
                <button 
                  onClick={() => setActiveTab("today")}
                  className={`px-5 sm:px-6 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "today" ? 'bg-slate-50 text-violet-600 border-x border-t border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Today
                </button>
                <button 
                  onClick={() => setActiveTab("history")}
                  className={`px-5 sm:px-6 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "history" ? 'bg-slate-50 text-violet-600 border-x border-t border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  History
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight whitespace-nowrap">Inventory Details</h3>
                  <div className="relative w-40 sm:w-52 md:w-60 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9 w-full pl-10 pr-4 rounded-xl bg-white border border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/5 outline-none text-xs text-slate-600 font-medium transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm max-w-full">
                    <select
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      className="h-8 pl-2 pr-7 bg-slate-50 border border-transparent rounded-xl text-[9.5px] font-bold text-slate-600 hover:bg-slate-100 transition-all appearance-none cursor-pointer max-w-[120px]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '12px' }}
                    >
                      <option value="">All Items</option>
                      {nameOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>

                    {activeTab === "today" && (
                      <>
                        <select
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="h-8 pl-2 pr-7 bg-slate-50 border border-transparent rounded-xl text-[9.5px] font-bold text-slate-600 hover:bg-slate-100 transition-all appearance-none cursor-pointer max-w-[110px]"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '12px' }}
                        >
                          <option value="">All Types</option>
                          {typeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>

                        <select
                          value={filterDept}
                          onChange={(e) => setFilterDept(e.target.value)}
                          className="h-8 pl-2 pr-7 bg-slate-50 border border-transparent rounded-xl text-[9.5px] font-bold text-slate-600 hover:bg-slate-100 transition-all appearance-none cursor-pointer max-w-[110px]"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '12px' }}
                        >
                          <option value="">All Dept</option>
                          {deptOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </>
                    )}

                    {activeTab === "history" && (
                      <div className="flex flex-wrap items-center gap-1 ml-1 pl-2 border-l border-slate-100">
                        <div className="relative">
                          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-slate-400" />
                          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-7 pl-6 pr-1 bg-slate-50 border border-transparent rounded-lg text-[9px] font-bold text-slate-600 cursor-pointer" />
                        </div>
                        <span className="text-slate-300 text-[9px] font-black">TO</span>
                        <div className="relative">
                          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-slate-400" />
                          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 pl-6 pr-1 bg-slate-50 border border-transparent rounded-lg text-[9px] font-bold text-slate-600 cursor-pointer" />
                        </div>
                      </div>
                    )}

                    {(startDate || endDate || filterType || filterDept || filterName || searchTerm) && (
                      <button 
                        onClick={() => {
                          setFilterType(""); setFilterDept(""); setFilterName(""); setStartDate(""); setEndDate(""); setSearchTerm("");
                        }}
                        className="p-1 px-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <X className="h-3 w-3" />
                        <span className="text-[8px] font-black uppercase">Clear</span>
                      </button>
                    )}
                  </div>

                  {activeTab === "today" && (
                    <button
                      onClick={handleExportPDF}
                      disabled={isExporting || filteredData.length === 0}
                      className="h-9 px-3 sm:px-4 rounded-xl border flex items-center gap-2 text-[10px] font-black tracking-widest transition-all bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500 whitespace-nowrap"
                    >
                      {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                      <span>{isExporting ? "EXPORTING..." : "EXPORT PDF"}</span>
                    </button>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => setIsColMenuOpen(!isColMenuOpen)}
                      className={`h-9 px-3 sm:px-4 rounded-xl border flex items-center gap-2 text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${isColMenuOpen ? 'bg-violet-600 text-white border-violet-600 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'}`}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>COLUMNS</span>
                    </button>

                    {isColMenuOpen && (
                      <div className="absolute top-11 right-0 z-[100] w-48 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-50">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility</p>
                          <button onClick={() => setIsColMenuOpen(false)}><X className="h-4 w-4 text-slate-300" /></button>
                        </div>
                        <div className="grid gap-1.5 max-h-60 overflow-y-auto pr-1">
                          {columnConfig.map(col => (
                            <button
                              key={col.key}
                              onClick={() => toggleColumn(col.key)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-[11px] font-bold ${visibleColumns[col.key] ? 'bg-violet-100 text-violet-700' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                              <span>{col.label}</span>
                              {visibleColumns[col.key] ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar">
              <table className="w-full min-w-[850px] text-center border-collapse border-separate border-spacing-0">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-violet-50/95 backdrop-blur-sm">
                    {columnConfig.map(col => visibleColumns[col.key] && (
                      <th key={col.key} className={`px-6 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100/50 ${col.key === 'date' ? 'min-w-[110px]' : ''}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(loading || historyLoading) ? (
                    Array(8).fill(0).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {columnConfig.map(col => visibleColumns[col.key] && (
                          <td key={col.key} className="px-6 py-4"><div className="h-3 bg-slate-100 rounded w-full mx-auto"></div></td>
                        ))}
                      </tr>
                    ))
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={columnConfig.length} className="px-6 py-24">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                          <Package className="h-16 w-16 text-slate-400" />
                          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No matching records found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                        {columnConfig.map(col => {
                          if (!visibleColumns[col.key]) return null;
                          let content = "";
                          if (col.key === "serial") content = item.serial || idx + 1;
                          else if (col.key === "date") content = item.date ? formatDate(item.date) : "-";
                          else if (col.key === "itemName") content = <span className="font-bold text-slate-900 whitespace-nowrap">{item.name}</span>;
                          else if (["purchase", "opening", "closing", "issue", "returns", "damage", "missing", "balance"].includes(col.key)) {
                            content = item[col.key] || 0;
                          } else if (col.key === "image") {
                            content = item.imageUrl ? (
                              <div className="flex justify-center">
                                <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="block w-10 h-10 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
                                  <img src={getDisplayableImageUrl(item.imageUrl)} className="h-full w-full object-cover" alt="Item" />
                                </a>
                              </div>
                            ) : <span className="text-slate-200 italic text-[9px]">No Image</span>;
                          } else {
                            content = item[col.key] || "-";
                          }
                          return (
                            <td key={col.key} className={`px-4 py-3.5 text-xs font-semibold text-slate-600 ${col.key === 'date' ? 'whitespace-nowrap' : ''}`}>
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}