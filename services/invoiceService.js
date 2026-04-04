const PDFDocument = require('pdfkit');

const generateInvoice = async (order) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    // Collect data chunks
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Constants for layout
    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 842;
    const MARGIN = 40;
    const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
    // Formatting helper (Indian Number System)
    const formatCurrency = (amount) => `Rs. ${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // 1. HEADER SECTION
    // Logo styling
    doc.image('public/img/Image.PNG', MARGIN - 15, MARGIN - 20, { width: 120 });
    
    // Invoice Title (Right aligned)
    doc.fontSize(28)
       .font('Helvetica-Bold')
       .fillColor('#895D39')
       .text('INVOICE', PAGE_WIDTH - MARGIN - 150, MARGIN, { width: 150, align: 'right' });

    // Invoice Details (Right aligned under title)
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#555555')
       .text(`Invoice No: ${order.orderID || order.invoiceNumber}`, PAGE_WIDTH - MARGIN - 200, MARGIN + 35, { width: 200, align: 'right' })
       .text(`Date: ${order.createdOn.toLocaleDateString('en-IN')}`, PAGE_WIDTH - MARGIN - 200, MARGIN + 50, { width: 200, align: 'right' })
       .text(`Payment Method: ${order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod}`, PAGE_WIDTH - MARGIN - 200, MARGIN + 65, { width: 200, align: 'right' });

    // Header Divider
    doc.moveTo(MARGIN, 140)
       .lineTo(PAGE_WIDTH - MARGIN, 140)
       .strokeColor('#dddddd')
       .lineWidth(1)
       .stroke();

    // 2. ADDRESS SECTION
    const addressTop = 160;
    
    // From section
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('FROM:', MARGIN, addressTop)
       .font('Helvetica')
       .fillColor('#555555')
       .text('Jordan Express', MARGIN, addressTop + 15)
       .text('123 Sneaker Street', MARGIN, addressTop + 30)
       .text('New York, NY 10001', MARGIN, addressTop + 45)
       .text('Phone: (123) 456-7890', MARGIN, addressTop + 60)
       .text('Email: info@jordanexpress.com', MARGIN, addressTop + 75);

    // To section
    const rightColLeft = PAGE_WIDTH / 2;
    const address = order.address || {};
    
    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('BILL TO:', rightColLeft, addressTop)
       .font('Helvetica')
       .fillColor('#555555')
       .text(address.label || 'N/A', rightColLeft, addressTop + 15)
       .text(address.street || 'N/A', rightColLeft, addressTop + 30)
       .text(`${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}`, rightColLeft, addressTop + 45)
       .text(address.country || 'N/A', rightColLeft, addressTop + 60)
       .text(`Phone: ${address.phone || 'N/A'}`, rightColLeft, addressTop + 75);

    // 3. ITEMS TABLE
    let tableTop = 270;
    
    const colX = {
      product: MARGIN,
      size: MARGIN + 200,
      qty: MARGIN + 250,
      basePrice: MARGIN + 300,
      gst: MARGIN + 380,
      amount: MARGIN + 450
    };
    
    const colW = {
      product: 190,
      size: 40,
      qty: 40,
      basePrice: 70,
      gst: 60,
      amount: 65
    };

    // Table Header Background
    doc.rect(MARGIN, tableTop, CONTENT_WIDTH, 25)
       .fill('#f8f9fa');

    // Table Header Text
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Product Name', colX.product + 5, tableTop + 8, { width: colW.product, align: 'left' })
       .text('Size', colX.size, tableTop + 8, { width: colW.size, align: 'center' })
       .text('Qty', colX.qty, tableTop + 8, { width: colW.qty, align: 'center' })
       .text('Base Price', colX.basePrice, tableTop + 8, { width: colW.basePrice, align: 'right' })
       .text('GST (18%)', colX.gst, tableTop + 8, { width: colW.gst, align: 'right' })
       .text('Amount', colX.amount, tableTop + 8, { width: colW.amount, align: 'right' });

    let currentY = tableTop + 35;

    // Table Rows
    doc.font('Helvetica')
       .fillColor('#555555')
       .fontSize(9);

    order.orderItems.forEach(item => {
      // Skip cancelled or returned items if necessary, assuming all are shown on invoice
      const amount = item.price * item.quantity;
      const basePrice = amount / 1.18;
      const gstAmount = amount - basePrice;
      const size = item.size || 'N/A';
      const productName = item.product.productName || 'Unknown Item';

      // Height calculation for wrapping text
      const nameHeight = doc.heightOfString(productName, { width: colW.product - 10 });
      const rowHeight = Math.max(nameHeight, 15) + 10; // 10 is padding

      // Check for page break
      if (currentY + rowHeight > PAGE_HEIGHT - 150) {
        doc.addPage();
        currentY = MARGIN;
      }

      // Draw bottom border for the row
      doc.moveTo(MARGIN, currentY + rowHeight - 5)
         .lineTo(PAGE_WIDTH - MARGIN, currentY + rowHeight - 5)
         .strokeColor('#eeeeee')
         .lineWidth(1)
         .stroke();

      doc.text(productName, colX.product + 5, currentY, { width: colW.product - 10, align: 'left' })
         .text(size, colX.size, currentY, { width: colW.size, align: 'center' })
         .text(item.quantity.toString(), colX.qty, currentY, { width: colW.qty, align: 'center' })
         .text(formatCurrency(basePrice), colX.basePrice, currentY, { width: colW.basePrice, align: 'right' })
         .text(formatCurrency(gstAmount), colX.gst, currentY, { width: colW.gst, align: 'right' })
         .text(formatCurrency(amount), colX.amount, currentY, { width: colW.amount, align: 'right' });

      currentY += rowHeight;
    });

    // 4. SUMMARY SECTION
    const summaryTop = currentY + 20;

    // Check for page break before summary
    if (summaryTop + 150 > PAGE_HEIGHT - MARGIN) {
        doc.addPage();
        currentY = MARGIN;
    } else {
        currentY = summaryTop;
    }

    const summaryLeft = PAGE_WIDTH - MARGIN - 250;
    const summaryRight = PAGE_WIDTH - MARGIN;

    const subtotal = order.totalPrice;
    const deliveryCharge = order.deliveryCharge || 0;
    const discount = order.discount || 0;
    const totalAmount = subtotal + deliveryCharge - discount;
    const baseSubtotal = subtotal / 1.18;
    const gstSubtotal = subtotal - baseSubtotal;

    doc.fontSize(10)
       .font('Helvetica');

    const addSummaryRow = (label, value, y, isBold = false) => {
        if (isBold) {
            doc.font('Helvetica-Bold').fillColor('#333333');
        } else {
            doc.font('Helvetica').fillColor('#555555');
        }
        doc.text(label, summaryLeft, y, { width: 140, align: 'right' })
           .text(formatCurrency(value), summaryLeft + 150, y, { width: 100, align: 'right' });
    };

    addSummaryRow('Subtotal (Excl. GST):', baseSubtotal, currentY);
    addSummaryRow('GST (18%) on Subtotal:', gstSubtotal, currentY + 18);
    addSummaryRow('Subtotal (Incl. GST):', subtotal, currentY + 36);
    addSummaryRow('Delivery Charge:', deliveryCharge, currentY + 54);

    let totalY = currentY + 72;

    if (discount > 0) {
        doc.fillColor('#e74c3c');
        doc.text('Discount:', summaryLeft, totalY, { width: 140, align: 'right' })
           .text(`- ${formatCurrency(discount)}`, summaryLeft + 150, totalY, { width: 100, align: 'right' });
        totalY += 18;
    }

    // Divider before total
    doc.moveTo(summaryLeft + 50, totalY)
       .lineTo(summaryRight, totalY)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();

    // Total Background Box
    doc.rect(summaryLeft + 20, totalY + 10, 230, 30)
       .fill('#f8f9fa');

    // Total Text
    doc.fillColor('#895D39')
       .font('Helvetica-Bold')
       .fontSize(12)
       .text('Total (Incl. GST):', summaryLeft, totalY + 18, { width: 140, align: 'right' })
       .text(formatCurrency(totalAmount), summaryLeft + 150, totalY + 18, { width: 100, align: 'right' });

    // 5. FOOTER SECTION
    const footerTop = PAGE_HEIGHT - MARGIN - 40;
    
    // Top border for footer
    doc.moveTo(MARGIN, footerTop - 15)
       .lineTo(PAGE_WIDTH - MARGIN, footerTop - 15)
       .strokeColor('#dddddd')
       .lineWidth(1)
       .stroke();

    doc.font('Helvetica')
       .fontSize(9)
       .fillColor('#888888')
       .text('Thank you for your business!', MARGIN, footerTop, { width: CONTENT_WIDTH, align: 'center' })
       .text('For any inquiries regarding this invoice, please contact support@jordanexpress.com', MARGIN, footerTop + 12, { width: CONTENT_WIDTH, align: 'center' });

    doc.end();
  });
};

module.exports = { generateInvoice };