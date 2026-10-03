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
  Loader2,
  Clock,
  AlertCircle,
  BarChart3
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("today"); // 'today', 'history', or 'summary'
  const [showExactValues, setShowExactValues] = useState(false);
  const [inventoryData, setInventoryData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [summaryIssues, setSummaryIssues] = useState([]);
  const [summaryReturns, setSummaryReturns] = useState([]);
  const [summarySubTab, setSummarySubTab] = useState("items"); // 'items' or 'issued'
  const [summaryFilterPill, setSummaryFilterPill] = useState("all"); // 'all', 'issued', 'pending', 'returned'
  const [summaryPage, setSummaryPage] = useState(1);
  
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
    { key: 'type', label: 'Inventory Type' },
    { key: 'department', label: 'Department' },
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

  const [todayPage, setTodayPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchHistoryData = useCallback(async () => {
    setHistoryLoading(true);
    try {
      let all = [];
      const pageSize = 1000;
      for (let page = 0; ; page++) {
        let q = supabase
          .from(TABLES.INVENTORY_DAILY_SNAPSHOT)
          .select(`
            id, snapshot_date, total_purchased, opening_balance, closing_balance,
            total_issue, total_return, total_damage, total_missing,
            ${withItemMaster('item_name, inventory_type, department')}
          `)
          .order("snapshot_date", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (startDate) q = q.gte("snapshot_date", startDate);
        if (endDate) q = q.lte("snapshot_date", endDate);

        const { data, error } = await q;
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < pageSize) break;
      }

      setHistoryData(all.map((row, idx) => ({
        id: row.id || `hist-${idx}`,
        date: row.snapshot_date,
        serial: idx + 1,
        name: row.item_master?.item_name,
        type: row.item_master?.inventory_type,
        department: row.item_master?.department,
        purchase: parseNumber(row.total_purchased),
        opening: parseNumber(row.opening_balance),
        closing: parseNumber(row.closing_balance),
        issue: parseNumber(row.total_issue),
        returns: parseNumber(row.total_return),
        damage: parseNumber(row.total_damage),
        missing: parseNumber(row.total_missing)
      })));
    } catch (err) {
      console.error("Dashboard history fetch error:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [startDate, endDate]);

  const fetchSummaryData = useCallback(async () => {
    setSummaryLoading(true);
    try {
      let allIssues = [];
      const pageSize = 1000;
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from(TABLES.ISSUES)
          .select(`
            id, serial_no, item_id, party_name, event_date, issue_qty,
            venue_name, remarks, event_type, for_type, issuer, dishes, created_at,
            ${withItemMaster('item_name, inventory_type, department, image_url')}
          `)
          .order('created_at', { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (error) throw error;
        allIssues = allIssues.concat(data || []);
        if (!data || data.length < pageSize) break;
      }
      setSummaryIssues(allIssues);

      let allReturns = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from(TABLES.RETURNS)
          .select(`
            id, serial_no, item_id, party_name, return_date, issue_qty, return_qty,
            damage_qty, missing_qty, created_at
          `)
          .order('created_at', { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);

        if (error) throw error;
        allReturns = allReturns.concat(data || []);
        if (!data || data.length < pageSize) break;
      }
      setSummaryReturns(allReturns);
    } catch (err) {
      console.error("Dashboard summary fetch error:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistoryData();
    } else if (activeTab === "summary" && summaryIssues.length === 0) {
      fetchSummaryData();
    }
  }, [activeTab, fetchHistoryData, fetchSummaryData, summaryIssues.length]);

  useEffect(() => {
    setTodayPage(1);
    setHistoryPage(1);
    setSummaryPage(1);
  }, [activeTab, summarySubTab, summaryFilterPill, filterType, filterDept, filterName, startDate, endDate, searchTerm]);

  const columnConfig = activeTab === "today" ? todayColumns : historyColumns;

  // FACETED FILTERING HELPER FUNCTIONS
  const rowMatchesSearch = useCallback((item, term) => {
    if (!term.trim()) return true;
    const s = normalizeForMatch(term);
    return [item.name, item.type, item.department].some(v => v && normalizeForMatch(v).includes(s));
  }, []);

  const activeSource = activeTab === "history" ? historyData : inventoryData;

  // FACETED OPTIONS CALCULATION
  const typeOptions = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    const filtered = activeSource.filter(item => {
      const matchesSearch = !s || [item.name, item.type, item.department].some(v => v && normalizeForMatch(v).includes(s));
      const matchesDept = !filterDept || item.department === filterDept;
      const matchesName = !filterName || item.name === filterName;
      return matchesSearch && matchesDept && matchesName;
    });
    return [...new Set(filtered.map(item => item.type).filter(Boolean))].sort();
  }, [activeSource, searchTerm, filterDept, filterName]);

  const deptOptions = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    const filtered = activeSource.filter(item => {
      const matchesSearch = !s || [item.name, item.type, item.department].some(v => v && normalizeForMatch(v).includes(s));
      const matchesType = !filterType || item.type === filterType;
      const matchesName = !filterName || item.name === filterName;
      return matchesSearch && matchesType && matchesName;
    });
    return [...new Set(filtered.map(item => item.department).filter(Boolean))].sort();
  }, [activeSource, searchTerm, filterType, filterName]);

  const nameOptions = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    const filtered = activeSource.filter(item => {
      const matchesSearch = !s || [item.name, item.type, item.department].some(v => v && normalizeForMatch(v).includes(s));
      const matchesType = !filterType || item.type === filterType;
      const matchesDept = !filterDept || item.department === filterDept;
      return matchesSearch && matchesType && matchesDept;
    });
    return [...new Set(filtered.map(item => item.name).filter(Boolean))].sort();
  }, [activeSource, searchTerm, filterType, filterDept]);

  // MAIN FILTERED DATA FOR TODAY TAB
  const filteredData = useMemo(() => {
    return inventoryData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterType || item.type === filterType) &&
             (!filterDept || item.department === filterDept) &&
             (!filterName || item.name === filterName);
    });
  }, [inventoryData, searchTerm, filterType, filterDept, filterName, rowMatchesSearch]);

  const displayedTodayData = useMemo(() => {
    const start = (todayPage - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, todayPage]);

  // MAIN FILTERED DATA FOR HISTORY TAB
  const filteredHistoryData = useMemo(() => {
    return historyData.filter(item => {
      return rowMatchesSearch(item, searchTerm) &&
             (!filterType || item.type === filterType) &&
             (!filterDept || item.department === filterDept) &&
             (!filterName || item.name === filterName);
    });
  }, [historyData, searchTerm, filterType, filterDept, filterName, rowMatchesSearch]);

  const displayedHistoryData = useMemo(() => {
    const start = (historyPage - 1) * PAGE_SIZE;
    return filteredHistoryData.slice(start, start + PAGE_SIZE);
  }, [filteredHistoryData, historyPage]);

  const displayList = activeTab === "today" ? displayedTodayData : displayedHistoryData;
  const currentFilteredData = activeTab === "today" ? filteredData : filteredHistoryData;

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

  const dashboardStats = useMemo(() => {
    let totals = { p: 0, o: 0, i: 0, r: 0, d: 0, m: 0 };
    currentFilteredData.forEach(item => {
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
  }, [currentFilteredData]);

  // AGGREGATED ITEM SUMMARIES (All Items with stock, issued, remaining, returned)
  const itemSummaries = useMemo(() => {
    const issueAgg = {};
    summaryIssues.forEach(iss => {
      if (!issueAgg[iss.item_id]) {
        issueAgg[iss.item_id] = { issued: 0, parties: new Set() };
      }
      issueAgg[iss.item_id].issued += (parseNumber(iss.issue_qty) || 0);
      if (iss.party_name) issueAgg[iss.item_id].parties.add(iss.party_name);
    });

    const returnAgg = {};
    summaryReturns.forEach(ret => {
      if (!returnAgg[ret.item_id]) {
        returnAgg[ret.item_id] = { returned: 0, damage: 0, missing: 0 };
      }
      returnAgg[ret.item_id].returned += (parseNumber(ret.return_qty) || 0);
      returnAgg[ret.item_id].damage += (parseNumber(ret.damage_qty) || 0);
      returnAgg[ret.item_id].missing += (parseNumber(ret.missing_qty) || 0);
    });

    return inventoryData.map((item, idx) => {
      const issInfo = issueAgg[item.id] || { issued: 0, parties: new Set() };
      const retInfo = returnAgg[item.id] || { returned: 0, damage: 0, missing: 0 };

      const totalStock = (item.opening || 0) + (item.purchase || 0);
      const totalIssued = issInfo.issued;
      const totalReturned = retInfo.returned;
      const totalDamage = retInfo.damage;
      const totalMissing = retInfo.missing;
      const remainingOut = Math.max(0, totalIssued - totalReturned - totalDamage - totalMissing);
      const inStore = Math.max(0, totalStock - remainingOut - totalDamage - totalMissing);

      return {
        ...item,
        serial: idx + 1,
        totalStock,
        totalIssued,
        totalReturned,
        totalDamage,
        totalMissing,
        remainingOut,
        inStore,
        partyCount: issInfo.parties.size
      };
    });
  }, [inventoryData, summaryIssues, summaryReturns]);

  // DETAILED ISSUED ITEMS LIST (All individual issue records with return status)
  const summaryIssuedList = useMemo(() => {
    return summaryIssues
      .filter(iss => (parseNumber(iss.issue_qty) || 0) > 0)
      .map(iss => {
        const matched = summaryReturns.filter(r => r.item_id === iss.item_id && r.party_name === iss.party_name);
        const retQty = matched.reduce((s, r) => s + (parseNumber(r.return_qty) || 0), 0);
        const dmgQty = matched.reduce((s, r) => s + (parseNumber(r.damage_qty) || 0), 0);
        const misQty = matched.reduce((s, r) => s + (parseNumber(r.missing_qty) || 0), 0);
        const accounted = retQty + dmgQty + misQty;
        const issQty = parseNumber(iss.issue_qty) || 0;
        const remaining = Math.max(0, issQty - accounted);

        let status = 'returned';
        if (issQty > 0) {
          if (remaining === 0) status = 'returned';
          else if (accounted > 0) status = 'partial';
          else status = 'pending';
        }

        return {
          id: iss.id,
          serial: iss.serial_no,
          itemId: iss.item_id,
          name: iss.item_master?.item_name || '-',
          type: iss.item_master?.inventory_type || '-',
          department: iss.item_master?.department || '-',
          imageUrl: iss.item_master?.image_url,
          party: iss.party_name || '-',
          date: iss.event_date,
          venue: iss.venue_name || '-',
          eventType: iss.event_type || '-',
          issuer: iss.issuer || '-',
          forType: iss.for_type || '-',
          dishes: iss.dishes || '-',
          issued: issQty,
          returned: retQty,
          damaged: dmgQty,
          missing: misQty,
          remaining,
          status
        };
      })
      .sort((a, b) => {
        // Show pending & partial returns first, then order by serial number descending
        const aPending = a.status === 'pending' || a.status === 'partial';
        const bPending = b.status === 'pending' || b.status === 'partial';
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        return (b.serial || '').localeCompare(a.serial || '', undefined, { numeric: true });
      });
  }, [summaryIssues, summaryReturns]);

  // SUMMARY CARD STATS
  const summaryCardStats = useMemo(() => {
    let stock = 0, issued = 0, returned = 0, remaining = 0;
    itemSummaries.forEach(item => {
      stock += item.totalStock;
      issued += item.totalIssued;
      returned += item.totalReturned;
      remaining += item.remainingOut;
    });
    return {
      totalStock: stock,
      totalIssued: issued,
      totalReturned: returned,
      totalRemaining: remaining
    };
  }, [itemSummaries]);

  // FILTERED SUMMARY DATA
  const filteredSummaryItems = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    return itemSummaries.filter(item => {
      const matchesSearch = !s || [item.name, item.type, item.department].some(v => v && normalizeForMatch(v).includes(s));
      const matchesType = !filterType || item.type === filterType;
      const matchesDept = !filterDept || item.department === filterDept;
      const matchesName = !filterName || item.name === filterName;

      let matchesPill = true;
      if (summaryFilterPill === "issued") matchesPill = item.totalIssued > 0;
      else if (summaryFilterPill === "pending") matchesPill = item.remainingOut > 0;

      return matchesSearch && matchesType && matchesDept && matchesName && matchesPill;
    }).sort((a, b) => {
      if (b.remainingOut !== a.remainingOut) return b.remainingOut - a.remainingOut;
      if (b.totalIssued !== a.totalIssued) return b.totalIssued - a.totalIssued;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [itemSummaries, searchTerm, filterType, filterDept, filterName, summaryFilterPill]);

  const filteredSummaryIssued = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    return summaryIssuedList.filter(iss => {
      const matchesSearch = !s || [iss.name, iss.type, iss.department, iss.party, iss.venue, iss.issuer, iss.serial].some(v => v && normalizeForMatch(v).includes(s));
      const matchesType = !filterType || iss.type === filterType;
      const matchesDept = !filterDept || iss.department === filterDept;
      const matchesName = !filterName || iss.name === filterName;

      let matchesPill = true;
      if (summaryFilterPill === "pending") matchesPill = iss.status === 'pending' || iss.status === 'partial';
      else if (summaryFilterPill === "returned") matchesPill = iss.status === 'returned';

      return matchesSearch && matchesType && matchesDept && matchesName && matchesPill;
    });
  }, [summaryIssuedList, searchTerm, filterType, filterDept, filterName, summaryFilterPill]);

  const displayedSummaryItems = useMemo(() => {
    const start = (summaryPage - 1) * PAGE_SIZE;
    return filteredSummaryItems.slice(start, start + PAGE_SIZE);
  }, [filteredSummaryItems, summaryPage]);

  const displayedSummaryIssued = useMemo(() => {
    const start = (summaryPage - 1) * PAGE_SIZE;
    return filteredSummaryIssued.slice(start, start + PAGE_SIZE);
  }, [filteredSummaryIssued, summaryPage]);

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

          <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-8 pt-4 sm:pt-6 pb-2">
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (activeTab === "today") fetchDashboardData();
                  else if (activeTab === "history") fetchHistoryData();
                  else fetchSummaryData();
                }}
                className="p-2.5 sm:p-3.5 bg-white border border-violet-100 rounded-xl text-slate-400 hover:text-violet-600 shadow-xl shadow-violet-500/5 transition-all active:scale-95"
                title="Refresh Data"
              >
                <RefreshCw className={`h-4.5 w-4.5 ${(loading || historyLoading || summaryLoading) ? 'animate-spin' : ''}`} />
              </button>
              <div className="h-8 w-[1px] bg-slate-200 mx-1"></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last updated: <span className="text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>
            </div>
          </div>

          {activeTab === "summary" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 px-3 sm:px-6">
              <MetricCard title="Total Stock" value={formatNumber(summaryCardStats.totalStock)} icon={Package} color="bg-violet-600" loading={summaryLoading} />
              <MetricCard title="Total Issued" value={formatNumber(summaryCardStats.totalIssued)} icon={Activity} color="bg-blue-500" loading={summaryLoading} />
              <MetricCard title="Total Returned" value={formatNumber(summaryCardStats.totalReturned)} icon={RefreshCw} color="bg-emerald-500" loading={summaryLoading} />
              <MetricCard title="Remaining Out" value={formatNumber(summaryCardStats.totalRemaining)} icon={Clock} color="bg-amber-500" loading={summaryLoading} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 px-3 sm:px-6">
              <MetricCard title="Total Purchased" value={formatNumber(dashboardStats.totalPurchased)} icon={Package} color="bg-violet-600" loading={activeTab === "today" ? loading : historyLoading} />
              <MetricCard title="Opening Balance" value={formatNumber(dashboardStats.openingBalance)} icon={Layout} color="bg-fuchsia-600" loading={activeTab === "today" ? loading : historyLoading} />
              <MetricCard title="Total Issued" value={formatNumber(dashboardStats.totalIssued)} icon={Activity} color="bg-blue-500" loading={activeTab === "today" ? loading : historyLoading} />
              <MetricCard title="Total Returned" value={formatNumber(dashboardStats.totalReturned)} icon={RefreshCw} color="bg-emerald-500" loading={activeTab === "today" ? loading : historyLoading} />
            </div>
          )}

          <div className="bg-white mx-3 sm:mx-6 mb-6 rounded-xl border border-slate-100 shadow-sm flex flex-col flex-1 min-h-0 relative">
            
            <div className="flex flex-col border-b border-slate-100/50">
              <div className="flex px-3 sm:px-6 pt-4 gap-1">
                <button 
                  onClick={() => setActiveTab("today")}
                  className={`px-4 sm:px-6 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "today" ? 'bg-slate-50 text-violet-600 border-x border-t border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Today
                </button>
                <button 
                  onClick={() => setActiveTab("history")}
                  className={`px-4 sm:px-6 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "history" ? 'bg-slate-50 text-violet-600 border-x border-t border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  History
                </button>
                <button 
                  onClick={() => setActiveTab("summary")}
                  className={`px-4 sm:px-6 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "summary" ? 'bg-slate-50 text-violet-600 border-x border-t border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Item Summary
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-6 py-3 sm:py-4 bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight whitespace-nowrap">
                    {activeTab === "summary" ? "Inventory Summary" : "Inventory Details"}
                  </h3>

                  {activeTab === "summary" && (
                    <div className="flex items-center gap-1 p-0.5 bg-slate-200/60 rounded-xl">
                      <button
                        onClick={() => {
                          setSummarySubTab("items");
                          setSummaryFilterPill("all");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          summarySubTab === "items"
                            ? "bg-white text-violet-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All Items ({itemSummaries.length})
                      </button>
                      <button
                        onClick={() => {
                          setSummarySubTab("issued");
                          setSummaryFilterPill("all");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          summarySubTab === "issued"
                            ? "bg-white text-violet-700 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Issued Records ({summaryIssuedList.length})
                      </button>
                    </div>
                  )}

                  <div className="relative w-full sm:w-52 md:w-60 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                    <input
                      type="text"
                      placeholder={activeTab === "summary" && summarySubTab === "issued" ? "Search item, party, venue..." : "Search..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9 w-full pl-10 pr-4 rounded-xl bg-white border border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/5 outline-none text-xs text-slate-600 font-medium transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {activeTab === "summary" && summarySubTab === "items" && (
                    <div className="flex items-center gap-1 p-0.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <button
                        onClick={() => setSummaryFilterPill("all")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "all" ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSummaryFilterPill("issued")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "issued" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Issued ({itemSummaries.filter(i => i.totalIssued > 0).length})
                      </button>
                      <button
                        onClick={() => setSummaryFilterPill("pending")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "pending" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Pending Return ({itemSummaries.filter(i => i.remainingOut > 0).length})
                      </button>
                    </div>
                  )}

                  {activeTab === "summary" && summarySubTab === "issued" && (
                    <div className="flex items-center gap-1 p-0.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <button
                        onClick={() => setSummaryFilterPill("all")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "all" ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        All ({summaryIssuedList.length})
                      </button>
                      <button
                        onClick={() => setSummaryFilterPill("pending")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "pending" ? "bg-amber-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Pending ({summaryIssuedList.filter(i => i.status === 'pending' || i.status === 'partial').length})
                      </button>
                      <button
                        onClick={() => setSummaryFilterPill("returned")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          summaryFilterPill === "returned" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        Returned ({summaryIssuedList.filter(i => i.status === 'returned').length})
                      </button>
                    </div>
                  )}

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

                    {(startDate || endDate || filterType || filterDept || filterName || searchTerm || summaryFilterPill !== "all") && (
                      <button 
                        onClick={() => {
                          setFilterType(""); setFilterDept(""); setFilterName(""); setStartDate(""); setEndDate(""); setSearchTerm(""); setSummaryFilterPill("all");
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

                  {activeTab !== "summary" && (
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
                  )}
                </div>
              </div>
            </div>

            {activeTab === "summary" && summarySubTab === "items" ? (
              <div className="max-h-[65vh] overflow-x-auto overflow-y-auto relative custom-scrollbar">
                <table className="w-full min-w-[950px] text-center border-collapse border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-violet-50">
                    <tr className="bg-violet-50">
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">S.No</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Image</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100 text-left">Items Name</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Inventory Type</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Department</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Total Stock</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Total Issued</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Total Returned</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Remaining Out</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">In Store</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Dmg / Miss</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {summaryLoading ? (
                      Array(8).fill(0).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          {Array(12).fill(0).map((_, j) => (
                            <td key={j} className="px-4 py-4"><div className="h-3 bg-slate-100 rounded w-full mx-auto"></div></td>
                          ))}
                        </tr>
                      ))
                    ) : displayedSummaryItems.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-6 py-24">
                          <div className="flex flex-col items-center gap-4 opacity-30">
                            <Package className="h-16 w-16 text-slate-400" />
                            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No matching items found</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedSummaryItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-500">
                            {(summaryPage - 1) * PAGE_SIZE + idx + 1}
                          </td>
                          <td className="px-4 py-3.5">
                            {item.imageUrl ? (
                              <div className="flex justify-center">
                                <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="block w-9 h-9 rounded-lg overflow-hidden border border-slate-100 shadow-sm hover:scale-110 transition-transform">
                                  <img src={getDisplayableImageUrl(item.imageUrl)} className="h-full w-full object-cover" alt="Item" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-slate-200 italic text-[9px]">No Image</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-bold text-slate-900 text-left whitespace-nowrap">
                            {item.name}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                            {item.type || "-"}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                            {item.department || "-"}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-slate-800">
                            {item.totalStock.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold">
                            {item.totalIssued > 0 ? (
                              <span className="text-blue-600 font-bold">{item.totalIssued.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold">
                            {item.totalReturned > 0 ? (
                              <span className="text-emerald-600 font-bold">{item.totalReturned.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            {item.remainingOut > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
                                {item.remainingOut.toLocaleString('en-IN')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">
                                0
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-violet-700">
                            {item.inStore.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold">
                            {(item.totalDamage > 0 || item.totalMissing > 0) ? (
                              <span className="text-rose-600 font-bold text-[11px]">{item.totalDamage} / {item.totalMissing}</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            {item.totalIssued > 0 ? (
                              <button
                                onClick={() => {
                                  setFilterName(item.name);
                                  setSummarySubTab("issued");
                                  setSummaryFilterPill("all");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-100/80 transition-all hover:scale-105 active:scale-95"
                                title="View issue details for this item"
                              >
                                <span>{item.partyCount} {item.partyCount === 1 ? 'Party' : 'Parties'}</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[10px] italic">No issues</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : activeTab === "summary" && summarySubTab === "issued" ? (
              <div className="max-h-[65vh] overflow-x-auto overflow-y-auto relative custom-scrollbar">
                <table className="w-full min-w-[1050px] text-center border-collapse border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-violet-50">
                    <tr className="bg-violet-50">
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Serial No</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100 text-left">Item Name</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100 text-left">Party Name</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Event Date</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Venue</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Event Type</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Issuer</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Issued</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Returned</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Remaining</th>
                      <th className="px-4 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {summaryLoading ? (
                      Array(8).fill(0).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          {Array(11).fill(0).map((_, j) => (
                            <td key={j} className="px-4 py-4"><div className="h-3 bg-slate-100 rounded w-full mx-auto"></div></td>
                          ))}
                        </tr>
                      ))
                    ) : displayedSummaryIssued.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-24">
                          <div className="flex flex-col items-center gap-4 opacity-30">
                            <Package className="h-16 w-16 text-slate-400" />
                            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No matching issue records found</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedSummaryIssued.map((iss) => (
                        <tr key={iss.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-4 py-3.5 text-xs font-mono font-bold text-slate-700">
                            {iss.serial || '-'}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-left">
                            <span className="font-bold text-slate-900 block">{iss.name}</span>
                            <span className="text-[10px] text-slate-400 block">{iss.type} • {iss.department}</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-slate-800 text-left whitespace-nowrap">
                            {iss.party}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                            {iss.date ? formatDate(iss.date) : '-'}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                            {iss.venue}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                            {iss.eventType}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                            {iss.issuer}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-blue-600">
                            {iss.issued}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-emerald-600">
                            {iss.returned}
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            {iss.remaining > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {iss.remaining}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs">
                            {iss.status === 'returned' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> Returned
                              </span>
                            ) : iss.status === 'partial' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="h-3 w-3" /> Partial
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertCircle className="h-3 w-3" /> Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-x-auto overflow-y-auto relative custom-scrollbar">
                <table className="w-full min-w-[850px] text-center border-collapse border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-violet-50">
                    <tr className="bg-violet-50">
                      {columnConfig.map(col => visibleColumns[col.key] && (
                        <th key={col.key} className={`px-6 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.2em] bg-violet-50 border-b border-violet-100 ${col.key === 'date' ? 'min-w-[110px]' : ''}`}>
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
                    ) : displayList.length === 0 ? (
                      <tr>
                        <td colSpan={columnConfig.length} className="px-6 py-24">
                          <div className="flex flex-col items-center gap-4 opacity-30">
                            <Package className="h-16 w-16 text-slate-400" />
                            <p className="text-slate-500 text-xs font-black uppercase tracking-widest">No matching records found</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayList.map((item, idx) => (
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
            )}

            <Pagination
              currentPage={activeTab === "today" ? todayPage : (activeTab === "history" ? historyPage : summaryPage)}
              totalCount={
                activeTab === "today"
                  ? filteredData.length
                  : activeTab === "history"
                  ? filteredHistoryData.length
                  : (summarySubTab === "items" ? filteredSummaryItems.length : filteredSummaryIssued.length)
              }
              pageSize={PAGE_SIZE}
              onPageChange={activeTab === "today" ? setTodayPage : (activeTab === "history" ? setHistoryPage : setSummaryPage)}
              isLoading={activeTab === "summary" ? summaryLoading : (loading || historyLoading)}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}