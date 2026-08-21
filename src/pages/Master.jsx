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
  UploadCloud
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import { supabase } from "../utils/supabaseClient";
import { uploadImage } from "../utils/supabaseStorage";
import { normalizeForMatch } from "../utils/helpers";
import { TABLES, DROPDOWN_CATEGORY } from "../utils/dbSchema";

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

  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3500);
  };

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    const { data, error } = await supabase
      .from(TABLES.ITEM_MASTER)
      .select("*")
      .order("item_name", { ascending: true });
    if (error) {
      showToast(error.message, "error");
    } else {
      setItems(data || []);
    }
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

  const filteredItems = useMemo(() => {
    const s = normalizeForMatch(itemSearch);
    if (!s) return items;
    return items.filter(i =>
      normalizeForMatch(i.item_name).includes(s) ||
      normalizeForMatch(i.inventory_type).includes(s) ||
      normalizeForMatch(i.department).includes(s)
    );
  }, [items, itemSearch]);

  const issuers = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.ISSUER), [dropdowns]);
  const eventTypes = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.EVENT_TYPE), [dropdowns]);
  const inventoryTypes = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.INVENTORY_TYPE), [dropdowns]);
  const departments = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.DEPARTMENT), [dropdowns]);
  const units = useMemo(() => dropdowns.filter(d => d.category === DROPDOWN_CATEGORY.UNIT), [dropdowns]);

  // Department is a global, independent admin-managed list — most departments
  // only ever get used with ONE inventory type in practice (e.g. "Wooden"
  // only exists under Decor/Disposal, not Crockery). Scoping the dropdown to
  // departments already used by existing items under the chosen type avoids
  // creating a nonsensical pairing. Falls back to the full list when the type
  // has no items yet (or none selected), so genuinely new pairings still work.
  const itemFormDepartmentOptions = useMemo(() => {
    if (!itemForm.inventory_type) return departments;
    const scoped = [...new Set(items.filter(i => i.inventory_type === itemForm.inventory_type).map(i => i.department).filter(Boolean))];
    if (scoped.length === 0) return departments;
    return departments.filter(d => scoped.includes(d.value));
  }, [items, itemForm.inventory_type, departments]);

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

  const handleDeleteDropdown = async (opt) => {
    if (!window.confirm(`Remove "${opt.value}" from the list?`)) return;
    setDeletingDropdownId(opt.id);
    const { error } = await supabase.from(TABLES.DROPDOWN_OPTIONS).delete().eq("id", opt.id);
    setDeletingDropdownId(null);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    showToast("Removed");
    fetchDropdowns();
  };

  return (
    <AdminLayout>
      <div className="min-h-[calc(100vh-42px)] bg-[#f0f2f8] font-sans px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Master Data</h1>
        </div>

        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setActiveTab("items")}
            className={`px-6 py-2.5 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "items" ? "bg-white text-violet-600 border-x border-t border-slate-100" : "text-slate-400 hover:text-slate-600"}`}
          >
            <Package className="h-3.5 w-3.5" /> Items
          </button>
          <button
            onClick={() => setActiveTab("dropdowns")}
            className={`px-6 py-2.5 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "dropdowns" ? "bg-white text-violet-600 border-x border-t border-slate-100" : "text-slate-400 hover:text-slate-600"}`}
          >
            <ListTree className="h-3.5 w-3.5" /> Dropdowns
          </button>
        </div>

        {activeTab === "items" && (
          <div className="bg-white rounded-xl rounded-tl-none border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="relative w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="h-9 w-full pl-10 pr-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/5 outline-none text-xs text-slate-600 font-medium"
                />
              </div>
              <button
                onClick={openAddItem}
                className="h-9 px-4 rounded-xl bg-violet-600 text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-violet-50 z-10">
                  <tr>
                    {["Item Name", "Type", "Department", "Unit", "Rental Price", "Damage Price", ""].map(h => (
                      <th key={h} className="px-6 py-3 text-[10px] font-bold text-violet-600 uppercase tracking-widest border-b border-violet-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {itemsLoading ? (
                    <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">Loading…</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">No items found</td></tr>
                  ) : (
                    filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "dropdowns" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[
              { title: "Inventory Types", category: DROPDOWN_CATEGORY.INVENTORY_TYPE, list: inventoryTypes, value: newInventoryType, setValue: setNewInventoryType },
              { title: "Departments", category: DROPDOWN_CATEGORY.DEPARTMENT, list: departments, value: newDepartment, setValue: setNewDepartment },
              { title: "Units", category: DROPDOWN_CATEGORY.UNIT, list: units, value: newUnit, setValue: setNewUnit },
              { title: "Issuers", category: DROPDOWN_CATEGORY.ISSUER, list: issuers, value: newIssuer, setValue: setNewIssuer },
              { title: "Event Types", category: DROPDOWN_CATEGORY.EVENT_TYPE, list: eventTypes, value: newEventType, setValue: setNewEventType }
            ].map(col => (
              <div key={col.category} className="bg-white rounded-xl rounded-tl-none border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-800 mb-3">{col.title}</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder={`Add new ${col.title.toLowerCase().slice(0, -1)}...`}
                    value={col.value}
                    onChange={(e) => col.setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDropdown(col.category, col.value, col.setValue)}
                    className="h-9 flex-1 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 focus:ring-4 focus:ring-violet-500/5 outline-none text-xs text-slate-600 font-medium"
                  />
                  <button
                    onClick={() => handleAddDropdown(col.category, col.value, col.setValue)}
                    disabled={dropdownSaving}
                    className="h-9 px-4 rounded-xl bg-violet-600 text-white flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {dropdownsLoading ? (
                    <p className="text-xs text-slate-400 font-bold uppercase text-center py-6">Loading…</p>
                  ) : col.list.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold uppercase text-center py-6">No entries yet</p>
                  ) : (
                    col.list.map(opt => (
                      <div key={opt.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50">
                        <span className="text-xs font-semibold text-slate-700">{opt.value}</span>
                        <button
                          onClick={() => handleDeleteDropdown(opt)}
                          disabled={deletingDropdownId === opt.id}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
                        >
                          {deletingDropdownId === opt.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isItemModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900">{itemForm.id ? "Edit Item" : "Add Item"}</h3>
                <button onClick={() => setIsItemModalOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>

              {itemError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 font-medium">{itemError}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Name *</label>
                  <input value={itemForm.item_name} onChange={(e) => setItemForm(p => ({ ...p, item_name: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Type</label>
                    <select value={itemForm.inventory_type} onChange={(e) => setItemForm(p => ({ ...p, inventory_type: e.target.value, department: "" }))}
                      className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm">
                      <option value="">Select type...</option>
                      {inventoryTypes.map(opt => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</label>
                    <select value={itemForm.department} onChange={(e) => setItemForm(p => ({ ...p, department: e.target.value }))}
                      className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm">
                      <option value="">Select department...</option>
                      {itemFormDepartmentOptions.map(opt => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unit</label>
                    <select value={itemForm.unit} onChange={(e) => setItemForm(p => ({ ...p, unit: e.target.value }))}
                      className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm">
                      <option value="">Select unit...</option>
                      {units.map(opt => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                    </select>
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

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsItemModalOpen(false)} className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button
                  onClick={handleSaveItem}
                  disabled={itemSaving}
                  className="h-10 px-5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {itemSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {itemForm.id ? "Save Changes" : "Add Item"}
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
