import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check, X } from "lucide-react";

/**
 * Modern Searchable Select Dropdown
 * 
 * Replaces native <select> with a sleek, searchable, styled popover dropdown.
 * Uses React Portal to render to document.body, eliminating overflow/clipping bugs inside modals.
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder,
  searchable = true,
  allowClear = true,
  size = "md", // "sm" | "md"
  className = "",
  disabled = false,
  emptyMessage = "No options found",
  allOptionLabel = null // e.g. "All Types" for filter dropdowns
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, placeAbove: false, maxHeight: 280 });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options
  const normalizedOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    return options
      .map((opt, index) => {
        if (opt == null) return null;
        if (typeof opt === "string" || typeof opt === "number") {
          return { id: `opt-${index}-${opt}`, value: String(opt), label: String(opt) };
        }
        const val = opt.value ?? opt.label ?? opt.name ?? "";
        const lbl = opt.label ?? opt.value ?? opt.name ?? "";
        return {
          id: opt.id ?? `opt-${index}-${val}`,
          value: String(val),
          label: String(lbl)
        };
      })
      .filter(Boolean);
  }, [options]);

  // Selected option
  const selectedOption = useMemo(() => {
    if (value === "" || value === null || value === undefined) return null;
    return normalizedOptions.find(opt => String(opt.value) === String(value));
  }, [normalizedOptions, value]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(opt =>
      opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  // Calculate coordinates for the floating popover
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    // Auto-close if trigger is scrolled completely off-screen
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setIsOpen(false);
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popoverHeight = 280;

    const placeAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;
    const maxHeight = placeAbove ? Math.min(spaceAbove - 16, 320) : Math.min(spaceBelow - 16, 320);

    setCoords({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      top: placeAbove ? undefined : rect.bottom + 6,
      bottom: placeAbove ? (window.innerHeight - rect.top) + 6 : undefined,
      maxHeight: Math.max(160, maxHeight),
      placeAbove
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    setSearchQuery("");

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (e) => {
      if (
        (triggerRef.current && triggerRef.current.contains(e.target)) ||
        (popoverRef.current && popoverRef.current.contains(e.target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  };

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
  };

  const isSmall = size === "sm";

  const displayText = selectedOption
    ? selectedOption.label
    : value
    ? String(value)
    : allOptionLabel
    ? allOptionLabel
    : placeholder;

  const isPlaceholder = !selectedOption && (!value || value === "") && !allOptionLabel;

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between text-left transition-all border outline-none font-sans select-none ${
          isSmall
            ? "h-9 px-3 rounded-xl text-xs font-bold"
            : "h-10 px-3.5 rounded-xl text-sm font-medium"
        } ${
          isOpen
            ? "bg-white border-violet-500 ring-4 ring-violet-500/10 shadow-sm"
            : "bg-slate-50 border-slate-200 hover:border-violet-300 hover:bg-slate-100/60"
        } ${
          disabled ? "opacity-50 cursor-not-allowed bg-slate-100" : "cursor-pointer"
        }`}
      >
        <span
          className={`truncate pr-2 ${
            isPlaceholder ? "text-slate-400 font-normal" : "text-slate-800"
          }`}
        >
          {displayText}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {allowClear && value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              title="Clear"
              className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-200/60 transition-colors"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={`transition-transform duration-200 text-slate-400 ${
              isSmall ? "h-3.5 w-3.5" : "h-4 w-4"
            } ${isOpen ? "rotate-180 text-violet-600" : ""}`}
          />
        </div>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              bottom: coords.bottom,
              width: Math.max(coords.width, 200),
              zIndex: 9999
            }}
            className={`bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150 ${
              coords.placeAbove ? "origin-bottom" : "origin-top"
            }`}
          >
            {/* Search Input */}
            {searchable && normalizedOptions.length > 5 && (
              <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (filteredOptions.length > 0) {
                          handleSelect(filteredOptions[0].value);
                        }
                      }
                    }}
                    placeholder={
                      searchPlaceholder ||
                      `Search ${placeholder.replace(/^Select\s*/i, "").replace(/\.+$/, "")}...`
                    }
                    className="h-8 w-full pl-8 pr-7 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div
              style={{ maxHeight: coords.maxHeight - (searchable && normalizedOptions.length > 5 ? 50 : 0) }}
              className="overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar"
            >
              {allOptionLabel && (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                    !value
                      ? "bg-violet-50 text-violet-700 border border-violet-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-violet-600"
                  }`}
                >
                  <span>{allOptionLabel}</span>
                  {!value && <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 font-medium">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                        isSelected
                          ? "bg-violet-50 text-violet-700 font-bold border border-violet-100 shadow-xs"
                          : "text-slate-700 hover:bg-slate-50 hover:text-violet-600"
                      }`}
                    >
                      <span className="truncate pr-2">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
