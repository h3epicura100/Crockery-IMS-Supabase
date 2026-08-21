"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Eye,
  EyeOff,
  UserCog,
  ShieldAlert
} from "lucide-react";
import AdminLayout from "../components/layout/AdminLayout";
import { supabase } from "../utils/supabaseClient";
import { TABLES } from "../utils/dbSchema";

const emptyForm = { id: null, name: "", username: "", password: "", role: "user" };

export default function Settings() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  const currentUsername = sessionStorage.getItem("username");

  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLES.LOGIN).select("*").order("username");
    if (error) showToast(error.message, "error");
    else setUsers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const adminCount = users.filter(u => u.role === "admin").length;

  const openAdd = () => {
    setForm(emptyForm);
    setError("");
    setIsModalOpen(true);
  };

  const openEdit = (u) => {
    setForm({ id: u.id, name: u.name || "", username: u.username, password: "", role: u.role });
    setError("");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setError("");
    const username = form.username.trim();
    if (!username) { setError("Username is required."); return; }
    if (!form.id && !form.password) { setError("Password is required for a new user."); return; }

    // Guard: don't let the last remaining admin demote themselves to 'user'
    if (form.id) {
      const target = users.find(u => u.id === form.id);
      if (target?.role === "admin" && form.role === "user" && adminCount <= 1) {
        setError("Can't demote the last remaining admin — promote someone else first.");
        return;
      }
    }

    setSaving(true);
    const payload = { name: form.name.trim() || null, username, role: form.role };
    if (form.password) payload.password = form.password;

    let dbError;
    if (form.id) {
      ({ error: dbError } = await supabase.from(TABLES.LOGIN).update(payload).eq("id", form.id));
    } else {
      payload.password = form.password;
      ({ error: dbError } = await supabase.from(TABLES.LOGIN).insert(payload));
    }

    if (dbError) {
      if (dbError.code === "23505") setError(`Username "${username}" is already taken.`);
      else setError(dbError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setIsModalOpen(false);
    showToast(form.id ? "User updated" : "User added");
    fetchUsers();
  };

  const handleDelete = async (u) => {
    if (u.username === currentUsername) {
      showToast("You can't delete your own account while logged in.", "error");
      return;
    }
    if (u.role === "admin" && adminCount <= 1) {
      showToast("Can't delete the last remaining admin.", "error");
      return;
    }
    if (!window.confirm(`Delete user "${u.username}"?`)) return;

    setDeletingId(u.id);
    const { error } = await supabase.from(TABLES.LOGIN).delete().eq("id", u.id);
    setDeletingId(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast("User deleted");
    fetchUsers();
  };

  return (
    <AdminLayout>
      <div className="min-h-[calc(100vh-42px)] bg-[#f0f2f8] font-sans px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-bold text-slate-800">User Accounts</h3>
            </div>
            <button
              onClick={openAdd}
              className="h-9 px-4 rounded-xl bg-violet-600 text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> Add User
            </button>
          </div>

          <table className="w-full text-left border-collapse">
            <thead className="bg-violet-50">
              <tr>
                {["Name", "Username", "Password", "Role", ""].map(h => (
                  <th key={h} className="px-6 py-3 text-[10px] font-bold text-violet-600 uppercase tracking-widest border-b border-violet-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-xs font-bold uppercase">No users found</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-xs font-bold text-slate-900">{u.name || "-"}</td>
                    <td className="px-6 py-3 text-xs text-slate-600">{u.username}</td>
                    <td className="px-6 py-3 text-xs text-slate-600 font-mono">
                      <div className="flex items-center gap-2">
                        <span>{showPassword[u.id] ? u.password : "••••••••"}</span>
                        <button onClick={() => setShowPassword(p => ({ ...p, [u.id]: !p[u.id] }))} className="text-slate-300 hover:text-violet-500">
                          {showPassword[u.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${u.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(u)} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
                        >
                          {deletingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900">{form.id ? "Edit User" : "Add User"}</h3>
                <button onClick={() => setIsModalOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name</label>
                  <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Username *</label>
                  <input value={form.username} onChange={(e) => setForm(p => ({ ...p, username: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Password {form.id ? "(leave blank to keep current)" : "*"}
                  </label>
                  <input type="text" value={form.password} onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Role</label>
                  <select value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
                    className="mt-1 h-10 w-full px-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-violet-300 outline-none text-sm">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setIsModalOpen(false)} className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-10 px-5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {form.id ? "Save Changes" : "Add User"}
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
