// services/invoiceService.js
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
    const PAGE_WIDTH = 595; // A4 width in points
    const LEFT_MARGIN = 20;
    const RIGHT_MARGIN = 20;
    const CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
    const CENTER_X = LEFT_MARGIN + (CONTENT_WIDTH / 2);
    const LINE_GAP = 15;

    // Set a font that supports the Rupee symbol
    doc.font('Times-Roman');

    // Header with logo and invoice info
    doc.image('public/image/JD-new.png', LEFT_MARGIN - 20, -5, { width: 100 })
       .fontSize(20)
       .fillColor('#444444')
       .text('INVOICE', 0, 40, { align: 'center' })
       .fontSize(10)
       .text(`Invoice #: ${order.orderID}`, PAGE_WIDTH - RIGHT_MARGIN - 100, 35, { width: 100, align: 'right' })
       .text(`Date: ${order.createdOn.toLocaleDateString()}`, PAGE_WIDTH - RIGHT_MARGIN - 100, 85, { width: 100, align: 'right' });

    // Company and Customer Info
    const infoTop = 140;
    const infoWidth = CONTENT_WIDTH / 2 - 20;

    // Company Info (left)
    doc.fontSize(10)
       .font('Times-Bold')
       .text('FROM:', LEFT_MARGIN, infoTop, { width: infoWidth, align: 'left' })
       .font('Times-Roman')
       .text('Jordan Express', LEFT_MARGIN, infoTop + LINE_GAP, { width: infoWidth, align: 'left' })
       .text('123 Sneaker Street', LEFT_MARGIN, infoTop + LINE_GAP * 2, { width: infoWidth, align: 'left' })
       .text('New York, NY 10001', LEFT_MARGIN, infoTop + LINE_GAP * 3, { width: infoWidth, align: 'left' })
       .text('Phone: (123) 456-7890', LEFT_MARGIN, infoTop + LINE_GAP * 4, { width: infoWidth, align: 'left' })
       .text('Email: info@jordanexpress.com', LEFT_MARGIN, infoTop + LINE_GAP * 5, { width: infoWidth, align: 'left' });

    // Customer Info (right)
    doc.font('Times-Bold')
       .text('BILL TO:', CENTER_X + 10, infoTop, { width: infoWidth, align: 'right' })
       .font('Times-Roman')
       .text(order.address.label || 'N/A', CENTER_X + 10, infoTop + LINE_GAP, { width: infoWidth, align: 'right' })
       .text(order.address.street || 'N/A', CENTER_X + 10, infoTop + LINE_GAP * 2, { width: infoWidth, align: 'right' })
       .text(`${order.address.city || 'N/A'}, ${order.address.state || 'N/A'} ${order.address.zipCode || 'N/A'}`, CENTER_X + 10, infoTop + LINE_GAP * 3, { width: infoWidth, align: 'right' })
       .text(order.address.country || 'N/A', CENTER_X + 10, infoTop + LINE_GAP * 4, { width: infoWidth, align: 'right' })
       .text(`Phone: ${order.address.phone || 'N/A'}`, CENTER_X + 10, infoTop + LINE_GAP * 5, { width: infoWidth, align: 'right' });

    // Payment Method
    doc.fontSize(10)
       .text(`Payment Method: ${order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod}`, 
             0, infoTop + LINE_GAP * 7, { width: PAGE_WIDTH, align: 'center' });

    // Items Table
    const tableTop = infoTop + LINE_GAP * 9;
    const tableWidth = CONTENT_WIDTH;
    const columnWidths = {
      item: 200,
      size: 80,
      qty: 60,
      price: 80,
      amount: 100
    };
    const tableLeft = CENTER_X - (tableWidth / 2);

    // Table Header
    doc.font('Times-Bold')
       .fontSize(10)
       .text('Item', tableLeft, tableTop, { width: columnWidths.item, align: 'left' })
       .text('Size', tableLeft + columnWidths.item, tableTop, { width: columnWidths.size, align: 'center' })
       .text('Qty', tableLeft + columnWidths.item + columnWidths.size, tableTop, { width: columnWidths.qty, align: 'right' })
       .text('Price', tableLeft + columnWidths.item + columnWidths.size + columnWidths.qty, tableTop, { width: columnWidths.price, align: 'right' })
       .text('Amount', tableLeft + columnWidths.item + columnWidths.size + columnWidths.qty + columnWidths.price, tableTop, { width: columnWidths.amount, align: 'right' })
       .moveTo(tableLeft, tableTop + LINE_GAP)
       .lineTo(tableLeft + tableWidth, tableTop + LINE_GAP)
       .stroke();

    // Table Rows
    let currentY = tableTop + LINE_GAP + 10;
    order.orderItems.forEach(item => {
      const amount = item.price * item.quantity;
      const size = item.size || 'N/A';
      doc.font('Times-Roman')
         .fontSize(9)
         .text(item.product.productName || 'Unknown Item', tableLeft, currentY, { width: columnWidths.item, align: 'left' })
         .text(size, tableLeft + columnWidths.item, currentY, { width: columnWidths.size, align: 'center' })
         .text(item.quantity.toString(), tableLeft + columnWidths.item + columnWidths.size, currentY, { width: columnWidths.qty, align: 'right' })
         .text(`${item.price.toFixed(2)}`, tableLeft + columnWidths.item + columnWidths.size + columnWidths.qty, currentY, { width: columnWidths.price, align: 'right' })
         .text(`${amount.toFixed(2)}`, tableLeft + columnWidths.item + columnWidths.size + columnWidths.qty + columnWidths.price, currentY, { width: columnWidths.amount, align: 'right' });
      currentY += LINE_GAP;
    });

    // Summary
    const summaryTop = Math.max(currentY + 20, 500);
    const summaryWidth = 200;
    const summaryLeft = PAGE_WIDTH - RIGHT_MARGIN - summaryWidth;
    
    let summaryY = summaryTop;
    
    // Define subtotal and delivery charge
    const subtotal = order.totalPrice;
    const deliveryCharge = order.deliveryCharge || 0;
    
    const summaryItems = [
      ['Subtotal:', subtotal],
      ['Delivery Charge:', deliveryCharge]
    ];
    
    if (order.discount > 0) {
      summaryItems.push(['Discount:', -order.discount]);
    }

    doc.font('Times-Roman')
       .fontSize(10);
    
    summaryItems.forEach(([label, value]) => {
      doc.text(label, summaryLeft, summaryY, { width: 100, align: 'right' })
         .text(`${value.toFixed(2)}`, summaryLeft + 100, summaryY, { width: 100, align: 'right' });
      summaryY += LINE_GAP;
    });

    // Calculate the total
    const totalAmount = subtotal + deliveryCharge - (order.discount || 0);

    doc.moveTo(summaryLeft, summaryY + 5)
       .lineTo(summaryLeft + summaryWidth, summaryY + 5)
       .stroke()
       .font('Times-Bold')
       .text('Total:', summaryLeft, summaryY + 15, { width: 100, align: 'right' })
       .text(`${totalAmount.toFixed(2)}`, summaryLeft + 100, summaryY + 15, { width: 100, align: 'right' });

    // Footer
    const footerTop = summaryY + 200;
    doc.font('Times-Italic')
       .fontSize(8)
       .text('Thank you for your purchase!', 0, footerTop, { width: PAGE_WIDTH, align: 'center' })
       .text('Please contact us at support@jordanexpress.com for any questions', 0, footerTop + LINE_GAP, { width: PAGE_WIDTH, align: 'center' });

    doc.end();
  });
};

module.exports = { generateInvoice };