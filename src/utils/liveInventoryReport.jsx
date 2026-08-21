import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadImageAsBase64 } from './imageBase64';

// PDF column metadata per Dashboard "Today" column key: header label, relative width
// weight (widths are distributed proportionally across the printable page width) and
// text alignment. Only keys present here can ever end up in the exported table.
const COLUMN_DEFS = {
  serial: { header: 'S.No', weight: 0.7, align: 'center' },
  type: { header: 'Inventory Type', weight: 1.3, align: 'center' },
  department: { header: 'Department', weight: 1.4, align: 'center' },
  itemName: { header: 'Items Name', weight: 2.2, align: 'left' },
  purchase: { header: 'Total Purchased', weight: 1.1, align: 'center' },
  opening: { header: 'Opening Balance', weight: 1.1, align: 'center' },
  closing: { header: 'Closing Balance', weight: 1.1, align: 'center' },
  issue: { header: 'Total Issue', weight: 1.0, align: 'center' },
  returns: { header: 'Total Return', weight: 1.0, align: 'center' },
  damage: { header: 'Total Damage', weight: 1.0, align: 'center' },
  missing: { header: 'Total Missing', weight: 1.0, align: 'center' },
  image: { header: 'Image', weight: 1.3, align: 'center' }
};

// Reads the value for a given column key off a Dashboard inventory item
// (shape produced by fetchDashboardData in Dashboard.jsx).
const getItemValue = (item, key, idx) => {
  switch (key) {
    case 'serial': return item.serial || idx + 1;
    case 'type': return item.type || '-';
    case 'department': return item.department || '-';
    case 'itemName': return item.name || '-';
    case 'purchase': return item.purchase ?? 0;
    case 'opening': return item.opening ?? 0;
    case 'closing': return item.closing ?? 0;
    case 'issue': return item.issue ?? 0;
    case 'returns': return item.returns ?? 0;
    case 'damage': return item.damage ?? 0;
    case 'missing': return item.missing ?? 0;
    case 'image': return item.imageUrl || '';
    default: return '-';
  }
};

/**
 * Generates and downloads an A4 PDF of the Dashboard "Today" inventory table,
 * honoring the user's current column-visibility toggles and any active
 * search/filter selections, including item images (fetched as base64 from
 * Drive via the Apps Script backend, same as the Inventory page's party report).
 *
 * @param {Object} opts
 * @param {Array<Object>} opts.data - Rows to export, already filtered/searched (Dashboard's filteredData)
 * @param {Array<{key: string, label: string}>} opts.columnConfig - Dashboard's todayColumns, in display order
 * @param {Object<string, boolean>} opts.visibleColumns - Dashboard's visibleColumns toggle state
 * @param {string} [opts.filterSummary] - Optional human-readable line describing active filters, printed under the title
 * @returns {Promise<void>} resolves once the PDF has been handed to the browser for download
 */
export const generateLiveInventoryReport = async ({
  data,
  columnConfig,
  visibleColumns,
  filterSummary = ''
}) => {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const activeCols = columnConfig.filter(col => visibleColumns[col.key] && COLUMN_DEFS[col.key]);
  if (activeCols.length === 0) {
    throw new Error('No columns selected — enable at least one column to export');
  }

  const hasImageCol = activeCols.some(c => c.key === 'image');

  // Today's table can have up to 13 columns visible at once — landscape gives
  // autoTable enough width to keep every column readable instead of squeezing.
  const orientation = activeCols.length > 7 ? 'l' : 'p';
  const doc = new jsPDF(orientation, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const margin = { top: 22, right: 6, bottom: 14, left: 6 };
  const availableWidth = pageWidth - margin.left - margin.right;

  // Distribute the printable width across visible columns by relative weight
  // so it always fills exactly one A4 page width regardless of which/how many
  // columns the user has toggled on.
  const totalWeight = activeCols.reduce((sum, c) => sum + COLUMN_DEFS[c.key].weight, 0);
  const columnStyles = {};
  activeCols.forEach(col => {
    columnStyles[col.key] = {
      cellWidth: (COLUMN_DEFS[col.key].weight / totalWeight) * availableWidth,
      halign: COLUMN_DEFS[col.key].align
    };
  });

  // Preload every distinct image once (deduped by URL) before drawing the table.
  const imageMap = {};
  if (hasImageCol) {
    const urls = [...new Set(data.map(item => item.imageUrl).filter(url => url && url !== 'No Image'))];
    const results = await Promise.all(urls.map(async (url) => ({ url, b64: await loadImageAsBase64(url) })));
    results.forEach(({ url, b64 }) => { if (b64) imageMap[url] = b64; });
  }

  const columns = activeCols.map(col => ({ header: COLUMN_DEFS[col.key].header, dataKey: col.key }));
  const body = data.map((item, idx) => {
    const row = {};
    activeCols.forEach(col => { row[col.key] = getItemValue(item, col.key, idx); });
    return row;
  });

  // Title + record count
  doc.setFontSize(16);
  doc.setTextColor(109, 40, 217);
  doc.setFont(undefined, 'bold');
  doc.text('LIVE INVENTORY REPORT', 14, 12);

  const titleWidth = doc.getTextWidth('LIVE INVENTORY REPORT ');
  doc.setFontSize(12);
  doc.setTextColor(150, 150, 150);
  doc.setFont(undefined, 'normal');
  doc.text(`(${data.length})`, 14 + titleWidth, 12);

  // Generated-on timestamp
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

  // Applied filters, if any
  if (filterSummary) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(filterSummary, 14, 18);
  }

  autoTable(doc, {
    startY: filterSummary ? 23 : 18,
    columns,
    body,
    theme: 'grid',
    columnStyles,
    headStyles: {
      fillColor: [109, 40, 217],
      textColor: 255,
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 2.5,
      overflow: 'linebreak'
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: 'center',
      valign: 'middle',
      overflow: 'ellipsize',
      minCellHeight: hasImageCol ? 14 : 8
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    rowPageBreak: 'avoid',
    margin,
    willDrawCell: (cellData) => {
      // Suppress the raw URL text for image cells — didDrawCell paints the actual image instead.
      if (cellData.column.dataKey === 'image' && cellData.cell.section === 'body') {
        cellData.cell.text = [];
      }
    },
    didDrawCell: (cellData) => {
      if (cellData.column.dataKey === 'image' && cellData.cell.section === 'body') {
        const url = cellData.cell.raw;
        const b64 = imageMap[url];
        if (b64) {
          const padding = 1.5;
          const imgSize = Math.min(cellData.cell.width - padding * 2, cellData.cell.height - padding * 2, 10);
          const x = cellData.cell.x + (cellData.cell.width - imgSize) / 2;
          const y = cellData.cell.y + (cellData.cell.height - imgSize) / 2;
          try {
            doc.addImage(b64, 'JPEG', x, y, imgSize, imgSize);
          } catch {
            // ignore image render errors — leave the cell blank rather than fail the whole export
          }
        }
      }
    },
    didDrawPage: function () {
      const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(9);
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

  doc.save(`Live_Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};
