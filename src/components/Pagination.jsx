import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({
  currentPage = 1,
  totalCount = 0,
  pageSize = 50,
  onPageChange,
  isLoading = false,
  className = ""
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount <= pageSize) {
    return null;
  }

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = () => {
    const pages = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let leftBound = Math.max(2, currentPage - 1);
      let rightBound = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        rightBound = 4;
      } else if (currentPage >= totalPages - 2) {
        leftBound = totalPages - 3;
      }

      if (leftBound > 2) {
        pages.push('ellipsis-start');
      }

      for (let i = leftBound; i <= rightBound; i++) {
        pages.push(i);
      }

      if (rightBound < totalPages - 1) {
        pages.push('ellipsis-end');
      }

      pages.push(totalPages);
    }
    return pages;
  };

  const pages = getPageNumbers();

  const handlePageClick = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !isLoading) {
      onPageChange(page);
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-100 rounded-b-xl select-none ${className}`}>
      <div className="text-xs text-slate-500 font-medium">
        Showing <span className="font-bold text-slate-800">{startRecord.toLocaleString()}</span> to <span className="font-bold text-slate-800">{endRecord.toLocaleString()}</span> of <span className="font-bold text-slate-800">{totalCount.toLocaleString()}</span> entries
      </div>

      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          onClick={() => handlePageClick(1)}
          disabled={currentPage === 1 || isLoading}
          title="First Page"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Prev Page */}
        <button
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          title="Previous Page"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Number buttons */}
        <div className="flex items-center gap-1 mx-1">
          {pages.map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-1 text-slate-300 text-xs font-bold select-none"
                >
                  •••
                </span>
              );
            }
            const isActive = p === currentPage;
            return (
              <button
                key={p}
                onClick={() => handlePageClick(p)}
                disabled={isLoading}
                className={`h-8 min-w-[32px] px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                    : 'text-slate-600 hover:bg-violet-50 hover:text-violet-600'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          title="Next Page"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => handlePageClick(totalPages)}
          disabled={currentPage === totalPages || isLoading}
          title="Last Page"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors cursor-pointer"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
