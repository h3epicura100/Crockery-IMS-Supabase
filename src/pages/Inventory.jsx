import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Loader2,
  Database,
  Settings2,
  ChevronDown,
  Eye,
  EyeOff,
  X,
  Calendar,
  Zap,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  ArrowLeftRight,
  ClipboardList,
  UploadCloud,
  FileText
} from 'lucide-react';
import AdminLayout from '../components/layout/AdminLayout';
import PartyCard from '../components/layout/PartyCard';
import { formatDate, toInputDate, parseRowDate, parseNumber, formatIndianAmount, cleanText, normalizeForMatch } from '../utils/helpers';
import { supabase } from '../utils/supabaseClient';
import { uploadImage } from '../utils/supabaseStorage';
import { loadImageAsBase64 } from '../utils/imageBase64';
import { TABLES, COLUMNS, ENUMS, DROPDOWN_CATEGORY, STORAGE_FOLDERS, withItemMaster } from '../utils/dbSchema';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Inventory = () => {
  const [activeTab, setActiveTab] = useState('issued'); // 'issued' or 'return'
  const [isTableLoading, setIsTableLoading] = useState(true);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isColMenuOpen, setIsColMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [isReportGenerating, setIsReportGenerating] = useState(false);
  const [showFullTotal, setShowFullTotal] = useState(false);

  // Data State
  const [items, setItems] = useState([]); // item_master catalog
  const [itemStockMap, setItemStockMap] = useState({}); // item_id -> inventory_current row
  const [issueHistory, setIssueHistory] = useState([]);
  const [returnHistory, setReturnHistory] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({
    issuerOptions: [],
    eventTimeOptions: []
  });
  const [showIssuerDropdown, setShowIssuerDropdown] = useState(false);
  const issuerDropdownRef = useRef(null);
  const [showReturnInvTypeDropdown, setShowReturnInvTypeDropdown] = useState(false);
  const returnInvTypeDropdownRef = useRef(null);
  const [showReturnItemDropdown, setShowReturnItemDropdown] = useState(false);
  const returnItemDropdownRef = useRef(null);
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const partyDropdownRef = useRef(null);
  const [lastReturnInfo, setLastReturnInfo] = useState({ date: '-', qty: '-' });
  const [filteredItems, setFilteredItems] = useState([]);

  // Filter States - Issued History
  const [issuedFilterItem, setIssuedFilterItem] = useState("");
  const [issuedFilterType, setIssuedFilterType] = useState("");
  const [issuedFilterParty, setIssuedFilterParty] = useState("");
  const [issuedStartDate, setIssuedStartDate] = useState("");
  const [issuedEndDate, setIssuedEndDate] = useState("");

  // Filter States - Return History
  const [returnFilterItem, setReturnFilterItem] = useState("");
  const [returnFilterType, setReturnFilterType] = useState("");
  const [returnFilterParty, setReturnFilterParty] = useState("");
  const [returnStartDate, setReturnStartDate] = useState("");
  const [returnEndDate, setReturnEndDate] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReturnId, setEditingReturnId] = useState(null);

  // Edit State
  const [editDataMap, setEditDataMap] = useState({}); // { [id]: rowObject }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedPartyCard, setSelectedPartyCard] = useState(null);
  const [generatingReportParty, setGeneratingReportParty] = useState(null);

  const uniquePartyOptions = useMemo(() => {
    return [...new Set(issueHistory.map(row => row.partyName).filter(Boolean))].sort();
  }, [issueHistory]);

  const handleSelectParty = (selectedParty) => {
    const latestRecord = issueHistory.find(row => row.partyName === selectedParty);
    if (latestRecord) {
      setIssueForm(p => ({
        ...p,
        partyName: selectedParty,
        eventDate: toInputDate(latestRecord.eventDate),
        foodName: latestRecord.venueName || '',
        eventTime: latestRecord.eventType || ''
      }));
    } else {
      setIssueForm(p => ({ ...p, partyName: selectedParty }));
    }
    setShowPartyDropdown(false);
  };

  // Form States
  const [issueForm, setIssueForm] = useState({
    forType: 'H3', issuer: '', itemId: '', inventoryType: '', department: '', itemsName: '', openingBalance: '', perUnit: '', unit: '', eventDate: '', partyName: '', eventTime: '', foodName: '', issueData: '', dishes: '', remarks: '', imageUrl: ''
  });
  // NOTE: `unit` here is a legacy name carried over from the original app —
  // in the Issue form it actually holds the Damage/Missing Rate value (maps
  // to issues.damage_rate on submit), not a unit of measure.

  const [returnForm, setReturnForm] = useState({
    itemId: '', inventoryType: '', department: '', itemsName: '', openingBalance: '', damageRate: '0', rentingRate: '0', totalCost: '0', partyName: '', eventDate: '', returnData: '0', returnDate: new Date().toISOString().split('T')[0], issueQty: '0', damageItems: '0', missingItems: '0', closingBalance: '', remarks: '', imageUrl: '', forType: ''
  });

  const returnInvTypeOptions = useMemo(() => {
    return [...new Set(items.map(i => i.inventory_type).filter(Boolean))].sort();
  }, [items]);

  const returnItemOptions = useMemo(() => {
    if (!returnForm.inventoryType) return [];
    return items
      .filter(i => i.inventory_type === returnForm.inventoryType && i.item_name)
      .map(i => i.item_name)
      .sort();
  }, [items, returnForm.inventoryType]);

  const [matchingIssuedRows, setMatchingIssuedRows] = useState([]);

  // Column Visibility & Config — keys map directly to fields on the mapped
  // issue/return row objects (see fetchHistory below), not sheet indices.
  const [visibleColumns, setVisibleColumns] = useState({
    date: true,
    serial: true,
    type: true,
    item: true,
    qty: true,
    party: true,
    eventDate: true,
    eventType: true,
    estimatedCost: true,
    returnDate: true,
    damage: true,
    missing: true,
    totalCost: true,
    image: true,
    for: true,
    dishes: true
  });

  const columnConfig = activeTab === 'issued' ? [
    { key: 'serial', label: 'Serial' },
    { key: 'type', label: 'Type' },
    { key: 'item', label: 'Item Name' },
    { key: 'qty', label: 'Issue Qty' },
    { key: 'image', label: 'Image' },
    { key: 'date', label: 'Date' },
    { key: 'for', label: 'For' },
    { key: 'party', label: 'Party Name' },
    { key: 'eventDate', label: 'Event Date' },
    { key: 'eventType', label: 'Event Type' },
    { key: 'estimatedCost', label: 'Estimated Cost' },
    { key: 'dishes', label: 'Dishes' }
  ] : [
    { key: 'serial', label: 'Serial' },
    { key: 'type', label: 'Type' },
    { key: 'item', label: 'Item Name' },
    { key: 'qty', label: 'Return Qty' },
    { key: 'image', label: 'Image' },
    { key: 'date', label: 'Date' },
    { key: 'for', label: 'For' },
    { key: 'party', label: 'Party Name' },
    { key: 'returnDate', label: 'Return Date' },
    { key: 'damage', label: 'Damage' },
    { key: 'missing', label: 'Missing' },
    { key: 'totalCost', label: 'Total Cost' },
    { key: 'actions', label: 'Actions' }
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (issuerDropdownRef.current && !issuerDropdownRef.current.contains(event.target)) {
        setShowIssuerDropdown(false);
      }
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target)) {
        setShowPartyDropdown(false);
      }
      if (returnInvTypeDropdownRef.current && !returnInvTypeDropdownRef.current.contains(event.target)) {
        setShowReturnInvTypeDropdown(false);
      }
      if (returnItemDropdownRef.current && !returnItemDropdownRef.current.contains(event.target)) {
        setShowReturnItemDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const getDisplayableImageUrl = (url) => {
    if (!url || url === 'No Image') return null;
    try {
      // Legacy Drive-hosted images render better as a thumbnail transform;
      // Supabase Storage URLs (current uploads) are used as-is.
      const match = url.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9\-_]{10,})/);
      if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
      return url;
    } catch { return url; }
  };

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
    const currentRows = activeTab === 'issued' ? issueHistory : returnHistory;
    const editableFields = activeTab === 'issued' ? ['qty'] : ['qty', 'damage', 'missing'];
    return Object.keys(editDataMap).filter(id => {
      const editRow = editDataMap[id];
      const originalRow = currentRows.find(r => r.id === id);
      if (!originalRow) return false;
      return editableFields.some(f => String(editRow[f] ?? '') !== String(originalRow[f] ?? ''));
    }).length;
  }, [editDataMap, issueHistory, returnHistory, activeTab]);

  const handleBatchSubmit = async () => {
    setIsSubmitting(true);
    try {
      const table = activeTab === 'issued' ? TABLES.ISSUES : TABLES.RETURNS;
      const results = await Promise.all(Object.entries(editDataMap).map(([id, row]) => {
        const payload = activeTab === 'issued'
          ? { issue_qty: parseFloat(row.qty) || 0 }
          : { return_qty: parseFloat(row.qty) || 0, damage_qty: parseFloat(row.damage) || 0, missing_qty: parseFloat(row.missing) || 0 };
        return supabase.from(table).update(payload).eq(COLUMNS.ISSUES.ID, id);
      }));
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw new Error(failed[0].error.message);

      showToast(`${results.length} record(s) updated successfully`);
      setEditDataMap({});
      setSelectedIds(new Set());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      fetchHistory();
      setIsSubmitting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected record(s)?`)) return;

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    const table = activeTab === 'issued' ? TABLES.ISSUES : TABLES.RETURNS;

    try {
      for (const id of selectedIds) {
        const { error } = await supabase.from(table).delete().eq(COLUMNS.ISSUES.ID, id);
        if (error) failCount++; else successCount++;
      }

      if (successCount > 0) showToast(`Successfully deleted ${successCount} record(s)`);
      if (failCount > 0) showToast(`Failed to delete ${failCount} record(s)`, 'error');

      setSelectedIds(new Set());
      setEditDataMap({});
      fetchHistory();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  const fetchInitialData = async () => {
    try {
      const [itemsRes, dropdownRes] = await Promise.all([
        supabase.from(TABLES.ITEM_MASTER).select('*').order(COLUMNS.ITEM_MASTER.ITEM_NAME),
        supabase.from(TABLES.DROPDOWN_OPTIONS).select('*')
      ]);
      if (itemsRes.error) throw itemsRes.error;
      setItems(itemsRes.data || []);

      if (!dropdownRes.error) {
        const rows = dropdownRes.data || [];
        setDropdownOptions({
          issuerOptions: rows.filter(r => r.category === DROPDOWN_CATEGORY.ISSUER).map(r => r.value).sort(),
          eventTimeOptions: rows.filter(r => r.category === DROPDOWN_CATEGORY.EVENT_TYPE).map(r => r.value).sort()
        });
      }

      const { data: stockRows, error: stockError } = await supabase
        .from(TABLES.INVENTORY_CURRENT)
        .select(`${COLUMNS.INVENTORY_CURRENT.ITEM_ID}, ${COLUMNS.INVENTORY_CURRENT.CURRENT_STOCK}, ${COLUMNS.INVENTORY_CURRENT.IMAGE_URL}`);
      if (!stockError) {
        const map = {};
        (stockRows || []).forEach(r => { map[r.item_id] = r; });
        setItemStockMap(map);
      }
    } catch {
      showToast('Failed to load initial data', 'error');
    }
  };

  const fetchHistory = async () => {
    setIsTableLoading(true);
    try {
      const [issuesRes, returnsRes] = await Promise.all([
        supabase.from(TABLES.ISSUES)
          .select(`*, ${withItemMaster('item_name, inventory_type, department')}`)
          .order(COLUMNS.ISSUES.CREATED_AT, { ascending: false })
          .range(0, 4999),
        supabase.from(TABLES.RETURNS)
          .select(`*, ${withItemMaster('item_name, inventory_type, department')}`)
          .order(COLUMNS.RETURNS.CREATED_AT, { ascending: false })
          .range(0, 4999)
      ]);

      if (!issuesRes.error) {
        setIssueHistory((issuesRes.data || []).map(row => ({
          id: row.id,
          serial: row.serial_no,
          itemId: row.item_id,
          inventoryType: row.item_master?.inventory_type,
          department: row.item_master?.department,
          itemName: row.item_master?.item_name,
          partyName: row.party_name,
          eventDate: row.event_date,
          qty: row.issue_qty,
          damageRate: row.damage_rate,
          rentingRate: row.renting_rate,
          openingBalance: row.opening_balance,
          closingBalance: row.closing_balance,
          venueName: row.venue_name,
          imageUrl: row.image_url,
          remarks: row.remarks,
          eventType: row.event_type,
          estimatedCost: row.estimated_cost,
          forType: row.for_type,
          issuer: row.issuer,
          dishes: row.dishes,
          createdAt: row.created_at
        })));
      }

      if (!returnsRes.error) {
        setReturnHistory((returnsRes.data || []).map(row => ({
          id: row.id,
          serial: row.serial_no,
          itemId: row.item_id,
          inventoryType: row.item_master?.inventory_type,
          department: row.item_master?.department,
          itemName: row.item_master?.item_name,
          partyName: row.party_name,
          eventDate: row.event_date,
          returnDate: row.return_date,
          issueQty: row.issue_qty,
          qty: row.return_qty,
          damage: row.damage_qty,
          missing: row.missing_qty,
          damageRate: row.damage_rate,
          rentingRate: row.renting_rate,
          openingBalance: row.opening_balance,
          closingBalance: row.closing_balance,
          totalBalance: row.total_balance,
          imageUrl: row.image_url,
          remarks: row.remarks,
          totalCost: row.total_cost,
          forType: row.for_type,
          createdAt: row.created_at
        })));
      }
    } finally {
      setIsTableLoading(false);
    }
  };

  const handleGeneratePartyReport = (partyName, rows) => {
    const reportColumns = [
      { header: 'S.No.', dataKey: 'sNo' },
      { header: 'Item Name', dataKey: 'item' },
      { header: 'Qty', dataKey: 'qty' },
      { header: 'Image', dataKey: 'image' },
      { header: 'Dishes', dataKey: 'dishes' },
      { header: 'Remarks', dataKey: 'remark' }
    ];

    setGeneratingReportParty(partyName);
    setIsReportGenerating(true);

    setTimeout(async () => {
      try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const marginOffset = 12;
        const availableWidth = pageWidth - marginOffset;
        const colStyles = {
          sNo: { cellWidth: 15 },
          item: { cellWidth: 50 },
          qty: { cellWidth: 15 },
          image: { cellWidth: 25 },
          dishes: { cellWidth: 43 },
          remark: { cellWidth: availableWidth - (15 + 50 + 15 + 25 + 43) }
        };

        const imageMap = {};
        const imageList = [...new Set(rows.map(row => row.imageUrl).filter(url => url && url !== 'No Image'))];
        const results = await Promise.all(imageList.map(async (url) => ({ url, b64: await loadImageAsBase64(url) })));
        results.forEach(({ url, b64 }) => { if (b64) imageMap[url] = b64; });

        const body = rows.map((row, index) => ({
          sNo: index + 1,
          item: row.itemName || '-',
          qty: row.qty || '0',
          image: row.imageUrl && row.imageUrl !== 'No Image' ? row.imageUrl : '',
          dishes: row.dishes || '-',
          remark: ''
        }));

        doc.setFontSize(16);
        doc.setTextColor(109, 40, 217);
        doc.setFont(undefined, 'bold');
        doc.text("ISSUED HISTORY REPORT", 14, 12);

        const titleWidth = doc.getTextWidth("ISSUED HISTORY REPORT ");
        doc.setFontSize(12);
        doc.setTextColor(150, 150, 150);
        doc.setFont(undefined, 'normal');
        doc.text(`(${rows.length})`, 14 + titleWidth, 12);

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        const formattedGenDate = new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        doc.text(`Generated on: ${formattedGenDate}`, pageWidth - 14, 12, { align: 'right' });

        const drawLabelValue = (label, value, x, y) => {
          doc.setFont(undefined, 'bold');
          doc.setTextColor(50, 50, 50);
          doc.text(label, x, y);
          const labelWidth = doc.getTextWidth(label);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(80, 80, 80);
          doc.text(value, x + labelWidth, y);
        };

        doc.setFontSize(10);
        drawLabelValue("Date: ", formatDate(rows[0].createdAt), 14, 18);
        drawLabelValue("For: ", rows[0].forType || '-', 65, 18);
        drawLabelValue("Party: ", partyName, 14, 24);
        drawLabelValue("Event-Date: ", formatDate(rows[0].eventDate), 65, 24);

        autoTable(doc, {
          startY: 30,
          columns: reportColumns,
          body: body,
          theme: 'grid',
          columnStyles: colStyles,
          headStyles: {
            fillColor: [109, 40, 217],
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3
          },
          styles: {
            fontSize: 9,
            cellPadding: 2.5,
            halign: 'center',
            valign: 'middle',
            overflow: 'ellipsize',
            minCellHeight: 14
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          rowPageBreak: 'avoid',
          margin: { top: 14, right: 6, bottom: 20, left: 6 },
          willDrawCell: (data) => {
            if (data.column.dataKey === 'image' && data.cell.section === 'body') {
              data.cell.text = [];
            }
          },
          didDrawCell: (data) => {
            if (data.column.dataKey === 'image' && data.cell.section === 'body') {
              const url = data.cell.raw;
              const b64 = imageMap[url];
              if (b64) {
                const padding = 1.5;
                const imgSize = Math.min(data.cell.width - padding * 2, data.cell.height - padding * 2, 10);
                const x = data.cell.x + (data.cell.width - imgSize) / 2;
                const y = data.cell.y + (data.cell.height - imgSize) / 2;
                try {
                  doc.addImage(b64, 'JPEG', x, y, imgSize, imgSize);
                } catch {
                  // ignore image render errors
                }
              }
            }
          },
          didDrawPage: function () {
            const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
            doc.setFontSize(10);
            doc.setTextColor(120);
            doc.text(
              `Page ${pageNumber} of {total_pages_count_string}`,
              doc.internal.pageSize.width - 6,
              doc.internal.pageSize.height - 8,
              { align: 'right' }
            );
          }
        });

        if (typeof doc.putTotalPages === 'function') {
          doc.putTotalPages('{total_pages_count_string}');
        }

        doc.save(`${partyName}_Issue_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Report generated successfully');
      } catch {
        showToast('Failed to generate report', 'error');
      } finally {
        setIsReportGenerating(false);
        setGeneratingReportParty(null);
      }
    }, 100);
  };

  useEffect(() => {
    setSelectedPartyCard(null);
  }, [activeTab, issuedFilterItem, issuedFilterType, issuedFilterParty, issuedStartDate, issuedEndDate, searchTerm]);

  useEffect(() => { fetchInitialData(); fetchHistory(); }, []);

  useEffect(() => {
    const currentType = isIssueModalOpen ? issueForm.inventoryType : returnForm.inventoryType;
    if (currentType) {
      const uniqueItems = [...new Set(items.filter(i => i.inventory_type === currentType).map(i => i.item_name))].filter(Boolean);
      setFilteredItems(uniqueItems);
    } else { setFilteredItems([]); }
  }, [issueForm.inventoryType, returnForm.inventoryType, items, isIssueModalOpen, isReturnModalOpen]);

  // Derive Options for Filters
  const issuedOptions = useMemo(() => {
    const filteredByItem = issueHistory.filter(r => (!issuedFilterType || r.inventoryType === issuedFilterType) && (!issuedFilterParty || r.partyName === issuedFilterParty));
    const filteredByType = issueHistory.filter(r => (!issuedFilterItem || r.itemName === issuedFilterItem) && (!issuedFilterParty || r.partyName === issuedFilterParty));
    const filteredByParty = issueHistory.filter(r => (!issuedFilterItem || r.itemName === issuedFilterItem) && (!issuedFilterType || r.inventoryType === issuedFilterType));

    return {
      items: [...new Set(filteredByItem.map(r => r.itemName).filter(Boolean))].sort(),
      types: [...new Set(filteredByType.map(r => r.inventoryType).filter(Boolean))].sort(),
      parties: [...new Set(filteredByParty.map(r => r.partyName).filter(Boolean))].sort(),
    };
  }, [issueHistory, issuedFilterItem, issuedFilterType, issuedFilterParty]);

  const returnOptions = useMemo(() => {
    const filteredByItem = returnHistory.filter(r => (!returnFilterType || r.inventoryType === returnFilterType) && (!returnFilterParty || r.partyName === returnFilterParty));
    const filteredByType = returnHistory.filter(r => (!returnFilterItem || r.itemName === returnFilterItem) && (!returnFilterParty || r.partyName === returnFilterParty));
    const filteredByParty = returnHistory.filter(r => (!returnFilterItem || r.itemName === returnFilterItem) && (!returnFilterType || r.inventoryType === returnFilterType));

    return {
      items: [...new Set(filteredByItem.map(r => r.itemName).filter(Boolean))].sort(),
      types: [...new Set(filteredByType.map(r => r.inventoryType).filter(Boolean))].sort(),
      parties: [...new Set(filteredByParty.map(r => r.partyName).filter(Boolean))].sort(),
    };
  }, [returnHistory, returnFilterItem, returnFilterType, returnFilterParty]);

  const filteredIssuedHistory = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    return issueHistory.filter(row => {
      const matchesSearch = !s || [row.itemName, row.partyName, row.inventoryType, row.issuer].some(v => v && normalizeForMatch(v).includes(s));
      const matchesItem = !issuedFilterItem || row.itemName === issuedFilterItem;
      const matchesType = !issuedFilterType || row.inventoryType === issuedFilterType;
      const matchesParty = !issuedFilterParty || normalizeForMatch(row.partyName) === normalizeForMatch(issuedFilterParty);
      let matchesDate = true;
      if (issuedStartDate || issuedEndDate) {
        const rowDate = parseRowDate(row.eventDate);
        if (!rowDate || isNaN(rowDate)) return true;
        if (issuedStartDate && rowDate < new Date(issuedStartDate)) matchesDate = false;
        if (issuedEndDate) {
          const end = new Date(issuedEndDate);
          end.setHours(23, 59, 59, 999);
          if (rowDate > end) matchesDate = false;
        }
      }
      return matchesSearch && matchesItem && matchesType && matchesParty && matchesDate;
    });
  }, [issueHistory, searchTerm, issuedFilterItem, issuedFilterType, issuedFilterParty, issuedStartDate, issuedEndDate]);

  const shouldGroup = activeTab === 'issued' && !(issuedFilterItem || issuedFilterType || issuedFilterParty || issuedStartDate || issuedEndDate || searchTerm);

  const groupedIssuedData = useMemo(() => {
    if (!shouldGroup) return [];
    const groups = {};
    issueHistory.forEach(row => {
      const party = row.partyName || 'Unknown';
      if (!groups[party]) groups[party] = [];
      groups[party].push(row);
    });
    return Object.entries(groups).map(([party, rows]) => {
      const latestRow = rows[0];
      const latestDate = latestRow ? latestRow.eventDate : '';
      const totalQty = rows.reduce((sum, r) => sum + parseNumber(r.qty), 0);
      const totalCost = rows.reduce((sum, r) => sum + parseNumber(r.estimatedCost), 0);
      return { partyName: party, latestDate, totalQty, totalCost, rows };
    });
  }, [issueHistory, shouldGroup]);

  const filteredReturnHistory = useMemo(() => {
    const s = normalizeForMatch(searchTerm);
    return returnHistory.filter(row => {
      const matchesSearch = !s || [row.itemName, row.partyName, row.inventoryType].some(v => v && normalizeForMatch(v).includes(s));
      const matchesItem = !returnFilterItem || row.itemName === returnFilterItem;
      const matchesType = !returnFilterType || row.inventoryType === returnFilterType;
      const matchesParty = !returnFilterParty || normalizeForMatch(row.partyName) === normalizeForMatch(returnFilterParty);
      let matchesDate = true;
      if (returnStartDate || returnEndDate) {
        const rowDate = parseRowDate(row.eventDate);
        if (!rowDate || isNaN(rowDate)) return true;
        if (returnStartDate && rowDate < new Date(returnStartDate)) matchesDate = false;
        if (returnEndDate) {
          const end = new Date(returnEndDate);
          end.setHours(23, 59, 59, 999);
          if (rowDate > end) matchesDate = false;
        }
      }
      return matchesSearch && matchesItem && matchesType && matchesParty && matchesDate;
    });
  }, [returnHistory, searchTerm, returnFilterItem, returnFilterType, returnFilterParty, returnStartDate, returnEndDate]);

  const totalInventoryCost = useMemo(() => {
    const data = activeTab === 'issued' ? filteredIssuedHistory : filteredReturnHistory;
    return data.reduce((sum, row) => {
      const val = parseFloat((activeTab === 'issued' ? row.estimatedCost : row.totalCost) || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [activeTab, filteredIssuedHistory, filteredReturnHistory]);

  const validationState = useMemo(() => {
    if (!issueForm.itemsName || !issueForm.eventDate) return { remaining: 0, isOver: false, committed: 0 };

    const selectedItem = normalizeForMatch(issueForm.itemsName);
    const selectedDate = issueForm.eventDate;
    const masterStock = Number(issueForm.openingBalance) || 0;
    const currentQty = Number(issueForm.issueData) || 0;
    const currentParty = normalizeForMatch(issueForm.partyName);
    const currentVenue = normalizeForMatch(issueForm.foodName);
    const currentSlot = normalizeForMatch(issueForm.eventTime || 'Regular');
    const currentKey = `${currentParty}|${currentVenue}`;

    const partyVenueMap = {};
    issueHistory.forEach(row => {
      const rowItem = normalizeForMatch(row.itemName);
      const rowDate = toInputDate(row.eventDate);

      if (rowItem === selectedItem && rowDate === selectedDate) {
        const p = normalizeForMatch(row.partyName);
        const v = normalizeForMatch(row.venueName);
        const s = normalizeForMatch(row.eventType || 'Regular');
        const q = Number(row.qty || 0);

        const key = `${p}|${v}`;
        if (!partyVenueMap[key]) partyVenueMap[key] = {};
        partyVenueMap[key][s] = (partyVenueMap[key][s] || 0) + q;
      }
    });

    const groupPeaks = {};
    Object.entries(partyVenueMap).forEach(([key, slots]) => {
      groupPeaks[key] = Math.max(...Object.values(slots), 0);
    });

    let committedByOthers = 0;
    Object.keys(groupPeaks).forEach(key => {
      if (key !== currentKey) committedByOthers += groupPeaks[key];
    });

    const slotsInCurrent = partyVenueMap[currentKey] || {};
    const sumInCurrentSlot = (slotsInCurrent[currentSlot] || 0) + currentQty;
    const otherSlotsInCurrent = Object.entries(slotsInCurrent)
      .filter(([s]) => s !== currentSlot)
      .map(entry => entry[1]);

    const currentGroupPotentialPeak = Math.max(sumInCurrentSlot, ...otherSlotsInCurrent, 0);
    const totalPotential = committedByOthers + currentGroupPotentialPeak;
    const isOver = totalPotential > masterStock;
    const totalCommittedRightNow = Object.values(groupPeaks).reduce((a, b) => a + b, 0);

    return {
      remaining: Math.max(0, masterStock - totalCommittedRightNow),
      isOver,
      committed: totalCommittedRightNow,
      availableForThisGroup: masterStock - committedByOthers
    };
  }, [issueHistory, issueForm.itemsName, issueForm.eventDate, issueForm.partyName, issueForm.foodName, issueForm.eventTime, issueForm.issueData, issueForm.openingBalance]);

  // Auto-calculate Return Qty and Total Cost
  useEffect(() => {
    if (!isReturnModalOpen) return;
    const issueQty = Number(returnForm.issueQty || 0);
    const damage = Number(returnForm.damageItems || 0);
    const missing = Number(returnForm.missingItems || 0);
    const damageRate = Number(returnForm.damageRate || 0);
    const rentingRate = Number(returnForm.rentingRate || 0);

    const returnQty = Math.max(0, issueQty - damage - missing);
    const totalCost = ((damage + missing) * damageRate) + (returnQty * rentingRate);

    setReturnForm(prev => {
      if (prev.returnData === returnQty.toString() && prev.totalCost === totalCost.toFixed(2)) return prev;
      return { ...prev, returnData: returnQty.toString(), totalCost: totalCost.toFixed(2) };
    });
  }, [returnForm.issueQty, returnForm.damageItems, returnForm.missingItems, returnForm.damageRate, returnForm.rentingRate, isReturnModalOpen]);

  const handleSelectReturnItem = (itemName) => {
    const item = items.find(i => normalizeForMatch(i.item_name) === normalizeForMatch(itemName) && i.inventory_type === returnForm.inventoryType);
    const openingStock = item ? (itemStockMap[item.id]?.current_stock ?? 0) : 0;
    const stock = item ? itemStockMap[item.id] : null;
    // Default to the item's existing photo — only a genuinely new upload
    // replaces it, avoiding a duplicate copy of the same image per return.
    const existingImage = item ? (item.image_url || stock?.image_url || '') : '';

    setReturnForm(prev => ({
      ...prev,
      itemId: item ? item.id : '',
      itemsName: itemName,
      department: item ? item.department : '',
      openingBalance: openingStock.toString(),
      closingBalance: (openingStock - Number(prev.issueQty || 0)).toString(),
      damageRate: item ? String(item.damage_price ?? 0) : '0',
      rentingRate: prev.forType === 'H3' ? '0' : (item ? String(item.rental_price ?? 0) : '0'),
      imageUrl: existingImage
    }));
    if (existingImage) setImagePreview(getDisplayableImageUrl(existingImage));
  };

  useEffect(() => {
    if (!isReturnModalOpen || isEditing || !returnForm.itemsName) {
      if (!isEditing && !returnForm.itemsName) {
        setMatchingIssuedRows([]);
        setLastReturnInfo({ date: '-', qty: '-' });
      }
      return;
    }

    const selectedItem = returnForm.itemsName;
    const currentReturnDateStr = returnForm.returnDate;
    if (!currentReturnDateStr) return;

    const itemReturns = returnHistory.filter(row => row.itemName === selectedItem);
    let lastReturnDate = new Date('1970-01-01');
    let latestReturnRow = null;

    itemReturns.forEach(row => {
      const rDateStr = toInputDate(row.returnDate);
      if (rDateStr) {
        const d = new Date(rDateStr);
        if (!isNaN(d) && d > lastReturnDate) {
          lastReturnDate = d;
          latestReturnRow = row;
        }
      }
    });

    if (latestReturnRow) {
      setLastReturnInfo({
        date: formatDate(latestReturnRow.returnDate),
        qty: latestReturnRow.qty || '0'
      });
    } else {
      setLastReturnInfo({ date: 'No return history', qty: '0' });
    }

    const returnDate = new Date(currentReturnDateStr);
    const yesterday = new Date(returnDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const matchingIssues = issueHistory.filter(row => {
      if (row.itemName !== selectedItem) return false;
      const eventDateStr = toInputDate(row.eventDate);
      if (!eventDateStr) return false;
      const eventDate = new Date(eventDateStr);
      if (isNaN(eventDate)) return false;
      return eventDate > lastReturnDate && eventDate <= yesterday;
    });

    matchingIssues.sort((a, b) => new Date(toInputDate(a.eventDate)) - new Date(toInputDate(b.eventDate)));

    setMatchingIssuedRows(matchingIssues);

    const maxQty = matchingIssues.length > 0
      ? Math.max(...matchingIssues.map(row => parseNumber(row.qty)))
      : 0;

    const latestIssue = matchingIssues[matchingIssues.length - 1];
    const chainForType = latestIssue ? (latestIssue.forType || 'Rent') : 'Rent';
    const item = items.find(i => normalizeForMatch(i.item_name) === normalizeForMatch(selectedItem));
    const rentingRate = chainForType === 'H3' ? 0 : (item ? parseNumber(item.rental_price) : 0);

    setReturnForm(prev => {
      const openingStock = Number(prev.openingBalance || 0);
      const newClosingBalance = (openingStock - maxQty).toString();

      if (
        prev.issueQty === maxQty.toString() &&
        prev.forType === chainForType &&
        prev.rentingRate === rentingRate.toString() &&
        prev.closingBalance === newClosingBalance
      ) return prev;

      return {
        ...prev,
        issueQty: maxQty.toString(),
        forType: chainForType,
        rentingRate: rentingRate.toString(),
        closingBalance: newClosingBalance
      };
    });
  }, [isReturnModalOpen, isEditing, returnForm.itemsName, returnForm.inventoryType, returnForm.returnDate, issueHistory, returnHistory, items, itemStockMap]);

  const handleIssueSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    try {
      if (validationState.isOver) {
        showToast(`Error: Exceeds available stock for this date (Limit: ${validationState.availableForThisGroup})`, 'error');
        setIsSubmitting(false);
        return;
      }
      if (!issueForm.itemId) {
        showToast('Select an item first.', 'error');
        setIsSubmitting(false);
        return;
      }

      const imageUrl = selectedImage ? await uploadImage(selectedImage, STORAGE_FOLDERS.ISSUE_RETURN_IMAGES) : (issueForm.imageUrl || null);
      const opening = parseFloat(issueForm.openingBalance) || 0;
      const consumed = parseFloat(issueForm.issueData) || 0;
      const closing = opening - consumed;

      const { error } = await supabase.from(TABLES.ISSUES).insert({
        item_id: issueForm.itemId,
        party_name: cleanText(issueForm.partyName) || null,
        event_date: issueForm.eventDate || null,
        issue_qty: consumed,
        damage_rate: parseFloat(issueForm.unit) || 0,
        renting_rate: parseFloat(issueForm.perUnit) || 0,
        opening_balance: opening,
        closing_balance: closing,
        venue_name: cleanText(issueForm.foodName) || null,
        image_url: imageUrl,
        remarks: cleanText(issueForm.remarks) || null,
        event_type: cleanText(issueForm.eventTime) || null,
        for_type: issueForm.forType || ENUMS.FOR_TYPE.RENT,
        issuer: cleanText(issueForm.issuer) || null,
        dishes: cleanText(issueForm.dishes) || null
      });
      if (error) throw new Error(error.message);

      showToast('Issue recorded successfully');
      setIsIssueModalOpen(false);
      setIssueForm({ forType: 'H3', issuer: '', itemId: '', inventoryType: '', department: '', itemsName: '', openingBalance: '', perUnit: '', unit: '', eventDate: '', partyName: '', eventTime: '', foodName: '', issueData: '', dishes: '', remarks: '', imageUrl: '' });
      setSelectedImage(null); setImagePreview(null);
    } catch (err) {
      showToast(err.message || 'Failed to submit', 'error');
    } finally {
      fetchHistory();
      setIsSubmitting(false);
    }
  };

  const handleEditReturn = (row) => {
    setReturnForm({
      itemId: row.itemId,
      inventoryType: row.inventoryType,
      department: row.department,
      itemsName: row.itemName,
      partyName: row.partyName,
      eventDate: toInputDate(row.eventDate),
      returnDate: toInputDate(row.returnDate),
      issueQty: row.issueQty,
      returnData: row.qty,
      damageItems: row.damage,
      missingItems: row.missing,
      damageRate: row.damageRate,
      rentingRate: row.rentingRate,
      openingBalance: row.openingBalance,
      closingBalance: row.closingBalance,
      remarks: row.remarks,
      imageUrl: row.imageUrl,
      totalCost: row.totalCost || '0',
      forType: row.forType || ''
    });
    setEditingReturnId(row.id); setIsEditing(true); setIsReturnModalOpen(true); setImagePreview(getDisplayableImageUrl(row.imageUrl));
  };

  const handleReturnSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!isEditing && !returnForm.itemId) {
        showToast('Select an item first.', 'error');
        setIsSubmitting(false);
        return;
      }

      const imageUrl = selectedImage ? await uploadImage(selectedImage, STORAGE_FOLDERS.ISSUE_RETURN_IMAGES) : (returnForm.imageUrl || null);
      const totalBalance = Number(returnForm.closingBalance || 0) + Number(returnForm.returnData || 0) - Number(returnForm.damageItems || 0) - Number(returnForm.missingItems || 0);

      const payload = {
        party_name: cleanText(returnForm.partyName) || null,
        return_date: returnForm.returnDate || null,
        issue_qty: parseFloat(returnForm.issueQty) || 0,
        return_qty: parseFloat(returnForm.returnData) || 0,
        damage_qty: parseFloat(returnForm.damageItems) || 0,
        missing_qty: parseFloat(returnForm.missingItems) || 0,
        damage_rate: parseFloat(returnForm.damageRate) || 0,
        renting_rate: parseFloat(returnForm.rentingRate) || 0,
        opening_balance: parseFloat(returnForm.openingBalance) || 0,
        closing_balance: parseFloat(returnForm.closingBalance) || 0,
        total_balance: totalBalance,
        image_url: imageUrl,
        remarks: cleanText(returnForm.remarks) || null,
        for_type: returnForm.forType || null
      };

      if (isEditing) {
        payload.event_date = returnForm.eventDate || null;
        const { error } = await supabase.from(TABLES.RETURNS).update(payload).eq(COLUMNS.RETURNS.ID, editingReturnId);
        if (error) throw new Error(error.message);
      } else {
        payload.item_id = returnForm.itemId;
        const { error } = await supabase.from(TABLES.RETURNS).insert(payload);
        if (error) throw new Error(error.message);
      }

      showToast(isEditing ? 'Record updated successfully' : 'Return recorded successfully');
      setIsReturnModalOpen(false); setIsEditing(false); setEditingReturnId(null);
      setReturnForm({ itemId: '', inventoryType: '', itemsName: '', department: '', openingBalance: '', damageRate: '', rentingRate: '', totalCost: '', partyName: '', eventDate: '', returnData: '', returnDate: new Date().toISOString().split('T')[0], issueQty: '', damageItems: '0', missingItems: '0', closingBalance: '', remarks: '', imageUrl: '', forType: '' });
      setSelectedImage(null); setImagePreview(null);
    } catch (err) {
      showToast(err.message || 'Failed to submit', 'error');
    } finally {
      fetchHistory();
      setIsSubmitting(false);
    }
  };

  const getFilteredHistory = () => activeTab === 'issued' ? filteredIssuedHistory : filteredReturnHistory;

  const handleGenerateReport = () => {
    const isIssued = activeTab === 'issued';
    const sourceData = isIssued ? issueHistory : returnHistory;

    const filteredReportData = sourceData.filter(row => {
      if (isIssued) {
        if (shouldGroup && selectedPartyCard) return row.partyName === selectedPartyCard;
        const matchesItem = !issuedFilterItem || row.itemName === issuedFilterItem;
        const matchesType = !issuedFilterType || row.inventoryType === issuedFilterType;
        const matchesParty = !issuedFilterParty || row.partyName === issuedFilterParty;
        let matchesDate = true;
        if (issuedStartDate || issuedEndDate) {
          const rowDate = parseRowDate(row.eventDate);
          if (!rowDate || isNaN(rowDate)) return true;
          if (issuedStartDate && rowDate < new Date(issuedStartDate)) matchesDate = false;
          if (issuedEndDate) {
            const end = new Date(issuedEndDate);
            end.setHours(23, 59, 59, 999);
            if (rowDate > end) matchesDate = false;
          }
        }
        return matchesItem && matchesType && matchesParty && matchesDate;
      } else {
        const matchesItem = !returnFilterItem || row.itemName === returnFilterItem;
        const matchesType = !returnFilterType || row.inventoryType === returnFilterType;
        const matchesParty = !returnFilterParty || row.partyName === returnFilterParty;
        let matchesDate = true;
        if (returnStartDate || returnEndDate) {
          const rowDate = parseRowDate(row.eventDate);
          if (!rowDate || isNaN(rowDate)) return true;
          if (returnStartDate && rowDate < new Date(returnStartDate)) matchesDate = false;
          if (returnEndDate) {
            const end = new Date(returnEndDate);
            end.setHours(23, 59, 59, 999);
            if (rowDate > end) matchesDate = false;
          }
        }
        return matchesItem && matchesType && matchesParty && matchesDate;
      }
    });

    if (filteredReportData.length === 0) {
      showToast('No records to export', 'info');
      return;
    }

    const firstRow = filteredReportData[0];
    const commonDateRaw = firstRow.createdAt;
    const commonParty = firstRow.partyName;
    const commonFor = firstRow.forType;
    const commonEventDateRaw = isIssued ? firstRow.eventDate : null;

    const mismatchFields = [];
    if (filteredReportData.some(row => formatDate(row.createdAt) !== formatDate(commonDateRaw))) mismatchFields.push('Date');
    if (filteredReportData.some(row => row.partyName !== commonParty)) mismatchFields.push('Party Name');
    if (filteredReportData.some(row => row.forType !== commonFor)) mismatchFields.push('For');
    if (isIssued && filteredReportData.some(row => formatDate(row.eventDate) !== formatDate(commonEventDateRaw))) mismatchFields.push('Event Date');

    let uniformInfo = null;
    if (mismatchFields.length > 0) {
      const confirmPrint = window.confirm(`The data for the fields: ${mismatchFields.join(', ')} are different. Do you still want to print the PDF?`);
      if (!confirmPrint) return;
    } else {
      uniformInfo = { date: commonDateRaw, party: commonParty, for: commonFor, eventDate: commonEventDateRaw };
    }

    const columnsToInclude = columnConfig.filter(col => visibleColumns[col.key] !== false && col.key !== 'actions');

    const reportColumns = [
      { header: 'S. No.', dataKey: 'sNo' },
      ...columnsToInclude.map(col => ({ header: col.label, dataKey: col.key })),
      { header: 'Remark', dataKey: 'remark' }
    ];

    const body = filteredReportData.map((row, index) => {
      const rowData = { sNo: index + 1 };
      columnsToInclude.forEach(col => {
        let val = row[col.key === 'type' ? 'inventoryType' : col.key === 'item' ? 'itemName' : col.key === 'party' ? 'partyName' : col.key === 'for' ? 'forType' : col.key === 'serial' ? 'serial' : col.key];
        if (col.key === 'image') {
          rowData[col.key] = val && val !== 'No Image' ? val : '';
        } else if (['date'].includes(col.key)) {
          rowData[col.key] = formatDate(row.createdAt);
        } else if (['eventDate', 'returnDate'].includes(col.key)) {
          rowData[col.key] = formatDate(val);
        } else if (['estimatedCost', 'totalCost'].includes(col.key)) {
          rowData[col.key] = `Rs ${parseFloat(val || 0).toFixed(2)}`;
        } else {
          rowData[col.key] = val || '-';
        }
      });
      rowData['remark'] = '';
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
          const uniqueUrls = [...new Set(filteredReportData.map(row => row.imageUrl).filter(url => url && url !== 'No Image'))];
          const results = await Promise.all(uniqueUrls.map(async (url) => ({ url, b64: await loadImageAsBase64(url) })));
          results.forEach(({ url, b64 }) => { if (b64) imageMap[url] = b64; });
        }

        const title = `${isIssued ? 'ISSUED' : 'RETURN'} HISTORY REPORT`;
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

        let currentY = 14;
        if (uniformInfo) {
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 60);
          doc.setFont(undefined, 'bold');

          const row1 = `Date: ${formatDate(uniformInfo.date)}    For: ${uniformInfo.for}`;
          const row2 = `Party: ${uniformInfo.party}${uniformInfo.eventDate ? `    Event-Date: ${formatDate(uniformInfo.eventDate)}` : ''}`;
          doc.text(row1, 14, 16);
          doc.text(row2, 14, 21);
          currentY = 28;
        }

        autoTable(doc, {
          startY: currentY,
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
                try { doc.addImage(b64, 'JPEG', x, y, imgSize, imgSize); } catch { /* ignore */ }
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

        doc.save(`${isIssued ? 'Issued' : 'Return'}_History_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Report generated successfully');
      } catch {
        showToast('Failed to generate report', 'error');
      } finally {
        setIsReportGenerating(false);
      }
    }, 100);
  };

  return (
    <AdminLayout>
      <div className="h-[calc(100vh-42px)] bg-[#f0f2f8] font-sans flex flex-col overflow-hidden">
        {toast.show && (
          <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-3xl shadow-2xl z-[200] transition-all duration-300 transform animate-in slide-in-from-right-8 ${toast.type === "success" ? "bg-violet-600 text-white shadow-violet-200" : "bg-red-600 text-white shadow-red-200"}`}>
            <div className="flex items-center gap-3 font-sans"><span className="text-[10px] font-black uppercase tracking-widest">{toast.message}</span></div>
          </div>
        )}

        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Inventory Management</h1>
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
                className={`h-10 px-6 rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg animate-in fade-in zoom-in-95 ${changedRowsCount > 0
                    ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-100"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit {changedRowsCount} {changedRowsCount === 1 ? 'Change' : 'Changes'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div
              onClick={() => setShowFullTotal(!showFullTotal)}
              className="flex items-center h-10 px-4 bg-emerald-600 text-white rounded-lg shadow-sm animate-in fade-in slide-in-from-right-4 duration-500 cursor-pointer hover:bg-emerald-700 transition-all select-none"
              title={showFullTotal ? "Click to see short format" : "Click to see exact amount"}
            >
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80 mr-3">
                {activeTab === 'issued' ? 'Issue Amount:' : 'Return Amount:'}
              </span>
              <span className="text-sm font-bold text-white">
                ₹{showFullTotal
                  ? totalInventoryCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : formatIndianAmount(totalInventoryCost)
                }
              </span>
            </div>
            <button onClick={() => { setIsIssueModalOpen(true); setImagePreview(null); setSelectedImage(null); }} className="h-10 px-5 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white rounded-lg flex items-center gap-2 text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-violet-100">
              <ClipboardList className="h-4 w-4 text-white/70" /> Issue Form
            </button>
            <button onClick={() => { setIsReturnModalOpen(true); setImagePreview(null); setSelectedImage(null); }} className="h-10 px-5 bg-white border border-fuchsia-200 text-fuchsia-600 rounded-lg flex items-center gap-2 text-sm font-semibold hover:bg-fuchsia-50 transition-all shadow-sm">
              <ArrowLeftRight className="h-4 w-4 text-fuchsia-400" /> Return Form
            </button>
            {activeTab === 'return' && (
              <button
                onClick={handleGenerateReport}
                disabled={isReportGenerating}
                className={`h-10 px-5 bg-gradient-to-r from-indigo-600 to-violet-500 text-white rounded-lg flex items-center gap-2 text-sm font-semibold transition-all shadow-lg shadow-indigo-100 ${isReportGenerating ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
              >
                {isReportGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-white/70" />}
                Return Report
              </button>
            )}
          </div>
        </div>

        <div className="mx-6 mb-6 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col flex-1 min-h-0 overflow-visible relative">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/50 rounded-t-xl">
            <div className="flex gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl shadow-inner-sm">
              <button onClick={() => setActiveTab('issued')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'issued' ? 'bg-white text-fuchsia-600 shadow-xl shadow-fuchsia-100/50 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Issued History</button>
              <button onClick={() => setActiveTab('return')} className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'return' ? 'bg-white text-fuchsia-600 shadow-xl shadow-fuchsia-100/50 scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>Return History</button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:bg-white w-40 transition-all" />
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                  {activeTab === 'issued' ? (
                    <>
                      <select value={issuedFilterParty} onChange={(e) => setIssuedFilterParty(e.target.value)} className="h-8 pl-2 pr-8 bg-white border border-slate-200/60 rounded-xl text-[10px] font-bold text-slate-600 appearance-none min-w-[90px] hover:border-fuchsia-200 transition-all cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d946ef' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}>
                        <option value="">All Party</option>
                        {issuedOptions.parties.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <select value={issuedFilterItem} onChange={(e) => setIssuedFilterItem(e.target.value)} className="h-8 pl-2 pr-8 bg-white border border-slate-200/60 rounded-xl text-[10px] font-bold text-slate-600 appearance-none min-w-[90px] hover:border-fuchsia-200 transition-all cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d946ef' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}>
                        <option value="">All Items</option>
                        {issuedOptions.items.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <select value={returnFilterParty} onChange={(e) => setReturnFilterParty(e.target.value)} className="h-8 pl-2 pr-8 bg-white border border-slate-200/60 rounded-xl text-[10px] font-bold text-slate-600 appearance-none min-w-[90px] hover:border-fuchsia-200 transition-all cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d946ef' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}>
                        <option value="">All Party</option>
                        {returnOptions.parties.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                      <select value={returnFilterItem} onChange={(e) => setReturnFilterItem(e.target.value)} className="h-8 pl-2 pr-8 bg-white border border-slate-200/60 rounded-xl text-[10px] font-bold text-slate-600 appearance-none min-w-[90px] hover:border-fuchsia-200 transition-all cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d946ef' stroke-width='3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px' }}>
                        <option value="">All Items</option>
                        {returnOptions.items.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </>
                  )}
                  <div className="relative border-l border-slate-200 ml-1 pl-1">
                    <button
                      onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
                      className={`h-8 px-3 rounded-xl border border-slate-100 flex items-center gap-2 text-[10px] font-bold tracking-wider transition-all ${isDateMenuOpen || (activeTab === 'issued' ? (issuedStartDate || issuedEndDate) : (returnStartDate || returnEndDate)) ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-200' : 'bg-slate-50 text-slate-600 hover:bg-white'}`}
                    >
                      <Calendar className={`h-3 w-3 ${isDateMenuOpen || (activeTab === 'issued' ? (issuedStartDate || issuedEndDate) : (returnStartDate || returnEndDate)) ? 'text-white' : 'text-slate-400'}`} />
                      <span>{activeTab === 'issued' ? (issuedStartDate || issuedEndDate ? `${issuedStartDate || '...'} - ${issuedEndDate || '...'}` : 'DATE') : (returnStartDate || returnEndDate ? `${returnStartDate || '...'} - ${returnEndDate || '...'}` : 'DATE')}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isDateMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDateMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-[140]" onClick={() => setIsDateMenuOpen(false)} />
                        <div className="absolute top-10 right-0 z-[160] w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeTab === 'issued' ? 'Issued History' : 'Return History'}</p>
                            {(activeTab === 'issued' ? (issuedStartDate || issuedEndDate) : (returnStartDate || returnEndDate)) && (
                              <button
                                onClick={() => { if (activeTab === 'issued') { setIssuedStartDate(""); setIssuedEndDate(""); } else { setReturnStartDate(""); setReturnEndDate(""); } }}
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
                                  value={activeTab === 'issued' ? issuedStartDate : returnStartDate}
                                  onChange={(e) => activeTab === 'issued' ? setIssuedStartDate(e.target.value) : setReturnStartDate(e.target.value)}
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
                                  value={activeTab === 'issued' ? issuedEndDate : returnEndDate}
                                  onChange={(e) => activeTab === 'issued' ? setIssuedEndDate(e.target.value) : setReturnEndDate(e.target.value)}
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

                  {((activeTab === 'issued' ? (issuedFilterItem || issuedFilterType || issuedFilterParty || issuedStartDate || issuedEndDate) : (returnFilterItem || returnFilterType || returnFilterParty || returnStartDate || returnEndDate)) || searchTerm) && (
                    <button
                      onClick={() => {
                        if (activeTab === 'issued') { setIssuedFilterItem(""); setIssuedFilterType(""); setIssuedFilterParty(""); setIssuedStartDate(""); setIssuedEndDate(""); }
                        else { setReturnFilterItem(""); setReturnFilterType(""); setReturnFilterParty(""); setReturnStartDate(""); setReturnEndDate(""); }
                        setSearchTerm("");
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
                <button onClick={() => setIsColMenuOpen(!isColMenuOpen)} className={`h-8 px-3 rounded-xl border border-slate-100 flex items-center gap-2 text-[10px] font-bold tracking-wider transition-all ${isColMenuOpen ? 'bg-violet-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-white'}`}>
                  <Settings2 className="h-3 w-3" /> Column <ChevronDown className={`h-3 w-3 transition-transform ${isColMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isColMenuOpen && (
                  <div className="absolute top-12 right-0 z-[100] w-48 bg-white border border-slate-100 rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-top-3">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility</p><button onClick={() => setIsColMenuOpen(false)}><X className="h-4 w-4 text-slate-300" /></button></div>
                    <div className="grid grid-cols-1 gap-1 max-h-[40vh] overflow-y-auto pr-1">
                      {columnConfig.filter(c => c.key !== 'actions').map(col => (
                        <button key={col.key} onClick={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))} className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all text-xs font-semibold ${visibleColumns[col.key] ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}>
                          <span>{col.label}</span> {visibleColumns[col.key] ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar relative">
            {activeTab === 'issued' && shouldGroup && !selectedPartyCard ? (
              isTableLoading ? (
                <div className="py-32 text-center flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Party Cards...</p>
                </div>
              ) : groupedIssuedData.length === 0 ? (
                <div className="py-32 text-center text-slate-350 flex flex-col items-center justify-center">
                  <Database className="h-16 w-16 mx-auto mb-4 opacity-20 text-slate-400" />
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">No records found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6 animate-in fade-in duration-300">
                  {groupedIssuedData.map((group, idx) => (
                    <PartyCard
                      key={idx}
                      partyName={group.partyName}
                      eventDate={group.latestDate}
                      totalQty={group.totalQty}
                      totalCost={group.totalCost}
                      isDownloading={generatingReportParty === group.partyName}
                      onDownloadReport={() => handleGeneratePartyReport(group.partyName, group.rows)}
                      onClick={() => setSelectedPartyCard(group.partyName)}
                    />
                  ))}
                </div>
              )
            ) : (
              <>
                {activeTab === 'issued' && shouldGroup && selectedPartyCard && (
                  <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100/80 sticky top-0 z-30 animate-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => setSelectedPartyCard(null)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold text-violet-600 border border-slate-200/50 hover:border-slate-200 transition-all select-none"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to Parties
                    </button>
                    <button
                      onClick={handleGenerateReport}
                      disabled={isReportGenerating}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-violet-100/50 hover:scale-[1.02] active:scale-95 select-none disabled:opacity-75"
                    >
                      {isReportGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Download Report
                    </button>
                    <span className="text-xs font-bold text-slate-500">
                      Showing records for: <strong className="text-slate-800">{selectedPartyCard}</strong>
                    </span>
                  </div>
                )}
                <table className="w-full text-center border-collapse border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-violet-50">
                      <th className="px-4 py-4 w-12 text-center bg-violet-50 border-b border-violet-100/50">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                          checked={
                            (activeTab === 'issued' && shouldGroup && selectedPartyCard)
                              ? (groupedIssuedData.find(g => g.partyName === selectedPartyCard)?.rows?.length > 0 && selectedIds.size === groupedIssuedData.find(g => g.partyName === selectedPartyCard)?.rows?.length)
                              : (getFilteredHistory().length > 0 && selectedIds.size === getFilteredHistory().length)
                          }
                          onChange={() =>
                            (activeTab === 'issued' && shouldGroup && selectedPartyCard)
                              ? handleSelectAll(groupedIssuedData.find(g => g.partyName === selectedPartyCard)?.rows || [])
                              : handleSelectAll(getFilteredHistory())
                          }
                        />
                      </th>
                      {columnConfig.map(col => visibleColumns[col.key] !== false && (
                        <th key={col.key} className={`px-6 py-4 text-[10px] font-bold text-violet-600 uppercase tracking-[0.15em] bg-violet-50 border-b border-violet-100/50 text-center ${['date', 'eventDate', 'returnDate'].includes(col.key) ? 'min-w-[120px]' : ''}`}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {isTableLoading ? (
                      <tr><td colSpan={columnConfig.length + 1} className="py-20 text-center"><div className="flex flex-col items-center gap-3"><Loader2 className="h-10 w-10 animate-spin text-violet-200" /><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Loading Records...</p></div></td></tr>
                    ) : getFilteredHistory().length === 0 ? (
                      <tr><td colSpan={columnConfig.length + 1} className="py-32 text-center text-slate-300"><Database className="h-12 w-12 mx-auto mb-4 opacity-10" /><p className="text-xs font-bold uppercase tracking-widest">No history found</p></td></tr>
                    ) : (activeTab === 'issued' && shouldGroup && selectedPartyCard) ? (
                      (() => {
                        const partyGroup = groupedIssuedData.find(g => g.partyName === selectedPartyCard);
                        const displayRows = partyGroup ? partyGroup.rows : [];
                        return displayRows.map((row) => {
                          const isSelected = selectedIds.has(row.id);
                          const currentData = editDataMap[row.id] || row;

                          return (
                            <tr key={row.id} className={`transition-all font-sans border-b border-slate-50 last:border-0 ${isSelected ? 'bg-violet-50/50' : 'hover:bg-slate-50/50'}`}>
                              <td className="px-4 py-3 text-center">
                                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer" checked={isSelected} onChange={() => toggleRowSelection(row)} />
                              </td>
                              {columnConfig.map(col => visibleColumns[col.key] !== false && (
                                <td key={col.key} className="px-4 py-3 text-xs font-semibold text-slate-600 text-center">
                                  {isSelected && col.key === 'qty' ? (
                                    <input type="number" value={currentData.qty} onChange={(e) => handleInlineEdit(row.id, 'qty', e.target.value)} className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
                                  ) : col.key === 'date' ? (
                                    <span className="text-slate-400 whitespace-nowrap">{formatDate(currentData.createdAt)}</span>
                                  ) : col.key === 'eventDate' ? (
                                    <span className="text-slate-400 whitespace-nowrap">{formatDate(currentData.eventDate)}</span>
                                  ) : col.key === 'item' ? (<span className="font-bold text-slate-800">{currentData.itemName}</span>
                                  ) : col.key === 'type' ? currentData.inventoryType || '-'
                                  : col.key === 'party' ? currentData.partyName || '-'
                                  : col.key === 'for' ? currentData.forType || '-'
                                  : col.key === 'eventType' ? currentData.eventType || '-'
                                  : col.key === 'dishes' ? currentData.dishes || '-'
                                  : col.key === 'estimatedCost' ? (<span className="font-bold text-emerald-600">₹{parseFloat(currentData.estimatedCost || 0).toFixed(2)}</span>
                                  ) : col.key === 'image' ? (
                                    currentData.imageUrl && currentData.imageUrl !== 'No Image' ? (
                                      <div className="relative flex justify-center group/img">
                                        <a href={currentData.imageUrl} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center bg-slate-50 group-hover:scale-110 transition-transform">
                                          <img src={getDisplayableImageUrl(currentData.imageUrl)} alt="Item" className="h-full w-full object-cover" />
                                        </a>
                                      </div>
                                    ) : <EyeOff className="h-4 w-4 opacity-10 mx-auto text-slate-200" />
                                  ) : currentData[col.key] || '-'}
                                </td>
                              ))}
                            </tr>
                          );
                        });
                      })()
                    ) : shouldGroup ? (
                      <tr><td colSpan={columnConfig.length + 1} className="py-20 text-center"><p className="text-xs font-bold uppercase tracking-widest text-slate-350">Choose a party card above</p></td></tr>
                    ) : (
                      getFilteredHistory().map((row) => {
                        const isSelected = selectedIds.has(row.id);
                        const currentData = editDataMap[row.id] || row;

                        return (
                          <tr key={row.id} className={`transition-all font-sans border-b border-slate-50 last:border-0 ${isSelected ? 'bg-violet-50/50' : 'hover:bg-slate-50/50'}`}>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer" checked={isSelected} onChange={() => toggleRowSelection(row)} />
                            </td>
                            {columnConfig.map(col => visibleColumns[col.key] !== false && (
                              <td key={col.key} className="px-4 py-3 text-xs font-semibold text-slate-600 text-center">
                                {isSelected && activeTab === 'issued' && col.key === 'qty' ? (
                                  <input type="number" value={currentData.qty} onChange={(e) => handleInlineEdit(row.id, 'qty', e.target.value)} className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
                                ) : isSelected && activeTab === 'return' && col.key === 'qty' ? (
                                  <input type="number" value={currentData.qty} onChange={(e) => handleInlineEdit(row.id, 'qty', e.target.value)} className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
                                ) : isSelected && activeTab === 'return' && col.key === 'damage' ? (
                                  <input type="number" value={currentData.damage} onChange={(e) => handleInlineEdit(row.id, 'damage', e.target.value)} className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
                                ) : isSelected && activeTab === 'return' && col.key === 'missing' ? (
                                  <input type="number" value={currentData.missing} onChange={(e) => handleInlineEdit(row.id, 'missing', e.target.value)} className="w-20 px-2 py-1 bg-white border border-violet-200 rounded text-center text-xs font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20" />
                                ) : col.key === 'actions' ? (
                                  <button onClick={() => handleEditReturn(currentData)} className="p-2 bg-slate-100 text-slate-400 hover:bg-violet-600 hover:text-white rounded-lg transition-all" title="Edit Record"><Settings2 className="h-4 w-4" /></button>
                                ) : col.key === 'date' ? (
                                  <span className="text-slate-400 whitespace-nowrap">{formatDate(currentData.createdAt)}</span>
                                ) : col.key === 'eventDate' || col.key === 'returnDate' ? (
                                  <span className="text-slate-400 whitespace-nowrap">{formatDate(currentData[col.key])}</span>
                                ) : col.key === 'damage' ? (<span className="text-red-500 font-bold">{currentData.damage}</span>
                                ) : col.key === 'missing' ? (<span className="text-orange-500 font-bold">{currentData.missing}</span>
                                ) : col.key === 'item' ? (<span className="font-bold text-slate-800">{currentData.itemName}</span>
                                ) : col.key === 'type' ? currentData.inventoryType || '-'
                                : col.key === 'party' ? currentData.partyName || '-'
                                : col.key === 'for' ? currentData.forType || '-'
                                : col.key === 'estimatedCost' ? (<span className="font-bold text-emerald-600">₹{parseFloat(currentData.estimatedCost || 0).toFixed(2)}</span>
                                ) : col.key === 'totalCost' ? (<span className="font-bold text-emerald-600">₹{parseFloat(currentData.totalCost || 0).toFixed(2)}</span>
                                ) : col.key === 'image' ? (
                                  currentData.imageUrl && currentData.imageUrl !== 'No Image' ? (
                                    <div className="relative flex justify-center group/img">
                                      <a href={currentData.imageUrl} target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center bg-slate-50 group-hover:scale-110 transition-transform">
                                        <img src={getDisplayableImageUrl(currentData.imageUrl)} alt="Item" className="h-full w-full object-cover" />
                                      </a>
                                    </div>
                                  ) : <EyeOff className="h-4 w-4 opacity-10 mx-auto text-slate-200" />
                                ) : currentData[col.key] || '-'}
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        {/* MODALS */}
        {(isIssueModalOpen || isReturnModalOpen) && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-sm bg-slate-900/40 animate-in fade-in duration-300">
            <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 bg-white">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${isIssueModalOpen ? 'bg-violet-100 text-violet-600' : 'bg-fuchsia-100 text-fuchsia-600'}`}>
                    {isIssueModalOpen ? <ClipboardList className="h-5 w-5" /> : <ArrowLeftRight className="h-5 w-5" />}
                  </div>
                  {isEditing ? 'Edit Return Record' : (isIssueModalOpen ? 'Issue Items to Party' : 'Return Items from Party')}
                </h2>
                <button onClick={() => { setIsIssueModalOpen(false); setIsReturnModalOpen(false); setIsEditing(false); }} className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-all font-sans"><X className="h-5 w-5" /></button>
              </div>

              <form onSubmit={isIssueModalOpen ? handleIssueSubmit : handleReturnSubmit} className="px-7 py-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar font-sans">

                {isIssueModalOpen && (
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-violet-600 uppercase tracking-wide">For *</label>
                      <select
                        value={issueForm.forType}
                        onChange={(e) => {
                          const val = e.target.value;
                          const item = items.find(i => i.item_name === issueForm.itemsName && i.inventory_type === issueForm.inventoryType);
                          setIssueForm(p => ({
                            ...p,
                            forType: val,
                            perUnit: val === 'H3' ? '0' : (item ? String(item.rental_price ?? 0) : p.perUnit),
                            unit: val === 'H3' ? '0' : (item ? String(item.damage_price ?? 0) : p.unit)
                          }));
                        }}
                        required
                        className="w-full h-11 px-4 rounded-lg border-2 border-violet-100 focus:border-violet-500 outline-none text-sm font-bold text-violet-700 bg-violet-50/20 transition-all"
                      >
                        <option value="Rent">Rent</option>
                        <option value="H3">H3</option>
                      </select>
                    </div>

                    <div className="space-y-1 relative" ref={issuerDropdownRef}>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Issuer *</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={issueForm.issuer}
                          onChange={(e) => {
                            const val = e.target.value;
                            setIssueForm(p => ({ ...p, issuer: val }));
                            setShowIssuerDropdown(true);
                          }}
                          onFocus={() => setShowIssuerDropdown(true)}
                          required
                          placeholder="Type or select..."
                          className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white"
                        />
                        <button type="button" onClick={() => setShowIssuerDropdown(!showIssuerDropdown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors">
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showIssuerDropdown ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {showIssuerDropdown && (
                        <div className="absolute z-[160] w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                          {(dropdownOptions.issuerOptions || [])
                            .filter(opt => !issueForm.issuer || opt.toLowerCase().includes(issueForm.issuer.toLowerCase()))
                            .map((opt, idx) => (
                              <button key={idx} type="button" onClick={() => { setIssueForm(p => ({ ...p, issuer: opt })); setShowIssuerDropdown(false); }} className="w-full px-4 py-2.5 text-left text-sm font-bold text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors border-b border-slate-50 last:border-0">
                                {opt}
                              </button>
                            ))}
                          {dropdownOptions.issuerOptions.filter(opt => !issueForm.issuer || opt.toLowerCase().includes(issueForm.issuer.toLowerCase())).length === 0 && (
                            <div className="px-4 py-3 text-xs font-bold text-slate-400 italic text-center">No matching issuers</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory Type *</label>
                      <select value={issueForm.inventoryType} onChange={(e) => setIssueForm(p => ({ ...p, inventoryType: e.target.value, itemsName: '', itemId: '' }))} required className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white">
                        <option value="">Select type</option>
                        {returnInvTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item Name *</label>
                      <select value={issueForm.itemsName} onChange={(e) => {
                        const val = e.target.value;
                        const item = items.find(i => i.item_name === val && i.inventory_type === issueForm.inventoryType);
                        if (item) {
                          const stock = itemStockMap[item.id];
                          setIssueForm(prev => ({
                            ...prev,
                            itemsName: val,
                            itemId: item.id,
                            department: item.department,
                            openingBalance: stock?.current_stock ?? 0,
                            perUnit: prev.forType === 'H3' ? '0' : String(item.rental_price ?? 0),
                            unit: prev.forType === 'H3' ? '0' : String(item.damage_price ?? 0),
                            imageUrl: item.image_url || stock?.image_url || ''
                          }));
                          const img = item.image_url || stock?.image_url;
                          if (img) setImagePreview(getDisplayableImageUrl(img));
                        }
                      }} required className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white">
                        <option value="">Select item name</option>
                        {filteredItems.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {isReturnModalOpen && isEditing && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Party-Month</label>
                      <div className="w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center text-sm font-medium text-slate-500">{returnForm.partyName || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory Type</label>
                      <div className="w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center text-sm font-medium text-slate-500">{returnForm.inventoryType || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item Name</label>
                      <div className="w-full h-11 px-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center text-sm font-medium text-slate-500">{returnForm.itemsName || '-'}</div>
                    </div>
                  </div>
                )}

                {isReturnModalOpen && !isEditing && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Party-Month *</label>
                      <input type="text" value={returnForm.partyName} onChange={(e) => setReturnForm(p => ({ ...p, partyName: e.target.value }))} placeholder="e.g. May 2026" required className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white" />
                    </div>

                    <div className="space-y-1 relative" ref={returnInvTypeDropdownRef}>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory Type *</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={returnForm.inventoryType}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReturnForm(p => ({ ...p, inventoryType: val, itemsName: '', itemId: '' }));
                            setShowReturnInvTypeDropdown(true);
                          }}
                          onFocus={() => setShowReturnInvTypeDropdown(true)}
                          required
                          placeholder="Type or select..."
                          className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white"
                        />
                        <button type="button" onClick={() => setShowReturnInvTypeDropdown(!showReturnInvTypeDropdown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors">
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showReturnInvTypeDropdown ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {showReturnInvTypeDropdown && (
                        <div className="absolute z-[160] w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                          {returnInvTypeOptions
                            .filter(opt => !returnForm.inventoryType || opt.toLowerCase().includes(returnForm.inventoryType.toLowerCase()))
                            .map((opt, idx) => (
                              <button key={idx} type="button" onClick={() => { setReturnForm(p => ({ ...p, inventoryType: opt, itemsName: '', itemId: '' })); setShowReturnInvTypeDropdown(false); }} className="w-full px-4 py-2.5 text-left text-sm font-bold text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors border-b border-slate-50 last:border-0">
                                {opt}
                              </button>
                            ))}
                          {returnInvTypeOptions.filter(opt => !returnForm.inventoryType || opt.toLowerCase().includes(returnForm.inventoryType.toLowerCase())).length === 0 && (
                            <div className="px-4 py-3 text-xs font-bold text-slate-400 italic text-center">No matching types</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 relative" ref={returnItemDropdownRef}>
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item Name *</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={returnForm.itemsName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setReturnForm(p => ({ ...p, itemsName: val }));
                            setShowReturnItemDropdown(true);
                          }}
                          onFocus={() => setShowReturnItemDropdown(true)}
                          required
                          disabled={!returnForm.inventoryType}
                          placeholder={returnForm.inventoryType ? "Type or select..." : "Select type first"}
                          className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                        />
                        <button type="button" disabled={!returnForm.inventoryType} onClick={() => setShowReturnItemDropdown(!showReturnItemDropdown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-50">
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showReturnItemDropdown ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {showReturnItemDropdown && (
                        <div className="absolute z-[160] w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                          {returnItemOptions
                            .filter(opt => !returnForm.itemsName || opt.toLowerCase().includes(returnForm.itemsName.toLowerCase()))
                            .map((opt, idx) => (
                              <button key={idx} type="button" onClick={() => { handleSelectReturnItem(opt); setShowReturnItemDropdown(false); }} className="w-full px-4 py-2.5 text-left text-sm font-bold text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors border-b border-slate-50 last:border-0">
                                {opt}
                              </button>
                            ))}
                          {returnItemOptions.filter(opt => !returnForm.itemsName || opt.toLowerCase().includes(returnForm.itemsName.toLowerCase())).length === 0 && (
                            <div className="px-4 py-3 text-xs font-bold text-slate-400 italic text-center">No matching items</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isIssueModalOpen ? (
                  <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl shadow-sm">
                    {[
                      { label: 'Department', val: issueForm.department },
                      { label: 'Opening Bal', val: (issueForm.openingBalance !== undefined && issueForm.openingBalance !== '') ? issueForm.openingBalance : '-' },
                      { label: 'Last Issue', val: validationState.committed || '0' }
                    ].map((f, i) => (
                      <div key={i} className="space-y-1.5 flex-1 min-w-[22%]">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">{f.label}</label>
                        <div className="h-10 flex items-center bg-white/50 px-3 rounded-lg border border-slate-200/50 text-xs font-bold text-slate-500 truncate">{f.val}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {returnForm.itemsName && (
                      <div className="grid grid-cols-2 gap-4 p-3.5 bg-fuchsia-50/50 border border-fuchsia-100 rounded-xl shadow-sm">
                        <div className="space-y-1 ml-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-fuchsia-400 block">Last Return Date</label>
                          <div className="text-xs font-black text-fuchsia-700">{lastReturnInfo.date}</div>
                        </div>
                        <div className="space-y-1 ml-1">
                          <label className="text-[9px] font-black uppercase tracking-widest text-fuchsia-400 block">Last Returned Qty</label>
                          <div className="text-xs font-black text-fuchsia-700">{lastReturnInfo.qty}</div>
                        </div>
                      </div>
                    )}

                    {!isEditing && matchingIssuedRows.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between px-2 mb-1">
                          <div className="flex flex-col">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">For (Issue Type)</label>
                            <div className="text-[11px] font-bold text-slate-700 ml-1">{returnForm.forType || '-'}</div>
                          </div>
                          <div className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                            {matchingIssuedRows.length}  Events  Combined
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <table className="w-full text-left text-xs table-fixed">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2.5 border-r border-slate-200/50 w-[20%] text-center">S. No.</th>
                                <th className="px-4 py-2.5 border-r border-slate-200/50 w-[30%]">Inv. Type</th>
                                <th className="px-4 py-2.5 border-r border-slate-200/50 w-[30%]">Event Type</th>
                                <th className="px-4 py-2.5 w-[20%] text-center">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {matchingIssuedRows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-4 py-2.5 border-r border-slate-200/50 text-center font-bold text-slate-400 truncate">{row.serial || '-'}</td>
                                  <td className="px-4 py-2.5 border-r border-slate-200/50 font-bold text-slate-600 truncate">{row.inventoryType || '-'}</td>
                                  <td className="px-4 py-2.5 border-r border-slate-200/50 font-bold text-slate-700 truncate">{row.eventType || 'Regular'}</td>
                                  <td className="px-4 py-2.5 text-center font-black text-violet-600">{row.qty}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-xl shadow-sm">
                        {[
                          { label: 'Department', val: returnForm.department },
                          { label: 'Inventory Type', val: returnForm.inventoryType }
                        ].map((f, i) => (
                          <div key={i} className="space-y-1.5 flex-1 min-w-[30%]">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block ml-1">{f.label}</label>
                            <div className="h-10 flex items-center bg-white/50 px-3 rounded-lg border border-slate-200/50 text-xs font-bold text-slate-500 truncate">{f.val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isIssueModalOpen && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-1 relative" ref={partyDropdownRef}>
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Party Name *</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={issueForm.partyName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setIssueForm(p => ({ ...p, partyName: val }));
                              setShowPartyDropdown(true);
                            }}
                            onFocus={() => setShowPartyDropdown(true)}
                            required
                            placeholder="Type or select..."
                            className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 outline-none text-sm font-medium text-slate-700 bg-white"
                          />
                          <button type="button" onClick={() => setShowPartyDropdown(!showPartyDropdown)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors">
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showPartyDropdown ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        {showPartyDropdown && (
                          <div className="absolute z-[160] w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                            {uniquePartyOptions
                              .filter(opt => !issueForm.partyName || opt.toLowerCase().includes(issueForm.partyName.toLowerCase()))
                              .map((opt, idx) => (
                                <button key={idx} type="button" onClick={() => handleSelectParty(opt)} className="w-full px-4 py-2.5 text-left text-sm font-bold text-slate-600 hover:bg-violet-50 hover:text-violet-600 transition-colors border-b border-slate-50 last:border-0">
                                  {opt}
                                </button>
                              ))}
                            {uniquePartyOptions.filter(opt => !issueForm.partyName || opt.toLowerCase().includes(issueForm.partyName.toLowerCase())).length === 0 && (
                              <div className="px-4 py-3 text-xs font-bold text-slate-400 italic text-center">No matching parties</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Dishes</label>
                        <input type="text" value={issueForm.dishes} onChange={(e) => setIssueForm(p => ({ ...p, dishes: e.target.value }))} placeholder="Dishes" className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 text-sm font-medium" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Event Date *</label>
                        <input type="date" value={issueForm.eventDate} onChange={(e) => setIssueForm(p => ({ ...p, eventDate: e.target.value }))} required className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 text-sm font-medium" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Event Type *</label>
                        <select value={issueForm.eventTime} onChange={(e) => setIssueForm(p => ({ ...p, eventTime: e.target.value }))} required className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 text-sm font-medium bg-white outline-none">
                          <option value="">Select time</option>
                          {dropdownOptions.eventTimeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Venue Name</label>
                        <input type="text" value={issueForm.foodName} onChange={(e) => setIssueForm(p => ({ ...p, foodName: e.target.value }))} placeholder="Enter venue..." className="w-full h-11 px-4 rounded-lg border border-slate-200 focus:border-violet-500 text-sm font-medium" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-violet-600 uppercase tracking-wide">Issue Quantity *</label>
                        <input
                          type="number"
                          onWheel={(e) => e.target.blur()}
                          value={issueForm.issueData}
                          onChange={(e) => setIssueForm(p => ({ ...p, issueData: e.target.value }))}
                          required
                          placeholder="0"
                          className={`w-full h-11 px-4 rounded-lg border-2 outline-none text-sm font-bold transition-all ${validationState.isOver ? 'border-red-500 bg-red-50 text-red-700' : 'border-violet-100 focus:border-violet-500 text-violet-700 bg-violet-50/20'}`}
                        />
                        {validationState.isOver && (
                          <div className="absolute z-10 w-full">
                            <p className="text-[10px] text-red-600 font-black mt-2 animate-pulse px-1 flex items-center gap-2 uppercase tracking-widest bg-red-50 py-1.5 rounded-md border border-red-100 shadow-xl w-fit whitespace-nowrap">
                              <Zap className="h-3 w-3 fill-red-600" /> Over Capacity: Only {validationState.availableForThisGroup} units left
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Renting Rate (₹) *</label>
                        <input
                          type="number"
                          onWheel={(e) => e.target.blur()}
                          step="0.01"
                          value={issueForm.perUnit}
                          onChange={(e) => setIssueForm(p => ({ ...p, perUnit: e.target.value }))}
                          required
                          readOnly={issueForm.forType === 'H3'}
                          placeholder="0.00"
                          className={`w-full h-11 px-4 rounded-lg border focus:border-violet-500 text-sm font-medium ${issueForm.forType === 'H3' ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-200'}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Estimated Cost</label>
                        <div className="w-full h-11 px-4 rounded-lg border border-emerald-100 bg-emerald-50/30 flex items-center text-sm font-bold text-emerald-700 shadow-sm">
                          ₹{(Number(issueForm.issueData || 0) * Number(issueForm.perUnit || 0)).toFixed(2)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Damage/Missing Rate (₹) *</label>
                        <input
                          type="number"
                          onWheel={(e) => e.target.blur()}
                          step="0.01"
                          value={issueForm.unit}
                          onChange={(e) => setIssueForm(p => ({ ...p, unit: e.target.value }))}
                          required
                          readOnly={issueForm.forType === 'H3'}
                          placeholder="0.00"
                          className={`w-full h-11 px-4 rounded-lg border focus:border-violet-500 text-sm font-medium ${issueForm.forType === 'H3' ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-200'}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Item-Attachment</label>
                        <div className="h-11">
                          <input type="file" id="inventory-upload" onChange={handleImageChange} className="hidden" accept="image/*" />
                          <label htmlFor="inventory-upload" className="flex items-center justify-between px-3 h-full rounded-lg border border-slate-200 hover:border-violet-400 bg-white cursor-pointer transition-all">
                            <div className="flex items-center gap-3 truncate">
                              <UploadCloud className="h-4 w-4 text-slate-300" />
                              <span className="text-xs font-semibold text-slate-500">{selectedImage ? "New File" : "Upload"}</span>
                            </div>
                            <div className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Browse</div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Preview</label>
                        <div className="p-2 bg-white border border-slate-100 rounded-xl shadow-sm h-28 flex items-center justify-center">
                          {imagePreview ? (
                            <div className="relative group rounded-lg overflow-hidden bg-slate-50 h-full w-full">
                              <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                              <button type="button" onClick={() => { setImagePreview(null); setSelectedImage(null); }} className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1 opacity-20">
                              <UploadCloud className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">No Image</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Remarks</label>
                        <textarea value={issueForm.remarks} onChange={(e) => setIssueForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Add any internal remarks..." className="w-full px-4 py-3 rounded-lg border border-slate-200 h-28 resize-none shadow-sm focus:border-violet-500 outline-none text-sm font-medium" />
                      </div>
                    </div>
                  </div>
                )}

                {isReturnModalOpen && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-fuchsia-600 uppercase tracking-wide">Return Date *</label><input type="date" value={returnForm.returnDate} onChange={(e) => setReturnForm(p => ({ ...p, returnDate: e.target.value }))} required className="w-full h-11 px-4 rounded-lg border-2 border-fuchsia-100 focus:border-fuchsia-500 text-sm font-medium" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Issue Quantity</label><div className="h-11 flex items-center bg-slate-50/50 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-400 italic">{returnForm.issueQty || '0'}</div></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-red-500 uppercase tracking-wide">Damage *</label><input type="number" onWheel={(e) => e.target.blur()} value={returnForm.damageItems} onChange={(e) => setReturnForm(p => ({ ...p, damageItems: e.target.value }))} required className="w-full h-11 px-4 rounded-lg border border-red-100 focus:border-red-500 text-sm font-medium text-red-700 bg-red-50/20" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-orange-500 uppercase tracking-wide">Missing *</label><input type="number" onWheel={(e) => e.target.blur()} value={returnForm.missingItems} onChange={(e) => setReturnForm(p => ({ ...p, missingItems: e.target.value }))} required className="w-full h-11 px-4 rounded-lg border border-orange-100 focus:border-orange-500 text-sm font-medium text-orange-700 bg-orange-50/20" /></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Damage Rate (₹)</label><div className="h-11 flex items-center bg-slate-50/50 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-400 italic">{returnForm.damageRate || '0'}</div></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-fuchsia-400 uppercase tracking-wide">Return Qty (Calc)</label><div className="h-11 flex items-center bg-fuchsia-50/10 px-4 rounded-lg border border-fuchsia-100 text-sm font-bold text-fuchsia-400 italic">{returnForm.returnData || '0'}</div></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Renting Rate (₹)</label><div className="h-11 flex items-center bg-slate-50/50 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-400 italic">{returnForm.rentingRate || '0'}</div></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Total Cost (₹)</label><div className="h-11 flex items-center bg-emerald-50 px-4 rounded-lg border border-emerald-200 text-sm font-black text-emerald-700 shadow-inner-sm">₹{returnForm.totalCost || '0.00'}</div></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Image Attachment</label>
                        <div className="h-11"><input type="file" id="return-upload" onChange={handleImageChange} className="hidden" accept="image/*" /><label htmlFor="return-upload" className="flex items-center justify-between px-3 h-full rounded-lg border border-slate-200 hover:border-fuchsia-400 bg-white cursor-pointer"><div className="flex items-center gap-3 truncate"><UploadCloud className="h-4 w-4 text-slate-300" /><span>{selectedImage ? "New File" : "Upload Image"}</span></div><div className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Browse</div></label></div>
                        {imagePreview && <div className="mt-2 p-2 bg-white border border-slate-100 rounded-xl shadow-sm"><div className="relative group rounded-lg overflow-hidden bg-slate-50 h-48"><img src={imagePreview} alt="Preview" className="w-full h-full object-contain" /><button type="button" onClick={() => { setImagePreview(null); setSelectedImage(null); }} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg transition-all"><X className="h-3.5 w-3.5" /></button></div></div>}
                      </div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Remarks</label><textarea value={returnForm.remarks} onChange={(e) => setReturnForm(p => ({ ...p, remarks: e.target.value }))} placeholder="..." rows="3" className="w-full px-4 py-2 rounded-lg border border-slate-200 h-28 resize-none shadow-sm focus:border-fuchsia-500 outline-none" /></div>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => { setIsIssueModalOpen(false); setIsReturnModalOpen(false); setIsEditing(false); }} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                  <button
                    type="submit"
                    disabled={isSubmitting || (isIssueModalOpen && validationState.isOver) || (isReturnModalOpen && !returnForm.itemsName)}
                    className={`min-w-[140px] px-10 py-2.5 rounded-xl text-white text-sm font-bold shadow-xl transition-all flex items-center justify-center gap-2 ${isIssueModalOpen ? 'bg-violet-600' : 'bg-fuchsia-600'} hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Processing...</span></> : (isIssueModalOpen ? 'Issue Items' : 'Return Items')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </AdminLayout>
  );
};

export default Inventory;
