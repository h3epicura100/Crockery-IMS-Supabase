"use client";

import { useState, useEffect, useMemo } from "react";
import {
  PlusCircle,
  Search,
  Loader2,
  Database,
  Trash2,
  Hash,
  X,
  ChevronDown,
  Eye,
  EyeOff,
  Calendar,
  UploadCloud,
  ArrowUpRight,
  CheckCircle2,
  ShoppingCart,
  Settings2,
  FileText
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import { formatDate, parseRowDate, formatIndianAmount, normalizeForMatch } from "../utils/helpers";
import { supabase } from "../utils/supabaseClient";
import { uploadImage } from "../utils/supabaseStorage";
import { loadImageAsBase64 } from "../utils/imageBase64";
import { TABLES, COLUMNS, ENUMS, DROPDOWN_CATEGORY, withItemMaster } from "../utils/dbSchema";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function Stock() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isTableLoading, setIsTableLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [showFullTotal, setShowFullTotal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('purchase'); // 'purchase' or 'repurchase'

  // Data State — items = item_master (the catalog); stockRows/rePurchaseRows
  // = stock_transactions rows for that source, flattened with their joined
  // item_master fields for display.
  const [items, setItems] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [rePurchaseRows, setRePurchaseRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownOptions, setDropdownOptions] = useState({
    inventoryTypeOptions: [],
    departmentOptions: [],
    unitOptions: []
  });

  // Edit State — keyed by row uuid (not a sheet serial number anymore)
  const [editDataMap, setEditDataMap] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Table Filters State
  const [filterType, setFilterType] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState({
    date: true,
    type: true,
    dept: true,
    item: true,
    vendor: true,
    balance: true,
    unit: true,
    image: true,
    perUnit: true,
    costPrice: true,
    remarks: true
  });

  const columnConfig = [
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'dept', label: 'Department' },
    { key: 'item', label: 'Item Name' },
    { key: 'vendor', label: 'Vendor Name' },
    { key: 'balance', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'perUnit', label: 'Per Unit (₹)' },
    { key: 'costPrice', label: 'Cost Price (₹)' },
    { key: 'image', label: 'Image' },
    { key: 'remarks', label: 'Remarks' }
  ];

  const [showPurchaseItemDropdown, setShowPurchaseItemDropdown] = useState(false);

  // Form State — Add Stock. Items are created exclusively in Master > Items;
  // this form only records a stock_transactions row for an EXISTING item,
  // selected via strict dropdowns (Inventory Type / Department / Unit are
  // admin-managed lists — see dropdown_options / Master > Dropdowns).
  const [form, setForm] = useState({
    itemId: '',
    inventoryType: '',
    department: '',
    itemsName: '',
    vendorName: '',
    openingBalance: '',
    perUnit: '',
    unit: '',
    remarks: '',
    imageUrl: ''
  });

  // Form State — Re-Purchase (existing item only; itemId identifies which
  // item_master row this stock_transactions row belongs to).
  const [purchaseForm, setPurchaseForm] = useState({
    itemId: '',
    inventoryType: '',
    department: '',
    itemsName: '',
    vendorName: '',
    openingBalance: '',
    perUnit: '',
    unit: '',
    remarks: '',
    imageUrl: ''
  });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  function getDisplayableImageUrl(url) {
    if (!url) return null;
    try {
      // Legacy Drive-hosted images (pre-Supabase-cutover) render better as a
      // thumbnail transform; Supabase Storage URLs are used as-is.
      const directMatch = url.match(/file\/d\/([a-zA-Z0-9\-_]+)/);
      if (directMatch && directMatch[1]) return `https://drive.google.com/thumbnail?id=${directMatch[1]}&sz=w200`;
      const ucMatch = url.match(/[?&]id=([a-zA-Z0-9\-_]+)/);
      if (ucMatch && ucMatch[1]) return `https://drive.google.com/thumbnail?id=${ucMatch[1]}&sz=w200`;
      return url;
    } catch { return url; }
  }

  const toggleRowSelection = (row) => {
    const id = row.id;
    const newSelected = new Set(selectedIds);
    const newEditMap = { ...editDataMap };

    if (newSelected.has(id)) {
      newSelected.delete(id);
      delete newEditMap[id];
    } else {
      newSelected.add(id);
      newEditMap[id] = { ...row };
    }
    setSelectedIds(newSelected);
    setEditDataMap(newEditMap);
  };

  const handleSelectAll = (filteredRows) => {
    if (selectedIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedIds(new Set());
      setEditDataMap({});
    } else {
      const newSelected = new Set();
      const newEditMap = {};
      filteredRows.forEach(row => {
        newSelected.add(row.id);
        newEditMap[row.id] = { ...row };
      });
      setSelectedIds(newSelected);
      setEditDataMap(newEditMap);
    }
  };

  const handleInlineEdit = (id, field, value) => {
    setEditDataMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const changedRowsCount = useMemo(() => {
    const currentRows = activeTab === 'purchase' ? stockRows : rePurchaseRows;
    const editableFields = ['vendor_name', 'qty', 'unit', 'per_unit', 'remarks'];
    return Object.keys(editDataMap).filter(id => {
      const editRow = editDataMap[id];
      const originalRow = currentRows.find(r => r.id === id);
      if (!originalRow) return false;
      return editableFields.some(f => String(editRow[f] ?? '') !== String(originalRow[f] ?? ''));
    }).length;
  }, [editDataMap, stockRows, rePurchaseRows, activeTab]);

  const handleBatchSubmit = async () => {
    setIsSubmitting(true);
    try {
      const editableFields = ['vendor_name', 'qty', 'unit', 'per_unit', 'remarks'];
      const results = await Promise.all(Object.entries(editDataMap).map(([id, row]) => {
        const payload = {};
        editableFields.forEach(f => { payload[f] = row[f]; });
        return supabase.from(TABLES.STOCK_TRANSACTIONS).update(payload).eq(COLUMNS.STOCK_TRANSACTIONS.ID, id);
      }));
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw new Error(failed[0].error.message);

      showToast(`${results.length} record(s) updated successfully`);
      setEditDataMap({});
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      fetchStockData();
      setIsSubmitting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected record(s)?`)) return;

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const id of selectedIds) {
        const { error } = await supabase.from(TABLES.STOCK_TRANSACTIONS).delete().eq(COLUMNS.STOCK_TRANSACTIONS.ID, id);
        if (error) failCount++; else successCount++;
      }

      if (successCount > 0) showToast(`Successfully deleted ${successCount} record(s)`);
      if (failCount > 0) showToast(`Failed to delete ${failCount} record(s)`, 'error');

      setSelectedIds(new Set());
      setEditDataMap({});
      fetchStockData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from(TABLES.ITEM_MASTER)
      .select('*')
      .order(COLUMNS.ITEM_MASTER.ITEM_NAME, { ascending: true });
    if (error) { showToast(error.message, 'error'); return; }
    setItems(data || []);
  };

  // Strict, admin-managed dropdown lists (Master > Dropdowns) — Inventory
  // Type/Department/Unit are selected from here, not typed freely.
  const fetchDropdowns = async () => {
    const { data, error } = await supabase
      .from(TABLES.DROPDOWN_OPTIONS)
      .select('*')
      .order(COLUMNS.DROPDOWN_OPTIONS.VALUE, { ascending: true });
    if (error) { showToast(error.message, 'error'); return; }
    const rows = data || [];
    setDropdownOptions({
      inventoryTypeOptions: rows.filter(r => r.category === DROPDOWN_CATEGORY.INVENTORY_TYPE).map(r => r.value),
      departmentOptions: rows.filter(r => r.category === DROPDOWN_CATEGORY.DEPARTMENT).map(r => r.value),
      unitOptions: rows.filter(r => r.category === DROPDOWN_CATEGORY.UNIT).map(r => r.value)
    });
  };

  const fetchStockRows = async (source, setter) => {
    const { data, error } = await supabase
      .from(TABLES.STOCK_TRANSACTIONS)
      .select(`*, ${withItemMaster('item_name, inventory_type, department')}`)
      .eq(COLUMNS.STOCK_TRANSACTIONS.SOURCE, source)
      .order(COLUMNS.STOCK_TRANSACTIONS.CREATED_AT, { ascending: false })
      .range(0, 4999);
    if (error) { showToast(error.message, 'error'); return; }
    setter((data || []).map(row => ({
      id: row.id,
      serial_no: row.serial_no,
      created_at: row.created_at,
      item_id: row.item_id,
      inventory_type: row.item_master?.inventory_type,
      department: row.item_master?.department,
      item_name: row.item_master?.item_name,
      vendor_name: row.vendor_name,
      qty: row.qty,
      unit: row.unit,
      per_unit: row.per_unit,
      total_cost: row.total_cost,
      image_url: row.image_url,
      remarks: row.remarks
    })));
  };

  const fetchStockData = async () => {
    setIsTableLoading(true);
    await Promise.all([
      fetchStockRows(ENUMS.STOCK_SOURCE.ADD_STOCK, setStockRows),
      fetchStockRows(ENUMS.STOCK_SOURCE.RE_PURCHASE, setRePurchaseRows)
    ]);
    setIsTableLoading(false);
  };

  useEffect(() => {
    fetchItems();
    fetchDropdowns();
    fetchStockData();
  }, []);

  const historyToDisplay = useMemo(() => {
    return activeTab === 'purchase' ? stockRows : rePurchaseRows;
  }, [activeTab, stockRows, rePurchaseRows]);

  const typeOptions = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    const filtered = historyToDisplay.filter(row => {
      const matchesSearch = !s || normalizeForMatch(row.item_name).includes(s) || normalizeForMatch(row.vendor_name).includes(s);
      const matchesDept = !filterDept || row.department === filterDept;
      const matchesItem = !filterItem || row.item_name === filterItem;
      return matchesSearch && matchesDept && matchesItem;
    });
    return [...new Set(filtered.map(row => row.inventory_type).filter(Boolean))].sort();
  }, [historyToDisplay, searchTerm, filterDept, filterItem]);

  const itemOptions = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    const filtered = historyToDisplay.filter(row => {
      const matchesSearch = !s || normalizeForMatch(row.item_name).includes(s) || normalizeForMatch(row.vendor_name).includes(s);
      const matchesType = !filterType || row.inventory_type === filterType;
      const matchesDept = !filterDept || row.department === filterDept;
      return matchesSearch && matchesType && matchesDept;
    });
    return [...new Set(filtered.map(row => row.item_name).filter(Boolean))].sort();
  }, [historyToDisplay, searchTerm, filterType, filterDept]);

  const filteredStockRows = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    return historyToDisplay.filter(row => {
      const matchesSearch = !s ||
        normalizeForMatch(row.item_name).includes(s) ||
        normalizeForMatch(row.vendor_name).includes(s) ||
        normalizeForMatch(row.serial_no).includes(s);

      const matchesType = !filterType || row.inventory_type === filterType;
      const matchesDept = !filterDept || row.department === filterDept;
      const matchesItem = !filterItem || row.item_name === filterItem;

      let matchesDate = true;
      if (startDate || endDate) {
        const rowDate = parseRowDate(row.created_at);
        if (!rowDate || isNaN(rowDate)) return true;
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (rowDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (rowDate > end) matchesDate = false;
        }
      }

      return matchesSearch && matchesType && matchesDept && matchesItem && matchesDate;
    });
  }, [historyToDisplay, searchTerm, filterType, filterDept, filterItem, startDate, endDate]);

  const totalStockCost = useMemo(() => {
    return filteredStockRows.reduce((sum, row) => {
      const val = parseFloat(row.total_cost || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [filteredStockRows]);

  const [isReportGenerating, setIsReportGenerating] = useState(false);

  const handleDownloadReport = () => {
    if (filteredStockRows.length === 0) {
      showToast('No records to export', 'info');
      return;
    }

    const columnsToInclude = columnConfig.filter(col => visibleColumns[col.key] !== false);

    const reportColumns = [
      { header: 'S. No.', dataKey: 'sNo' },
      ...columnsToInclude.map(col => ({ header: col.label, dataKey: col.key }))
    ];

    const getItemImage = (row) => {
      if (row.image_url && row.image_url !== 'No Image') return row.image_url;
      const match = items.find(i => i.id === row.item_id || i.item_name === row.item_name);
      return match?.image_url && match.image_url !== 'No Image' ? match.image_url : null;
    };

    const body = filteredStockRows.map((row, index) => {
      const rowData = { sNo: index + 1 };
      columnsToInclude.forEach(col => {
        if (col.key === 'image') {
          rowData[col.key] = getItemImage(row) || '';
        } else if (col.key === 'date') {
          rowData[col.key] = formatDate(row.created_at);
        } else if (col.key === 'perUnit') {
          rowData[col.key] = `Rs ${parseFloat(row.per_unit || 0).toFixed(2)}`;
        } else if (col.key === 'costPrice') {
          const cPrice = row.total_cost ?? ((parseFloat(row.qty) || 0) * (parseFloat(row.per_unit) || 0));
          rowData[col.key] = `Rs ${parseFloat(cPrice || 0).toFixed(2)}`;
        } else if (col.key === 'balance') {
          rowData[col.key] = row.qty || 0;
        } else if (col.key === 'dept') {
          rowData[col.key] = row.department || '-';
        } else if (col.key === 'type') {
          rowData[col.key] = row.inventory_type || '-';
        } else if (col.key === 'item') {
          rowData[col.key] = row.item_name || '-';
        } else if (col.key === 'vendor') {
          rowData[col.key] = row.vendor_name || '-';
        } else if (col.key === 'remarks') {
          rowData[col.key] = row.remarks || '-';
        } else {
          rowData[col.key] = row[col.key] || '-';
        }
      });
      return rowData;
    });

    setIsReportGenerating(true);

    setTimeout(async () => {
      try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;

        const colStyles = {};
        const availableWidth = pageWidth - 12;
        const colCount = reportColumns.length;
        const hasImage = reportColumns.some(c => c.dataKey === 'image');
        const imgWeight = 1.4;
        const otherWeight = 1.0;
        const totalWeight = hasImage ? (colCount - 1) * otherWeight + imgWeight : colCount * otherWeight;
        const unitWidth = availableWidth / totalWeight;

        reportColumns.forEach(col => {
          colStyles[col.dataKey] = { cellWidth: col.dataKey === 'image' ? unitWidth * imgWeight : unitWidth * otherWeight };
        });

        const imageMap = {};
        if (visibleColumns.image) {
          const uniqueUrls = [...new Set(filteredStockRows.map(row => getItemImage(row)).filter(Boolean))];
          const results = await Promise.all(uniqueUrls.map(async (url) => ({ url, b64: await loadImageAsBase64(getDisplayableImageUrl(url)) })));
          results.forEach(({ url, b64 }) => { if (b64) imageMap[url] = b64; });
        }

        const isPurchase = activeTab === 'purchase';
        const title = `${isPurchase ? 'PURCHASE' : 'RE-PURCHASE'} HISTORY REPORT`;
        const countText = `(${body.length})`;

        doc.setFontSize(14);
        doc.setTextColor(124, 58, 237);
        doc.text(title, 14, 10);

        const titleWidth = doc.getTextWidth(title);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(countText, 14 + titleWidth + 2, 10);

        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth - 14, 10, { align: 'right' });

        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.setFont(undefined, 'bold');

        const totalCostStr = `Total Cost: Rs ${totalStockCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const dateRangeStr = (startDate || endDate) ? `Date Range: ${startDate || '...'} to ${endDate || '...'}` : 'Date Range: All Time';

        doc.text(`${totalCostStr}    ${dateRangeStr}`, 14, 16);

        autoTable(doc, {
          startY: 22,
          columns: reportColumns,
          body: body,
          theme: 'grid',
          columnStyles: colStyles,
          headStyles: { fillColor: [109, 40, 217], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2 },
          styles: { fontSize: 6, cellPadding: 1.5, halign: 'center', valign: 'middle', overflow: 'ellipsize', minCellHeight: 11.5 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          rowPageBreak: 'avoid',
          margin: { top: 14, right: 6, bottom: 20, left: 6 },
          willDrawCell: (data) => {
            if (data.column.dataKey === 'image' && data.cell.section === 'body') data.cell.text = [];
          },
          didDrawCell: (data) => {
            if (data.column.dataKey === 'image' && data.cell.section === 'body') {
              const url = data.cell.raw;
              const b64 = imageMap[url];
              if (b64) {
                const padding = 1;
                const imgSize = Math.min(data.cell.width - padding * 2, data.cell.height - padding * 2, 8);
                const x = data.cell.x + (data.cell.width - imgSize) / 2;
                const y = data.cell.y + (data.cell.height - imgSize) / 2;
                try {
                  const fmt = b64.includes('image/png') ? 'PNG' : 'JPEG';
                  doc.addImage(b64, fmt, x, y, imgSize, imgSize);
                } catch {
                  try { doc.addImage(b64, x, y, imgSize, imgSize); } catch {}
                }
              }
            }
          },
          didDrawPage: function () {
            const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
            doc.setFontSize(8);
            doc.setTextColor(120);
            doc.text(`Page ${pageNumber} of {total_pages_count_string}`, doc.internal.pageSize.width - 6, doc.internal.pageSize.height - 8, { align: 'right' });
          }
        });

        if (typeof doc.putTotalPages === 'function') doc.putTotalPages('{total_pages_count_string}');

        doc.save(`${isPurchase ? 'Purchase' : 'Re-Purchase'}_History_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Report generated successfully');
      } catch (err) {
        showToast('Failed to generate report', 'error');
      } finally {
        setIsReportGenerating(false);
      }
    }, 100);
  };

  // Items eligible for the Add Stock item picker: existing catalog items
  // matching whichever Inventory Type / Department filters are selected.
  const addStockItemOptions = useMemo(() => {
    return items.filter(i =>
      (!form.inventoryType || i.inventory_type === form.inventoryType) &&
      (!form.department || i.department === form.department)
    );
  }, [items, form.inventoryType, form.department]);

  // Department is a global, independent admin-managed list (Master >
  // Dropdowns) — most departments only ever get used with ONE inventory
  // type in practice (e.g. "Arcylic" only exists under Disposal, not
  // Crockery). Scoping the dropdown to departments that actually have items
  // under the chosen type avoids picking a combination with zero matches.
  const addStockDepartmentOptions = useMemo(() => {
    if (!form.inventoryType) return dropdownOptions.departmentOptions;
    const scoped = [...new Set(items.filter(i => i.inventory_type === form.inventoryType).map(i => i.department).filter(Boolean))];
    return scoped.length > 0 ? scoped.sort() : dropdownOptions.departmentOptions;
  }, [items, form.inventoryType, dropdownOptions.departmentOptions]);

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSelectAddStockItem = (item) => {
    setForm(prev => ({
      ...prev,
      itemId: item.id,
      itemsName: item.item_name,
      unit: item.unit || prev.unit,
      // damage_price doubles as the "last known per-unit purchase cost"
      // default suggestion — same business rule Re-Purchase already uses.
      perUnit: item.damage_price != null ? String(item.damage_price) : prev.perUnit,
      // Default to the item's existing photo — only a genuinely new upload
      // (below) replaces it, avoiding a duplicate copy of the same image.
      imageUrl: item.image_url || ''
    }));
    setImagePreview(item.image_url ? getDisplayableImageUrl(item.image_url) : null);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.itemId) {
      showToast('Select an item first.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const imageUrl = selectedImage ? await uploadImage(selectedImage) : (form.imageUrl || null);

      const { error: txnError } = await supabase.from(TABLES.STOCK_TRANSACTIONS).insert({
        source: ENUMS.STOCK_SOURCE.ADD_STOCK,
        item_id: form.itemId,
        vendor_name: form.vendorName.trim() || null,
        qty: parseFloat(form.openingBalance) || 0,
        unit: form.unit.trim() || null,
        per_unit: parseFloat(form.perUnit) || 0,
        image_url: imageUrl,
        remarks: form.remarks.trim() || null
      });
      if (txnError) throw new Error(txnError.message);

      // item_master is the single source of truth for this item's current
      // unit/price/photo — sync all three back so the NEXT Add Stock/
      // Re-Purchase fetch sees this transaction's values as the new
      // defaults, and so stock_transactions.image_url always matches
      // item_master.image_url exactly (never a second, divergent copy).
      await supabase.from(TABLES.ITEM_MASTER)
        .update({
          unit: form.unit.trim() || null,
          damage_price: parseFloat(form.perUnit) || 0,
          image_url: imageUrl
        })
        .eq(COLUMNS.ITEM_MASTER.ID, form.itemId);

      showToast('Stock registered successfully');
      setForm({ itemId: '', inventoryType: '', department: '', itemsName: '', vendorName: '', openingBalance: '', perUnit: '', unit: '', remarks: '', imageUrl: '' });
      setImagePreview(null);
      setSelectedImage(null);
      setIsModalOpen(false);
    } catch (err) {
      showToast(err?.message || 'Failed to save record', 'error');
    } finally {
      fetchItems();
      fetchStockData();
      setIsSubmitting(false);
    }
  };

  const handlePurchaseSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!purchaseForm.itemId) {
      showToast('Select an item first.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const finalImageUrl = selectedImage ? await uploadImage(selectedImage) : (purchaseForm.imageUrl || null);

      const { error: txnError } = await supabase.from(TABLES.STOCK_TRANSACTIONS).insert({
        source: ENUMS.STOCK_SOURCE.RE_PURCHASE,
        item_id: purchaseForm.itemId,
        vendor_name: purchaseForm.vendorName.trim() || null,
        qty: parseFloat(purchaseForm.openingBalance) || 0,
        unit: purchaseForm.unit.trim() || null,
        per_unit: parseFloat(purchaseForm.perUnit) || 0,
        image_url: finalImageUrl,
        remarks: purchaseForm.remarks.trim() || null
      });
      if (txnError) throw new Error(txnError.message);

      // item_master stays the single source of truth — sync unit/price/photo
      // back so the next Add Stock/Re-Purchase fetch sees these as current,
      // and stock_transactions.image_url always matches item_master exactly.
      await supabase.from(TABLES.ITEM_MASTER)
        .update({
          unit: purchaseForm.unit.trim() || null,
          damage_price: parseFloat(purchaseForm.perUnit) || 0,
          image_url: finalImageUrl
        })
        .eq(COLUMNS.ITEM_MASTER.ID, purchaseForm.itemId);

      showToast('Re-Purchase recorded successfully');
      setPurchaseForm({ itemId: '', inventoryType: '', department: '', itemsName: '', vendorName: '', openingBalance: '', perUnit: '', unit: '', remarks: '', imageUrl: '' });
      setImagePreview(null);
      setSelectedImage(null);
      setIsPurchaseModalOpen(false);
    } catch (err) {
      showToast(err?.message || 'Failed to record purchase', 'error');
    } finally {
      fetchItems();
      fetchStockData();
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="h-[calc(100vh-42px)] bg-[#f0f2f8] font-sans flex flex-col overflow-hidden">

        {/* Toast */}
        {toast.show && (
          <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-3xl shadow-2xl transition-all duration-300 transform animate-in slide-in-from-right-8 z-[100] ${toast.type === "success"
            ? "bg-violet-600 text-white shadow-violet-200"
            : "bg-red-600 text-white shadow-red-200"
            }`}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest">{toast.message}</span>
            </div>
          </div>
        )}

        {/* ── Page-level top bar ── */}
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Stock Management</h1>
          </div>

          <div className="flex items-center gap-4">
            {selectedIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isSubmitting}
                className="h-10 px-6 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg animate-in fade-in zoom-in-95 bg-rose-600 text-white hover:bg-rose-700 shadow-rose-100/50 active:scale-95 disabled:opacity-55"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete ({selectedIds.size})
              </button>
            )}
            {Object.keys(editDataMap).length > 0 && (
              <button
                onClick={handleBatchSubmit}
                disabled={isSubmitting || changedRowsCount === 0}
                className={`h-10 px-6 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg animate-in fade-in zoom-in-95 ${
                  changedRowsCount > 0
                  ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-100"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit {changedRowsCount} {changedRowsCount === 1 ? 'Change' : 'Changes'}
              </button>
            )}
            <div
              onClick={() => setShowFullTotal(!showFullTotal)}
              className="flex items-center h-10 px-4 bg-emerald-600 text-white rounded-lg shadow-sm animate-in fade-in slide-in-from-right-4 duration-500 cursor-pointer hover:bg-emerald-700 transition-all select-none"
              title={showFullTotal ? "Click to see short format" : "Click to see exact amount"}
            >
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80 mr-3">{activeTab === 'purchase' ? 'Purchase Total:' : 'Re-Purchase Total:'}</span>
              <span className="text-sm font-bold text-white">
                ₹{showFullTotal
                   ? totalStockCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                   : formatIndianAmount(totalStockCost)
                 }
              </span>
            </div>
            <button
              onClick={() => { setIsModalOpen(true); setImagePreview(null); setSelectedImage(null); }}
              className="h-10 px-5 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white rounded-lg flex items-center gap-2 text-sm font-semibold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-violet-100"
            >
              <PlusCircle className="h-4 w-4" />
              Add Stock
            </button>
            <button
              onClick={() => { setIsPurchaseModalOpen(true); setImagePreview(null); setSelectedImage(null); }}
              className="h-10 px-5 bg-white border border-violet-200 text-violet-600 rounded-lg flex items-center gap-2 text-sm font-semibold hover:bg-violet-50 transition-all active:scale-95 shadow-sm"
            >
              <ShoppingCart className="h-4 w-4 text-violet-400" />
              Re-Purchase
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={isReportGenerating || filteredStockRows.length === 0}
              className="h-10 px-5 bg-violet-600 text-white rounded-lg flex items-center gap-2 text-sm font-semibold hover:bg-violet-700 transition-all active:scale-95 shadow-md shadow-violet-200 disabled:opacity-50"
            >
              {isReportGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span>Download Report</span>
            </button>
          </div>
        </div>

        {/* ── White card wrapping title + filters + table ── */}
        <div className="mx-6 mb-6 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col flex-1 min-h-0 overflow-visible relative">

          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50 rounded-t-xl">
            <div className="flex gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl shadow-inner-sm">
              <button
                onClick={() => setActiveTab('purchase')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'purchase' ? 'bg-white text-violet-600 shadow-xl shadow-violet-100/50 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                Purchase History
              </button>
              <button
                onClick={() => setActiveTab('repurchase')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'repurchase' ? 'bg-white text-violet-600 shadow-xl shadow-violet-100/50 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              >
                Re-Purchase History
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search items..."
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:bg-white w-48 transition-all"
                  />
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="h-8 pl-2 pr-8 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 appearance-none cursor-pointer hover:border-violet-300 transition-all min-w-[80px]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}
                  >
                    <option value="">All Types</option>
                    {typeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>

                  <select
                    value={filterItem}
                    onChange={(e) => setFilterItem(e.target.value)}
                    className="h-8 pl-2 pr-8 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 appearance-none cursor-pointer hover:border-violet-300 transition-all min-w-[90px]"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}
                  >
                    <option value="">All Items</option>
                    {itemOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>

                  <div className="relative border-l border-slate-200 ml-1 pl-1">
                    <button
                      onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
                      className={`h-8 px-3 rounded-xl border border-slate-100 flex items-center gap-2 text-[10px] font-bold tracking-wider transition-all ${isDateMenuOpen || startDate || endDate ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-200' : 'bg-slate-50 text-slate-600 hover:bg-white'}`}
                    >
                      <Calendar className={`h-3 w-3 ${isDateMenuOpen || startDate || endDate ? 'text-white' : 'text-slate-400'}`} />
                      <span>{startDate || endDate ? `${startDate || '...'} - ${endDate || '...'}` : 'DATE'}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isDateMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDateMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[90]"
                          onClick={() => setIsDateMenuOpen(false)}
                        />
                        <div className="absolute top-10 right-0 z-[100] w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Date Range</p>
                            {(startDate || endDate) && (
                              <button
                                onClick={() => { setStartDate(""); setEndDate(""); }}
                                className="text-[9px] font-bold text-red-500 hover:text-red-600 uppercase tracking-tighter"
                              >
                                Clear Dates
                              </button>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">From</label>
                              <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                                <input
                                  type="date"
                                  value={startDate}
                                  onChange={(e) => setStartDate(e.target.value)}
                                  className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">To</label>
                              <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                                <input
                                  type="date"
                                  value={endDate}
                                  onChange={(e) => setEndDate(e.target.value)}
                                  className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
                                />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => setIsDateMenuOpen(false)}
                            className="w-full mt-4 py-2 bg-violet-600 text-white text-[10px] font-bold rounded-xl shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all uppercase tracking-widest"
                          >
                            Apply Filter
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {(startDate || endDate || filterType || filterDept || filterItem) && (
                    <button
                      onClick={() => {
                        setFilterType(""); setFilterDept(""); setFilterItem(""); setStartDate(""); setEndDate("");
                      }}
                      className="p-1 ml-1 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-lg transition-colors border-l border-slate-100 pl-2"
                      title="Clear All Filters"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <button
                  onClick={() => setIsColMenuOpen(!isColMenuOpen)}
                  className={`h-8 px-3 rounded-xl border border-slate-100 flex items-center gap-2 text-[10px] font-bold tracking-wider transition-all ${isColMenuOpen ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-200' : 'bg-slate-50 text-slate-600 hover:bg-white'}`}
                >
                  <Settings2 className={`h-3 w-3 ${isColMenuOpen ? 'text-white' : 'text-slate-400'}`} />
                  <span>COLUMNS</span>
                  <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isColMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isColMenuOpen && (
                  <div className="absolute top-12 right-0 z-[100] w-52 bg-white border border-slate-100 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-top-3 duration-200">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility</p>
                      <button onClick={() => setIsColMenuOpen(false)} className="text-slate-300 hover:text-slate-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1 max-h-[40vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-violet-100">
                      {columnConfig.map(col => (
                        <button
                          key={col.key}
                          onClick={() => toggleColumn(col.key)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all text-xs font-semibold ${visibleColumns[col.key] ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}
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

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-center border-collapse border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr className="bg-violet-50 border-none shadow-sm">
                  <th className="px-4 py-4 w-12 text-center bg-violet-50">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      checked={filteredStockRows.length > 0 && selectedIds.size === filteredStockRows.length}
                      onChange={() => handleSelectAll(filteredStockRows)}
                    />
                  </th>
                  {columnConfig.map(col => visibleColumns[col.key] && (
                    <th key={col.key} className="px-6 py-4 text-[10px] font-bold text-violet-600 whitespace-nowrap uppercase tracking-[0.15em] text-center bg-violet-50">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isTableLoading ? (
                  <tr>
                    <td colSpan={columnConfig.filter(c => visibleColumns[c.key]).length + 1} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Loading records...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredStockRows.length === 0 ? (
                  <tr>
                    <td colSpan={columnConfig.filter(c => visibleColumns[c.key]).length + 1} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Database className="h-8 w-8 text-slate-200" />
                        <p className="text-sm font-semibold text-slate-400">No records found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStockRows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    const currentData = editDataMap[row.id] || row;
                    const previewCost = (parseFloat(currentData.qty || 0) * parseFloat(currentData.per_unit || 0));

                    return (
                      <tr key={row.id} className={`transition-colors duration-100 border-b border-slate-50 last:border-0 ${isSelected ? 'bg-violet-50/50' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(row)}
                          />
                        </td>
                        {columnConfig.map(col => visibleColumns[col.key] && (
                          <td key={col.key} className="px-4 py-3 text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] text-center">
                            {col.key === 'balance' ? (
                              isSelected ? (
                                <input
                                  type="number"
                                  value={currentData.qty}
                                  onChange={(e) => handleInlineEdit(row.id, 'qty', e.target.value)}
                                  className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                />
                              ) : (
                                <span className="font-bold text-slate-700">{currentData.qty}</span>
                              )
                            ) : col.key === 'costPrice' ? (
                              <span className={`font-bold ${isSelected ? 'text-emerald-600' : 'text-slate-700'}`}>
                                ₹{previewCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : col.key === 'date' ? (
                              <span className="text-slate-500 font-medium">{formatDate(currentData.created_at)}</span>
                            ) : col.key === 'image' ? (
                              currentData.image_url ? (
                                <div className="flex justify-center">
                                  <a href={currentData.image_url} target="_blank" rel="noopener noreferrer" className="group relative">
                                    <img
                                      src={getDisplayableImageUrl(currentData.image_url)}
                                      alt="Preview"
                                      className="h-10 w-10 min-w-[40px] rounded-lg object-cover border border-slate-100 shadow-sm group-hover:scale-110 transition-transform duration-200"
                                      onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = 'https://placehold.co/40x40?text=IMG';
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                                      <ArrowUpRight className="h-3 w-3 text-white" />
                                    </div>
                                  </a>
                                </div>
                              ) : (
                                <span className="text-slate-300 italic text-[10px]">No Image</span>
                              )
                            ) : col.key === 'item' ? (
                              <span className="font-bold text-slate-800">{currentData.item_name}</span>
                            ) : col.key === 'type' ? (
                              <span className="text-slate-600">{currentData.inventory_type}</span>
                            ) : col.key === 'dept' ? (
                              <span className="text-slate-600">{currentData.department}</span>
                            ) : col.key === 'vendor' ? (
                              isSelected ? (
                                <input
                                  type="text"
                                  value={currentData.vendor_name || ''}
                                  onChange={(e) => handleInlineEdit(row.id, 'vendor_name', e.target.value)}
                                  className="w-24 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                />
                              ) : (
                                <span className="text-slate-600">{currentData.vendor_name}</span>
                              )
                            ) : col.key === 'unit' ? (
                              <span className="text-slate-600">{currentData.unit}</span>
                            ) : col.key === 'perUnit' ? (
                              isSelected ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={currentData.per_unit}
                                  onChange={(e) => handleInlineEdit(row.id, 'per_unit', e.target.value)}
                                  className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                />
                              ) : (
                                <span className="font-bold text-blue-600 whitespace-nowrap">₹{parseFloat(currentData.per_unit || 0).toFixed(2)}</span>
                              )
                            ) : col.key === 'remarks' ? (
                              isSelected ? (
                                <input
                                  type="text"
                                  value={currentData.remarks || ''}
                                  onChange={(e) => handleInlineEdit(row.id, 'remarks', e.target.value)}
                                  className="w-28 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                                />
                              ) : (
                                <span className="text-slate-600">{currentData.remarks}</span>
                              )
                            ) : (
                              <span className="text-slate-600">{currentData[col.key]}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RE-PURCHASE MODAL */}
        {isPurchaseModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 backdrop-blur-[2px]">
            <div
              className="absolute inset-0 bg-slate-900/30 animate-in fade-in duration-200"
              onClick={() => !isSubmitting && setIsPurchaseModalOpen(false)}
            />

            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 border border-slate-100">
              <div className="px-7 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Re-Purchase Item</h3>
                <button
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handlePurchaseSubmit} className="px-7 py-5 space-y-5 max-h-[72vh] overflow-y-auto pb-12 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory Type</label>
                    <div className="relative">
                      <select
                        value={purchaseForm.inventoryType}
                        onChange={(e) => {
                          setPurchaseForm({ ...purchaseForm, inventoryType: e.target.value, itemsName: '', itemId: '' });
                          if (e.target.value) setShowPurchaseItemDropdown(true);
                        }}
                        required
                        className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 appearance-none bg-white font-sans"
                      >
                        <option value="">Select type...</option>
                        {dropdownOptions.inventoryTypeOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={purchaseForm.itemsName}
                      onChange={(e) => {
                        setPurchaseForm(prev => ({ ...prev, itemsName: e.target.value }));
                        setShowPurchaseItemDropdown(true);
                      }}
                      onFocus={() => setShowPurchaseItemDropdown(true)}
                      onBlur={() => setTimeout(() => setShowPurchaseItemDropdown(false), 200)}
                      required
                      placeholder={purchaseForm.inventoryType ? "Search items..." : "Select type first..."}
                      disabled={!purchaseForm.inventoryType}
                      className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 disabled:bg-slate-50 disabled:text-slate-400 font-sans"
                    />
                    {showPurchaseItemDropdown && (
                      <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-56 overflow-y-auto ring-1 ring-slate-900/5">
                        {items
                          .filter(item => {
                            const rowType = String(item.inventory_type || '').trim().toLowerCase();
                            const selectedType = String(purchaseForm.inventoryType || '').trim().toLowerCase();
                            const rowName = String(item.item_name || '').toLowerCase();
                            const searchName = (purchaseForm.itemsName || '').toLowerCase();
                            return rowType === selectedType && rowName.includes(searchName);
                          })
                          .map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setPurchaseForm({
                                  ...purchaseForm,
                                  itemId: item.id,
                                  department: item.department,
                                  itemsName: item.item_name,
                                  unit: item.unit,
                                  perUnit: item.damage_price != null ? String(item.damage_price) : '',
                                  vendorName: '',
                                  imageUrl: item.image_url || '',
                                  openingBalance: '',
                                  remarks: ''
                                });
                                setImagePreview(item.image_url ? getDisplayableImageUrl(item.image_url) : null);
                                setShowPurchaseItemDropdown(false);
                              }}
                              className="w-full text-left px-5 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors"
                            >
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-sm font-semibold text-slate-700">{item.item_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                                <span>{item.department}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-200"></span>
                                <span>{item.unit}</span>
                              </div>
                            </button>
                          ))}
                        {items.filter(item => String(item.inventory_type || '').trim().toLowerCase() === String(purchaseForm.inventoryType || '').trim().toLowerCase()).length === 0 && (
                          <div className="px-5 py-4 text-xs text-slate-400 text-center italic bg-slate-50">No items found for this type</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

                <div className="space-y-5 animate-in slide-in-from-top-4 duration-500">
                  {purchaseForm.itemId && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</span>
                          <span className="text-sm font-semibold text-slate-700">{purchaseForm.department}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unit Type</span>
                          <span className="text-sm font-semibold text-slate-700">{purchaseForm.unit}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Vendor Name</label>
                      <input
                        type="text"
                        value={purchaseForm.vendorName}
                        onChange={(e) => setPurchaseForm(prev => ({ ...prev, vendorName: e.target.value }))}
                        required
                        placeholder="Update vendor..."
                        className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 font-sans"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-violet-600 uppercase tracking-wide">Quantity</label>
                      <input
                        type="number"
                        onWheel={(e) => e.target.blur()}
                        value={purchaseForm.openingBalance}
                        onChange={(e) => setPurchaseForm(prev => ({ ...prev, openingBalance: e.target.value }))}
                        required
                        placeholder="Qty..."
                        className="w-full h-11 px-4 rounded-lg border border-violet-100 focus:border-violet-500 outline-none text-sm font-bold text-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Per Unit Price (₹)</label>
                      <input
                        type="number"
                        onWheel={(e) => e.target.blur()}
                        step="0.01"
                        value={purchaseForm.perUnit}
                        onChange={(e) => setPurchaseForm(prev => ({ ...prev, perUnit: e.target.value }))}
                        required
                        className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 font-sans"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Total Cost</label>
                      <div className="w-full h-11 px-4 rounded-lg border border-emerald-100 bg-emerald-50/30 flex items-center text-sm font-bold text-emerald-700">
                        ₹{(Number(purchaseForm.openingBalance || 0) * Number(purchaseForm.perUnit || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item-Image</label>
                      <div className="h-11">
                        <input type="file" id="purchase-upload" onChange={handleImageChange} className="hidden" accept="image/*" />
                        <label htmlFor="purchase-upload" className="flex items-center justify-between px-3 h-full rounded-lg border border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all cursor-pointer overflow-hidden bg-white">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <UploadCloud className="h-4 w-4 text-slate-300 shrink-0" />
                            <span className="text-xs font-semibold text-slate-500 truncate">
                              {selectedImage ? "New File Selected" : (purchaseForm.imageUrl ? "Keep Original" : "Attach Image")}
                            </span>
                          </div>
                          <div className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Browse</div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {imagePreview && (
                    <div className="p-2 bg-white border border-slate-100 rounded-xl shadow-sm animate-in zoom-in-95 duration-300">
                      <div className="relative group rounded-lg overflow-hidden bg-slate-50 border border-slate-200 h-48">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-2 right-2">
                          <button
                            type="button"
                            onClick={() => { setImagePreview(null); setSelectedImage(null); if (!selectedImage) setPurchaseForm(p => ({ ...p, imageUrl: '' })); }}
                            className="p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg backdrop-blur-sm transition-all"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Remarks</label>
                    <textarea
                      value={purchaseForm.remarks}
                      onChange={(e) => setPurchaseForm(prev => ({ ...prev, remarks: e.target.value }))}
                      placeholder="Add purchase notes..."
                      rows="2"
                      className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 resize-none font-sans"
                    />
                  </div>
                </div>
              </form>

              <div className="px-7 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsPurchaseModalOpen(false)} disabled={isSubmitting} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-all font-sans">Cancel</button>
                <button onClick={handlePurchaseSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all flex items-center gap-2 font-sans">
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Processing..." : "Confirm Purchase"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADD STOCK MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 backdrop-blur-[2px]">
            <div className="absolute inset-0 bg-slate-900/30 animate-in fade-in duration-200" onClick={() => !isSubmitting && setIsModalOpen(false)} />
            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 border border-slate-100">
              <div className="px-7 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Add Stock Item</h3>
                <button onClick={() => setIsModalOpen(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all font-sans"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={handleSubmit} className="px-7 py-5 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar font-sans">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory Type</label>
                    <select
                      value={form.inventoryType}
                      onChange={(e) => setForm(prev => ({ ...prev, inventoryType: e.target.value, department: '', itemsName: '', itemId: '' }))}
                      required
                      className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 appearance-none bg-white"
                    >
                      <option value="">Select type...</option>
                      {dropdownOptions.inventoryTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Department</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm(prev => ({ ...prev, department: e.target.value, itemsName: '', itemId: '' }))}
                      required
                      className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 appearance-none bg-white"
                    >
                      <option value="">Select department...</option>
                      {addStockDepartmentOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item Name</label>
                  <select
                    value={form.itemId}
                    onChange={(e) => {
                      const item = addStockItemOptions.find(i => i.id === e.target.value);
                      if (item) handleSelectAddStockItem(item);
                    }}
                    required
                    disabled={!form.inventoryType || !form.department}
                    className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 appearance-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{form.inventoryType && form.department ? "Select item..." : "Select type & department first"}</option>
                    {addStockItemOptions.map(item => <option key={item.id} value={item.id}>{item.item_name}</option>)}
                  </select>
                  {form.inventoryType && form.department && addStockItemOptions.length === 0 && (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1.5 px-1">No items found — create it in Master &gt; Items first.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Vendor Name</label>
                    <input type="text" name="vendorName" value={form.vendorName} onChange={handleChange} required placeholder="Enter vendor name" className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 font-sans" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Unit</label>
                    <select
                      name="unit"
                      value={form.unit}
                      onChange={handleChange}
                      required
                      className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 appearance-none bg-white"
                    >
                      <option value="">Select unit...</option>
                      {dropdownOptions.unitOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Opening Balance</label>
                    <input type="number" onWheel={(e) => e.target.blur()} name="openingBalance" value={form.openingBalance} onChange={handleChange} required placeholder="e.g. 100" className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 font-sans" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Per Unit Price (₹)</label>
                    <input type="number" step="0.01" onWheel={(e) => e.target.blur()} name="perUnit" value={form.perUnit} onChange={handleChange} required placeholder="e.g. 25" className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 font-sans" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Total Cost</label>
                  <div className="w-full h-11 px-4 rounded-lg border border-emerald-100 bg-emerald-50/30 flex items-center text-sm font-bold text-emerald-700">₹{(Number(form.openingBalance || 0) * Number(form.perUnit || 0)).toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Attachment (Image)</label>
                  <div className="h-11">
                    <input type="file" id="modal-upload" onChange={handleImageChange} className="hidden" accept="image/*" />
                    <label htmlFor="modal-upload" className="flex items-center justify-between px-3 h-full rounded-lg border border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all cursor-pointer bg-white">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <UploadCloud className="h-4 w-4 text-slate-300 shrink-0" />
                        <span className="text-xs font-semibold text-slate-500 truncate">{selectedImage ? "New File Selected" : (form.imageUrl ? "Keep Item's Existing Photo" : "Click to upload image")}</span>
                      </div>
                      <div className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Browse</div>
                    </label>
                  </div>
                </div>
                {imagePreview && (
                  <div className="p-2 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <div className="relative group rounded-lg overflow-hidden bg-slate-50 border border-slate-200 h-48">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                      <div className="absolute top-2 right-2"><button type="button" onClick={() => { setImagePreview(null); setSelectedImage(null); setForm(p => ({ ...p, imageUrl: '' })); }} className="p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-all"><X className="h-3.5 w-3.5" /></button></div>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Remarks (Optional)</label>
                  <textarea name="remarks" value={form.remarks} onChange={handleChange} placeholder="Add any notes..." rows="2" className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 resize-none font-sans" />
                </div>
              </form>
              <div className="px-7 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-all font-sans">Cancel</button>
                <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all flex items-center gap-2 font-sans font-sans">
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Saving..." : "Add Stock"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </AdminLayout>
  );
}
