"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Package,
  ListTree,
  Loader2,
  AlertTriangle,
  UploadCloud,
  Check
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import Pagination from "../components/Pagination";
import SearchableSelect from "../components/SearchableSelect";
import { supabase } from "../utils/supabaseClient";
import { uploadImage } from "../utils/supabaseStorage";
import { normalizeForMatch } from "../utils/helpers";
import { TABLES, DROPDOWN_CATEGORY } from "../utils/dbSchema";

const PAGE_SIZE = 50;

const emptyItemForm = {
  id: null,
  item_name: "",
  inventory_type: "",
  department: "",
  unit: "",
  rental_price: "0",
  damage_price: "0",
  image_url: ""
};

export default function Master() {
  const [activeTab, setActiveTab] = useState("items"); // 'items' | 'dropdowns'

  // ---- Items state ----
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemSearch, setItemSearch] = useState("");
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState("");
  const [deletingItemId, setDeletingItemId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // ---- Dropdowns state ----
  const [dropdowns, setDropdowns] = useState([]);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [newIssuer, setNewIssuer] = useState("");
  const [newEventType, setNewEventType] = useState("");
  const [newInventoryType, setNewInventoryType] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [dropdownSaving, setDropdownSaving] = useState(false);
  const [deletingDropdownId, setDeletingDropdownId] = useState(null);
  const [editingOptionId, setEditingOptionId] = useState(null);
  const [editingOptionValue, setEditingOptionValue] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState({});
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    isOpen: false,
    opt: null,
    categoryTitle: ""
  });

  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3500);
  };

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    let all = [];
    const pageSize = 1000;
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from(TABLES.ITEM_MASTER)
        .select("*")
        .order("item_name", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (error) {
        showToast(error.message, "error");
        break;
      }
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
    }
    setItems(all);
    setItemsLoading(false);
  }, []);

  const fetchDropdowns = useCallback(async () => {
    setDropdownsLoading(true);
    const { data, error } = await supabase
      .from(TABLES.DROPDOWN_OPTIONS)
      .select("*")
      .order("value", { ascending: true });
    if (error) {
      showToast(error.message, "error");
    } else {
      setDropdowns(data || []);
    }
    setDropdownsLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchDropdowns();
  }, [fetchItems, fetchDropdowns]);

  const [filterType, setFilterType] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [masterPage, setMasterPage] = useState(1);

  useEffect(() => {
    setMasterPage(1);
  }, [filterType, filterDept, filterItem, itemSearch]);

  const typeOptions = useMemo(() => {
    const s = normalizeForMatch(itemSearch);
    const filtered = items.filter(i => {
      const matchesSearch = !s || (
        normalizeForMatch(i.item_name).includes(s) ||
        normalizeForMatch(i.inventory_type).includes(s) ||
        normalizeForMatch(i.department).includes(s)
      );
      const matchesDept = !filterDept || i.department === filterDept;
      const matchesItem = !filterItem || i.item_name === filterItem;
      return matchesSearch && matchesDept && matchesItem;
    });
    return [...new Set(filtered.map(i => i.inventory_type).filter(Boolean))].sort();
  }, [items, itemSearch, filterDept, filterItem]);

  const deptOptions = useMemo(() => {
    const s = normalizeForMatch(itemSearch);
    const filtered = items.filter(i => {
      const matchesSearch = !s || (
        normalizeForMatch(i.item_name).includes(s) ||
        normalizeForMatch(i.inventory_type).includes(s) ||
        normalizeForMatch(i.department).includes(s)
      );
      const matchesType = !filterType || i.inventory_type === filterType;
      const matchesItem = !filterItem || i.item_name === filterItem;
      return matchesSearch && matchesType && matchesItem;
    });
    return [...new Set(filtered.map(i => i.department).filter(Boolean))].sort();
  }, [items, itemSearch, filterType, filterItem]);

  const itemOptions = useMemo(() => {
    const s = normalizeForMatch(itemSearch);
    const filtered = items.filter(i => {
      const matchesSearch = !s || (
        normalizeForMatch(i.item_name).includes(s) ||
        normalizeForMatch(i.inventory_type).includes(s) ||
        normalizeForMatch(i.department).includes(s)
      );
      const matchesType = !filterType || i.inventory_type === filterType;
      const matchesDept = !filterDept || i.department === filterDept;
      return matchesSearch && matchesType && matchesDept;
    });
    return [...new Set(filtered.map(i => i.item_name).filter(Boolean))].sort();
  }, [items, itemSearch, filterType, filterDept]);

  const filteredItems = useMemo(() => {
    const s = normalizeForMatch(itemSearch);
    return items.filter(i => {
      const matchesSearch = !s || (
        normalizeForMatch(i.item_name).includes(s) ||
        normalizeForMatch(i.inventory_type).includes(s) ||
        normalizeForMatch(i.department).includes(s)
      );
      const matchesType = !filterType || i.inventory_type === filterType;
      const matchesDept = !filterDept || i.department === filterDept;
      const matchesItem = !filterItem || i.item_name === filterItem;
      return matchesSearch && matchesType && matchesDept && matchesItem;
    });
  }, [items, itemSearch, filterType, filterDept, filterItem]);

  const paginatedItems = useMemo(() => {
    const start = (masterPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, masterPage]);

  const hasActiveFilters = Boolean(filterType || filterDept || filterItem || itemSearch);

  const clearAllFilters = () => {
    setFilterType("");
    setFilterDept("");
    setFilterItem("");
    setItemSearch("");
    setMasterPage(1);
  };

  const issuers = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.ISSUER), [dropdowns]);
  const eventTypes = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.EVENT_TYPE), [dropdowns]);
  const inventoryTypes = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.INVENTORY_TYPE), [dropdowns]);
  const departments = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.DEPARTMENT), [dropdowns]);
  const units = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.UNIT), [dropdowns]);

  const openAddItem = () => {
    setItemForm(emptyItemForm);
    setItemError("");
    setSelectedImage(null);
    setImagePreview(null);
    setIsItemModalOpen(true);
  };

  const openEditItem = (item) => {
    setItemForm({
      id: item.id,
      item_name: item.item_name || "",
      inventory_type: item.inventory_type || "",
      department: item.department || "",
      unit: item.unit || "",
      rental_price: String(item.rental_price ?? 0),
      damage_price: String(item.damage_price ?? 0),
      image_url: item.image_url || ""
    });
    setItemError("");
    setSelectedImage(null);
    setImagePreview(item.image_url || null);
    setIsItemModalOpen(true);
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

  const handleSaveItem = async () => {
    setItemError("");
    const name = itemForm.item_name.trim();
    if (!name) {
      setItemError("Item name is required.");
      return;
    }
    setItemSaving(true);

    let imageUrl = itemForm.image_url.trim() || null;
    if (selectedImage) {
      try {
        imageUrl = await uploadImage(selectedImage);
      } catch (uploadErr) {
        setItemError(uploadErr.message || "Failed to upload image.");
        setItemSaving(false);
        return;
      }
    }

    const payload = {
      item_name: name,
      inventory_type: itemForm.inventory_type.trim() || null,
      department: itemForm.department.trim() || null,
      unit: itemForm.unit.trim() || null,
      rental_price: parseFloat(itemForm.rental_price) || 0,
      damage_price: parseFloat(itemForm.damage_price) || 0,
      image_url: imageUrl
    };

    let error;
    if (itemForm.id) {
      ({ error } = await supabase.from(TABLES.ITEM_MASTER).update(payload).eq("id", itemForm.id));
    } else {
      ({ error } = await supabase.from(TABLES.ITEM_MASTER).insert(payload));
    }

    if (error) {
      // Postgres unique_violation
      if (error.code === "23505") {
        setItemError(`An item named "${name}" already exists — item names must be unique.`);
      } else {
        setItemError(error.message);
      }
      setItemSaving(false);
      return;
    }

    setItemSaving(false);
    setIsItemModalOpen(false);
    showToast(itemForm.id ? "Item updated" : "Item added");
    fetchItems();
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.item_name}"? This cannot be undone.`)) return;
    setDeletingItemId(item.id);
    const { error } = await supabase.from(TABLES.ITEM_MASTER).delete().eq("id", item.id);
    setDeletingItemId(null);
    if (error) {
      // Postgres foreign_key_violation — item has stock/issue/return history
      if (error.code === "23503") {
        showToast(`Can't delete "${item.item_name}" — it has stock, issue, or return history. Historical records are kept intentionally.`, "error");
      } else {
        showToast(error.message, "error");
      }
      return;
    }
    showToast("Item deleted");
    fetchItems();
  };

  const handleAddDropdown = async (category, value, resetFn) => {
    const v = value.trim();
    if (!v) return;
    setDropdownSaving(true);
    const { error } = await supabase.from(TABLES.DROPDOWN_OPTIONS).insert({ category, value: v });
    setDropdownSaving(false);
    if (error) {
      if (error.code === "23505") showToast(`"${v}" already exists in this list.`, "error");
      else showToast(error.message, "error");
      return;
    }
    resetFn("");
    showToast("Added");
    fetchDropdowns();
  };

  const handleStartEdit = (opt) => {
    setEditingOptionId(opt.id);
    setEditingOptionValue(opt.value);
  };

  const handleCancelEdit = () => {
    setEditingOptionId(null);
    setEditingOptionValue("");
  };

  const handleSaveEdit = async (opt, category) => {
    const newVal = editingOptionValue.trim();
    const oldVal = opt.value;
    if (!newVal) {
      showToast("Value cannot be empty.", "error");
      return;
    }
    if (newVal === oldVal) {
      setEditingOptionId(null);
      return;
    }

    setEditingSaving(true);
    // 1. Update dropdown_options table
    const { error } = await supabase
      .from(TABLES.DROPDOWN_OPTIONS)
      .update({ value: newVal })
      .eq("id", opt.id);

    if (error) {
      setEditingSaving(false);
      if (error.code === "23505") showToast(`"${newVal}" already exists in this list.`, "error");
      else showToast(error.message, "error");
      return;
    }

    // 2. Cascade rename to existing records so data stays consistent
    try {
      if (category === DROPDOWN_CATEGORY.INVENTORY_TYPE) {
        await supabase.from(TABLES.ITEM_MASTER).update({ inventory_type: newVal }).eq("inventory_type", oldVal);
      } else if (category === DROPDOWN_CATEGORY.DEPARTMENT) {
        await supabase.from(TABLES.ITEM_MASTER).update({ department: newVal }).eq("department", oldVal);
      } else if (category === DROPDOWN_CATEGORY.UNIT) {
        await supabase.from(TABLES.ITEM_MASTER).update({ unit: newVal }).eq("unit", oldVal);
        await supabase.from(TABLES.STOCK_TRANSACTIONS).update({ unit: newVal }).eq("unit", oldVal);
      } else if (category === DROPDOWN_CATEGORY.ISSUER) {
        await supabase.from(TABLES.ISSUES).update({ issuer: newVal }).eq("issuer", oldVal);
      } else if (category === DROPDOWN_CATEGORY.EVENT_TYPE) {
        await supabase.from(TABLES.ISSUES).update({ event_type: newVal }).eq("event_type", oldVal);
      }
    } catch (cascadeErr) {
      console.warn("Cascade update notice:", cascadeErr);
    }

    setEditingSaving(false);
    setEditingOptionId(null);
    setEditingOptionValue("");
    showToast(`Updated to "${newVal}"`);
    fetchDropdowns();
    fetchItems();
  };

  const requestDeleteDropdown = (opt, categoryTitle = "entry") => {
    setDeleteConfirmModal({
      isOpen: true,
      opt,
      categoryTitle
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmModal.opt) return;
    const opt = deleteConfirmModal.opt;
    const label = opt.value;
    setDeletingDropdownId(opt.id);
    const { error } = await supabase.from(TABLES.DROPDOWN_OPTIONS).delete().eq("id", opt.id);
    setDeletingDropdownId(null);
    setDeleteConfirmModal({ isOpen: false, opt: null, categoryTitle: "" });
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast(`Removed "${label}"`);
    fetchDropdowns();
  };

  function getDisplayableImageUrl(url) {
    if (!url || url === "No Image") return null;
    try {
      const directMatch = url.match(/file\/d\/([a-zA-Z0-9\-_]+)/);
      if (directMatch && directMatch[1]) return `https://drive.google.com/thumbnail?id=${directMatch[1]}&sz=w200`;
      const ucMatch = url.match(/[?&]id=([a-zA-Z0-9\-_]+)/);
      if (ucMatch && ucMatch[1]) return `https://drive.google.com/thumbnail?id=${ucMatch[1]}&sz=w200`;
      const match = url.match(/(?:id=|\/d\/)([a-zA-Z0-9\-_]{25,})/);
      if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
      return url;
    } catch { return url; }
  }

  return (
    <AdminLayout>
      <div className="min-h-[calc(100vh-42px)] bg-[#f0f2f8] font-sans px-3 sm:px-8 py-4 sm:py-6">
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setActiveTab("items")}
            className={`px-4 sm:px-6 py-2.5 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "items" ? "bg-white text-violet-600 border-x border-t border-slate-100" : "text-slate-400 hover:text-slate-600"}`}
          >
            <Package className="h-3.5 w-3.5" /> Items
          </button>
          <button
            onClick={() => setActiveTab("dropdowns")}
            className={`px-4 sm:px-6 py-2.5 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "dropdowns" ? "bg-white text-violet-600 border-x border-t border-slate-100" : "text-slate-400 hover:text-slate-600"}`}
          >
            <ListTree className="h-3.5 w-3.5" /> Dropdowns
          </button>
        </div>

        {activeTab === "items" && (
          <div className="bg-white rounded-xl rounded-tl-none border border-slate-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="h-9 w-full pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/5 outline-none text-xs text-slate-600 font-medium"
                  />
                </div>

                <div className="w-36">
                  <SearchableSelect
                    value={filterType}
                    onChange={setFilterType}
                    options={typeOptions}
                    allOptionLabel="All Types"
                    placeholder="All Types"
                    size="sm"
                    allowClear={false}
                  />
                </div>

                <div className="w-44">
                  <SearchableSelect
                    value={filterDept}
                    onChange={setFilterDept}
                    options={deptOptions}
                    allOptionLabel="All Departments"
                    placeholder="All Departments"
                    size="sm"
                    allowClear={false}
                  />
                </div>

                <div className="w-44">
                  <SearchableSelect
                    value={filterItem}
                    onChange={setFilterItem}
                    options={itemOptions}
                    allOptionLabel="All Items"
                    placeholder="All Items"
                    size="sm"
                    allowClear={false}
                  />
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="h-9 px-3 hover:bg-red-50 text-red-500 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
                    title="Clear all filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <button
                onClick={openAddItem}
                className="h-9 px-4 rounded-xl bg-violet-600 text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all shrink-0 self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="sticky top-0 bg-violet-50 z-10">
                  <tr>
                    {["Image", "Item Name", "Type", "Department", "Unit", "Rental Price", "Damage Price", ""].map(h => (
                      <th key={h} className="px-6 py-3 text-[10px] font-bold text-violet-600 uppercase tracking-widest border-b border-violet-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {itemsLoading ? (
                    <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">Loading…</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">No items found</td></tr>
                  ) : (
                    paginatedItems.map(item => {
                      const displayImgUrl = getDisplayableImageUrl(item.image_url);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-2.5">
                            {displayImgUrl ? (
                              <a
                                href={item.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Click to view full image"
                                className="block h-10 w-10 shrink-0"
                              >
                                <img
                                  src={displayImgUrl}
                                  alt={item.item_name}
                                  className="h-10 w-10 object-cover rounded-lg border border-slate-200 bg-slate-50 hover:opacity-80 transition-opacity shadow-sm"
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.parentNode.innerHTML = `<div class="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg></div>`;
                                  }}
                                />
                              </a>
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs font-bold text-slate-900">{item.item_name}</td>
                          <td className="px-6 py-3 text-xs text-slate-600">{item.inventory_type || "-"}</td>
                          <td className="px-6 py-3 text-xs text-slate-600">{item.department || "-"}</td>
                          <td className="px-6 py-3 text-xs text-slate-600">{item.unit || "-"}</td>
                          <td className="px-6 py-3 text-xs text-slate-600">₹{Number(item.rental_price).toLocaleString("en-IN")}</td>
                          <td className="px-6 py-3 text-xs text-slate-600">₹{Number(item.damage_price).toLocaleString("en-IN")}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEditItem(item)} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item)}
                                disabled={deletingItemId === item.id}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
                              >
                                {deletingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={masterPage}
              totalCount={filteredItems.length}
              pageSize={PAGE_SIZE}
              onPageChange={setMasterPage}
              isLoading={itemsLoading}
            />
          </div>
        )}

        {activeTab === "dropdowns" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            {[
              { title: "Inventory Types", category: DROPDOWN_CATEGORY.INVENTORY_TYPE, list: inventoryTypes, value: newInventoryType, setValue: setNewInventoryType },
              { title: "Departments", category: DROPDOWN_CATEGORY.DEPARTMENT, list: departments, value: newDepartment, setValue: setNewDepartment },
              { title: "Units", category: DROPDOWN_CATEGORY.UNIT, list: units, value: newUnit, setValue: setNewUnit },
              { title: "Issuers", category: DROPDOWN_CATEGORY.ISSUER, list: issuers, value: newIssuer, setValue: setNewIssuer },
              { title: "Event Types", category: DROPDOWN_CATEGORY.EVENT_TYPE, list: eventTypes, value: newEventType, setValue: setNewEventType }
            ].map(col => {
              const query = (dropdownSearch[col.category] || "").toLowerCase().trim();
              const displayList = query ? col.list.filter(opt => opt.value.toLowerCase().includes(query)) : col.list;

              return (
                <div key={col.category} className="bg-white rounded-xl rounded-tl-none border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-slate-800">{col.title}</h3>
                      <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{col.list.length}</span>
                    </div>
                  </div>

                  {/* Add Input */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder={`Add new ${col.title.toLowerCase().slice(0, -1)}...`}
                      value={col.value}
                      onChange={(e) => col.setValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddDropdown(col.category, col.value, col.setValue)}
                      className="h-9 flex-1 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium focus:border-violet-300 outline-none"
                    />
                    <button
                      onClick={() => handleAddDropdown(col.category, col.value, col.setValue)}
                      disabled={dropdownSaving}
                      title="Add (Enter)"
                      className="h-9 px-3 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-all flex items-center justify-center shrink-0 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Filter box for long lists */}
                  {col.list.length > 5 && (
                    <div className="relative mb-2.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder={`Filter ${col.title.toLowerCase()}...`}
                        value={dropdownSearch[col.category] || ""}
                        onChange={(e) => setDropdownSearch(p => ({ ...p, [col.category]: e.target.value }))}
                        className="h-8 w-full pl-8 pr-7 rounded-lg bg-slate-50/70 border border-slate-200 text-[11px] font-medium text-slate-600 focus:bg-white focus:border-violet-300 outline-none transition-all"
                      />
                      {dropdownSearch[col.category] && (
                        <button
                          type="button"
                          onClick={() => setDropdownSearch(p => ({ ...p, [col.category]: "" }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar flex-1">
                    {dropdownsLoading ? (
                      <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest text-center py-4">Loading…</p>
                    ) : displayList.length === 0 ? (
                      <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest text-center py-4">
                        {query ? "No matches found" : "No entries"}
                      </p>
                    ) : (
                      displayList.map(opt => {
                        const isEditing = editingOptionId === opt.id;
                        return (
                          <div key={opt.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors gap-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={editingOptionValue}
                                  onChange={(e) => setEditingOptionValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEdit(opt, col.category);
                                    if (e.key === "Escape") handleCancelEdit();
                                  }}
                                  autoFocus
                                  className="h-8 flex-1 px-2.5 rounded-lg bg-white border border-violet-400 focus:ring-2 focus:ring-violet-500/20 text-xs font-semibold text-slate-800 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(opt, col.category)}
                                  disabled={editingSaving}
                                  title="Save (Enter)"
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                  {editingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={editingSaving}
                                  title="Cancel (Esc)"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-slate-700 truncate">{opt.value}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(opt)}
                                    title="Edit option"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-white transition-all"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => requestDeleteDropdown(opt, col.title)}
                                    disabled={deletingDropdownId === opt.id}
                                    title="Delete option"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white transition-all disabled:opacity-40"
                                  >
                                    {deletingDropdownId === opt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isItemModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 my-auto max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h3 className="text-lg font-bold text-slate-900">{itemForm.id ? "Edit Item" : "Add Item"}</h3>
                <button type="button" onClick={() => setIsItemModalOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSaveItem(); }} className="flex flex-col flex-1 min-h-0">
                <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1 min-h-0">
                  {itemError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600 font-medium">{itemError}</p>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Name *</label>
                    <input value={itemForm.item_name} onChange={(e) => setItemForm(p => ({ ...p, item_name: e.target.value }))}
                      className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Type</label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={itemForm.inventory_type}
                          onChange={(val) => setItemForm(p => ({ ...p, inventory_type: val }))}
                          options={inventoryTypes}
                          placeholder="Select type..."
                          searchPlaceholder="Search type..."
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={itemForm.department}
                          onChange={(val) => setItemForm(p => ({ ...p, department: val }))}
                          options={departments}
                          placeholder="Select department..."
                          searchPlaceholder="Search department..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unit</label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={itemForm.unit}
                          onChange={(val) => setItemForm(p => ({ ...p, unit: val }))}
                          options={units}
                          placeholder="Select unit..."
                          searchPlaceholder="Search unit..."
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rental ₹</label>
                      <input type="number" value={itemForm.rental_price} onChange={(e) => setItemForm(p => ({ ...p, rental_price: e.target.value }))}
                        className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Damage ₹</label>
                      <input type="number" value={itemForm.damage_price} onChange={(e) => setItemForm(p => ({ ...p, damage_price: e.target.value }))}
                        className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Image</label>
                    <div className="mt-1 h-10">
                      <input type="file" id="item-image-upload" onChange={handleImageChange} className="hidden" accept="image/*" />
                      <label htmlFor="item-image-upload" className="flex items-center justify-between px-3 h-full rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all cursor-pointer bg-slate-50">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <UploadCloud className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-semibold text-slate-500 truncate">
                            {selectedImage ? "New file selected" : (imagePreview ? "Keep current image" : "Click to upload image")}
                          </span>
                        </div>
                        <div className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Browse</div>
                      </label>
                    </div>
                    {imagePreview && (
                      <div className="mt-2 p-2 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div className="relative group rounded-lg overflow-hidden bg-slate-50 border border-slate-200 h-32">
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                          <button
                            type="button"
                            onClick={() => { setImagePreview(null); setSelectedImage(null); setItemForm(p => ({ ...p, image_url: "" })); }}
                            className="absolute top-1.5 right-1.5 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg backdrop-blur-sm transition-all"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100 shrink-0">
                  <button type="button" onClick={() => setIsItemModalOpen(false)} className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button
                    type="submit"
                    disabled={itemSaving}
                    className="h-10 px-5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {itemSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{itemSaving ? "Saving..." : (itemForm.id ? "Save Changes" : "Add Item")}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modern In-App Confirmation Dialog for Deleting Dropdown Options */}
        {deleteConfirmModal.isOpen && deleteConfirmModal.opt && (
          <div
            className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => !deletingDropdownId && setDeleteConfirmModal({ isOpen: false, opt: null, categoryTitle: "" })}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 sm:p-6 animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3.5">
                <div className="h-11 w-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Option</h3>
                  <p className="text-xs text-slate-400 font-medium">Remove from dropdown list</p>
                </div>
              </div>

              <div className="my-2 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
                <p className="text-slate-700 font-medium">
                  Are you sure you want to remove <span className="font-bold text-red-600 bg-red-50/80 px-1.5 py-0.5 rounded border border-red-100">"{deleteConfirmModal.opt.value}"</span> from {deleteConfirmModal.categoryTitle}?
                </p>
                <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-100/80 text-[11px] text-emerald-800 flex items-start gap-1.5">
                  <span className="font-bold text-emerald-600">✓</span>
                  <span>Existing historical records with this {deleteConfirmModal.categoryTitle.toLowerCase().replace(/s$/, '')} will <strong>NOT</strong> be deleted or affected.</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmModal({ isOpen: false, opt: null, categoryTitle: "" })}
                  disabled={deletingDropdownId !== null}
                  className="h-9 px-4 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingDropdownId !== null}
                  className="h-9 px-4 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all flex items-center gap-1.5 shadow-sm shadow-red-200 disabled:opacity-50"
                >
                  {deletingDropdownId !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{deletingDropdownId !== null ? "Deleting..." : "Delete Option"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {toast.show && (
          <div className={`fixed bottom-6 right-6 z-[300] px-5 py-3 rounded-xl shadow-2xl text-xs font-bold text-white ${toast.type === "error" ? "bg-red-500" : "bg-emerald-500"}`}>
            {toast.message}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
