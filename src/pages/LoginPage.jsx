"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { User, Lock, Eye, EyeOff } from "lucide-react"
import { supabase } from "../utils/supabaseClient"
import { TABLES, COLUMNS } from "../utils/dbSchema"

const LoginPage = () => {
  const navigate = useNavigate()
  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  })
  const [toast, setToast] = useState({ show: false, message: "", type: "" })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoginLoading(true)

    try {
      const trimmedUsername = formData.username.trim().toLowerCase()
      const trimmedPassword = formData.password.trim()

      const { data: user, error } = await supabase
        .from(TABLES.LOGIN)
        .select(`${COLUMNS.LOGIN.NAME}, ${COLUMNS.LOGIN.USERNAME}, ${COLUMNS.LOGIN.PASSWORD}, ${COLUMNS.LOGIN.ROLE}`)
        .ilike(COLUMNS.LOGIN.USERNAME, trimmedUsername)
        .maybeSingle()

      if (error) throw new Error(error.message)

      if (user && user.password === trimmedPassword) {
        const userRole = (user.role || "user").toLowerCase()
        const displayName = user.name || trimmedUsername
        const isAdmin = userRole === "admin"

        sessionStorage.setItem('username', trimmedUsername)
        sessionStorage.setItem('name', displayName)
        sessionStorage.setItem('role', userRole)
        sessionStorage.setItem('isAdmin', isAdmin ? 'true' : 'false')
        sessionStorage.setItem('department', isAdmin ? 'all' : trimmedUsername)

        navigate("/dashboard/admin")
        showToast(`Login successful. Welcome, ${displayName}!`, "success")
        return
      }

      showToast("Username or password is incorrect. Please try again.", "error")
    } catch (error) {
      showToast(`Login failed: ${error.message}. Please try again.`, "error")
    } finally {
      setIsLoginLoading(false)
    }
  }

  const showToast = (message, type) => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast({ show: false, message: "", type: "" })
    }, 5000) // Toast duration
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3 sm:p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-violet-100 p-1">
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-inner">
          {/* Header with Company Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl mb-3 sm:mb-4 shadow-md border border-violet-100 p-2 overflow-hidden">
              <img src="/H3-logo.svg" alt="Company Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-800 to-fuchsia-600 bg-clip-text text-transparent mb-2">Cutlery Crockery</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="block text-violet-700 text-sm font-semibold">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Enter your username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 bg-violet-50/30 border border-violet-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-500 transition-all duration-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-violet-700 text-sm font-semibold">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-10 pr-12 py-3 bg-violet-50/30 border border-violet-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-500 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-700 hover:to-fuchsia-600 text-white text-base font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:transform-none shadow-lg shadow-violet-200 mt-6"
              disabled={isLoginLoading}
            >
              {isLoginLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing In...
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="fixed left-0 right-0 bottom-0 py-1 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-center text-[10px] font-black uppercase tracking-[0.2em] shadow-md z-10">
        <a
          href="https://www.botivate.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Powered by-<span className="font-black">Botivate</span>
        </a>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${toast.type === "success"
          ? "bg-violet-50 text-violet-800 border-l-4 border-violet-500"
          : "bg-red-50 text-red-800 border-l-4 border-red-500"
          }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default LoginPage