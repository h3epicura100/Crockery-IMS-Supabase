import React from 'react';
import { Calendar, ClipboardList, Download, FileText, Loader2 } from 'lucide-react';
import { formatDate } from '../../utils/helpers';

const PartyCard = ({ partyName, eventDate, totalQty, totalCost, isDownloading, onDownloadReport, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group relative bg-gradient-to-br from-violet-50/80 via-fuchsia-50/45 to-white border border-violet-100/80 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-violet-200/80 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer flex flex-col justify-between h-full select-none"
    >
      <div>
        {/* Top Section */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-extrabold text-violet-600 uppercase tracking-widest mb-1">Party</p>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight truncate group-hover:text-violet-750 transition-colors">
              {partyName}
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isDownloading) return;
              onDownloadReport();
            }}
            disabled={isDownloading}
            title="Download Issue Report"
            className="flex items-center justify-center h-9 w-9 bg-white text-violet-600 border border-violet-100 rounded-xl hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-all shadow-sm active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin text-violet-600" />
            ) : (
              <Download className="h-4.5 w-4.5" />
            )}
          </button>
        </div>

        {/* Content Section */}
        <div className="space-y-3">
          {/* Event Date */}
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <div className="flex items-center justify-center h-6.5 w-6.5 bg-violet-100/70 rounded-lg text-violet-600">
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Event Date</span>
              <span className="font-bold text-slate-700">{formatDate(eventDate)}</span>
            </div>
          </div>

          {/* Total Quantity */}
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <div className="flex items-center justify-center h-6.5 w-6.5 bg-fuchsia-100/70 rounded-lg text-fuchsia-600">
              <ClipboardList className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="font-semibold text-slate-400 block text-[9px] uppercase tracking-wider">Total Quantity</span>
              <span className="font-bold text-slate-700">{totalQty} items</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Cost */}
      <div className="mt-5 pt-4 border-t border-slate-100/60 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Cost</span>
        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100/40 rounded-xl text-base font-extrabold font-mono">
          ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
};

export default PartyCard;
